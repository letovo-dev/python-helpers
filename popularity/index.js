const Docker = require('dockerode');
const express = require('express');
const cron = require('node-cron');
const cors = require('cors');

const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const app = express();
app.use(cors());

// Configuration: container name and endpoints to ignore
const CONTAINER_NAME = 'letovo-server';
const ignoreList = [
  '/media/get/:filename',
  '/auth/login'
];

// In-memory storage for raw counts and history
let endpointCounts = {};
const history = []; // Array of snapshots { time, data, total }
const WINDOW_SIZE = 30; // keep last 30 snapshots (~1h)

// Function to read logs and update counts
async function fetchLogs() {
  try {
    const container = docker.getContainer(CONTAINER_NAME);
    const since = Math.floor(Date.now() / 1000) - 120;
    const logStream = await container.logs({ stdout: true, stderr: false, since });

    logStream.on('data', chunk => {
      const lines = chunk.toString('utf8').split('\n');
      lines.forEach(line => {
        // новый формат: [timestamp] TRACE: called /auth/login
        const match = line.match(/called\s+\/(?<endpoint>[\w\/-]+)/);
        if (match && match.groups) {
          const raw = match.groups.endpoint;
          // берем конечную часть пути, например auth/login -> auth/login или для deeper без изменений
          const endpoint = raw;
          if (!ignoreList.includes(endpoint)) {
            endpointCounts[endpoint] = (endpointCounts[endpoint] || 0) + 1;
          }
        }
      });
    });
    logStream.on('end', () => {
      const total = Object.values(endpointCounts).reduce((a, b) => a + b, 0);
      const snapshot = { time: new Date(), data: { ...endpointCounts }, total };
      history.push(snapshot);
      if (history.length > WINDOW_SIZE) history.shift();
    });
  } catch (err) {
    console.error('Error fetching logs', err);
  }
}

// Compute additional statistics
function computeStats() {
  const totalRequests = Object.values(endpointCounts).reduce((a, b) => a + b, 0);
  const endpoints = Object.entries(endpointCounts)
    .map(([name, count]) => ({ name, count, percent: ((count / totalRequests) * 100).toFixed(1) }))
    .sort((a, b) => b.count - a.count);

  // Max total requests in any snapshot
  const maxWindow = history.reduce((max, snap) => Math.max(max, snap.total), 0);

  return {
    totalRequests,
    maxWindow,
    topEndpoints: endpoints.slice(0, 5),
    distribution: endpoints
  };
}

// Schedule log fetch every 2 minutes
ecron.schedule('*/2 * * * *', () => fetchLogs());

// APIs
app.get('/counts', (req, res) => res.json(endpointCounts));
app.get('/stats', (req, res) => res.json(computeStats()));
app.get('/history', (req, res) => res.json(history));

// Serve static frontend
app.use(express.static('public'));
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
