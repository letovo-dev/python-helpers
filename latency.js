const express = require('express')
const http = require('http')
const WebSocket = require('ws')
const fetch = require('node-fetch')

const fs = require('fs');
const DATA_FILE = 'latency_data.jsonl';

const MAX_STORAGE_TIME_MS = 24 * 60 * 60 * 1000; // сутки
let measureCount = 0;


const NAMES = [
  'scv',
  'admin',
  'terminal',
  'user'
]

const BASE_URL = 'https://letovocorp.ru/api/auth/isactive/'
const POLL_INTERVAL = 5000
const MAX_POINTS = 1000

let latencyData = []

const app = express()
const server = http.createServer(app)
const wss = new WebSocket.Server({ server })

app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Latency Monitor (Dark)</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/luxon@3/build/global/luxon.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-luxon@1"></script>
  <style>
    body { background-color: #1e1e1e; color: #ccc; }
    canvas { background-color: #2e2e2e; }
  </style>
</head>
<body>
  <h2>Latency Monitor</h2>
  <canvas id="latencyChart" width="800" height="400"></canvas>
  <script>
    const ctx = document.getElementById('latencyChart').getContext('2d');
    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Avg 5s',
            data: [],
            borderWidth: 2,
            fill: false,
            borderColor: 'rgba(0,255,0,1)',
          },
          {
            label: 'Avg 1min',
            data: [],
            borderWidth: 2,
            fill: false,
            borderColor: 'rgba(0,255,0,1)',
          },
          {
            label: 'Avg 1h',
            data: [],
            borderWidth: 2,
            fill: false,
            borderColor: 'rgba(0,255,0,1)',
          },
        ]
      },
      options: {
        animation: false,
        plugins: {
          legend: {
            labels: { color: '#ccc' },
            display: true,
            position: 'top'
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const point = context.raw;
                const label = context.dataset.label || '';
                const latency = point.y;
                const reqInfo = point.customData || 'n/a';
                return label + ': ' + latency.toFixed(1) + ' ms | ' + reqInfo;
              }
            }
          }
        },
        scales: {
          x: {
            type: 'time',
            time: {
              unit: 'minute',
              displayFormats: { minute: 'HH:mm:ss' }
            },
            ticks: {
              color: '#ccc'
            },
            grid: { color: '#444' }
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Latency (ms)', color: '#ccc' },
            ticks: { color: '#ccc' },
            grid: { color: '#444' }
          }
        }
      }
    });

    const socket = new WebSocket('ws://' + location.host);
  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    const points = msg.averages;

    chart.data.datasets[0].data = points.map(p => ({ x: new Date(p.time), y: p.avg5s, customData: p.reqInfo }));
    chart.data.datasets[1].data = points.map(p => ({ x: new Date(p.time), y: p.avg1min, customData: p.reqInfo }));
    chart.data.datasets[2].data = points.map(p => ({ x: new Date(p.time), y: p.avg1h, customData: p.reqInfo }));

    if (points.length > 0) {
      const latestTime = new Date(points[points.length - 1].time).getTime();
      const RANGE = 5 * 60 * 1000; // 5 минут в мс
      chart.options.scales.x.min = latestTime - RANGE;
      chart.options.scales.x.max = latestTime;
    }

    chart.data.datasets[0].borderColor = msg.colors[0];
    chart.data.datasets[1].borderColor = msg.colors[1];
    chart.data.datasets[2].borderColor = msg.colors[2];
    chart.update();
  };
  </script>
</body>
</html>`);
});

app.get('/history', (req, res) => {
  const timeParam = parseInt(req.query.time || '60'); // по умолчанию 60 минут
  const timeRangeMs = timeParam * 60 * 1000;
  const now = Date.now();
  const points = [];

  if (!fs.existsSync(DATA_FILE)) {
    return res.send('No data available.');
  }

  const lines = fs.readFileSync(DATA_FILE, 'utf8').split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const point = JSON.parse(line);
      const pointTime = new Date(point.time).getTime();
      if (now - pointTime <= timeRangeMs) {
        points.push(point);
      }
    } catch (e) {
      console.error('Error parsing history line:', e.message);
    }
  }

  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Latency History (Last ${timeParam} min)</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/luxon@3/build/global/luxon.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-luxon@1"></script>
  <style>
    body { background-color: #1e1e1e; color: #ccc; }
    canvas { background-color: #2e2e2e; }
  </style>
</head>
<body>
  <h2>Latency History - Last ${timeParam} minutes</h2>
  <canvas id="latencyChart" width="800" height="400"></canvas>
  <script>
    const ctx = document.getElementById('latencyChart').getContext('2d');
    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Latency',
            data: [],
            borderWidth: 2,
            fill: false,
            borderColor: 'rgba(0,200,255,1)',
          }
        ]
      },
      options: {
        animation: false,
        plugins: {
          legend: {
            labels: { color: '#ccc' },
            display: true,
            position: 'top'
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const point = context.raw;
                const latency = point.y;
                const reqInfo = point.customData || 'n/a';
                return 'Latency: ' + latency.toFixed(1) + ' ms | ' + reqInfo;
              }
            }
          }
        },
        scales: {
          x: {
            type: 'time',
            time: {
              unit: 'minute',
              displayFormats: { minute: 'HH:mm:ss' }
            },
            ticks: { color: '#ccc' },
            grid: { color: '#444' }
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Latency (ms)', color: '#ccc' },
            ticks: { color: '#ccc' },
            grid: { color: '#444' }
          }
        }
      }
    });

    const dataPoints = ${JSON.stringify(points)};
    chart.data.datasets[0].data = dataPoints.map(p => ({ x: new Date(p.time), y: p.latency, customData: p.reqInfo }));
    if (dataPoints.length > 0) {
      const latestTime = new Date(dataPoints[dataPoints.length - 1].time).getTime();
      const RANGE = ${timeParam} * 60 * 1000;
      chart.options.scales.x.min = latestTime - RANGE;
      chart.options.scales.x.max = latestTime;
    }
    chart.update();
  </script>
</body>
</html>`);
});


wss.on('connection', ws => {
  console.log('Client connected');
  ws.send(JSON.stringify({ averages: calculateAverages(latencyData), colors: ['rgba(0,255,0,1)', 'rgba(0,200,0,1)', 'rgba(0,150,0,1)'] }));
});

function measureLatency() {
  const startTime = Date.now();
  const TARGET_URL = BASE_URL + NAMES[Math.floor(Math.random() * NAMES.length)];
  fetch(TARGET_URL, { method: 'GET' })
    .then(res => res.text().then(body => ({ res, body })))
    .then(({ res }) => {
      const latency = Date.now() - startTime;
      const point = {
        time: new Date(),
        latency,
        reqInfo: `GET ${TARGET_URL} → ${res.status}`,
        status: res.status
      };
      latencyData.push(point);
      if (latencyData.length > MAX_POINTS) latencyData.shift();

      measureCount++;
      if (measureCount % 100 === 0) {
        pruneOldData();
      }

      fs.appendFile(DATA_FILE, JSON.stringify(point) + '\n', (err) => {
        if (err) console.error('Error writing data file:', err.message);
      });

      const averages = calculateAverages(latencyData);
      const colors = statusToColors(res.status);
      const dataToSend = JSON.stringify({ averages, colors });
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(dataToSend);
        }
      });
      console.log(`[${point.time.toISOString()}] latency: ${latency} ms, status: ${res.status}`);
    })
    .catch(err => {
      const latency = Date.now() - startTime;
      const point = {
        time: new Date(),
        latency,
        reqInfo: `GET ${TARGET_URL} → ERROR: ${err.message}`,
        status: 0
      };
      latencyData.push(point);
      if (latencyData.length > MAX_POINTS) latencyData.shift();

      const averages = calculateAverages(latencyData);
      const colors = statusToColors(0);
      const dataToSend = JSON.stringify({ averages, colors });
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(dataToSend);
        }
      });
      console.error('Fetch error:', err.message);
    });
}

function calculateAverages(data) {
  return data.map((_, idx) => {
    const slice5s = data.slice(Math.max(0, idx-0), idx+1);
    const slice1min = data.slice(Math.max(0, idx-11), idx+1);
    const slice1h = data.slice(Math.max(0, idx-719), idx+1);

    const avg5s = average(slice5s.map(p => p.latency));
    const avg1min = average(slice1min.map(p => p.latency));
    const avg1h = average(slice1h.map(p => p.latency));

    return {
      time: data[idx].time,
      avg5s,
      avg1min,
      avg1h,
      reqInfo: data[idx].reqInfo
    };
  });
}

function pruneOldData() {
  if (!fs.existsSync(DATA_FILE)) return;
  const now = Date.now();
  try {
    const lines = fs.readFileSync(DATA_FILE, 'utf8').split('\n');
    const recentLines = lines.filter(line => {
      if (!line.trim()) return false;
      try {
        const point = JSON.parse(line);
        const pointTime = new Date(point.time).getTime();
        return now - pointTime <= MAX_STORAGE_TIME_MS;
      } catch (e) {
        return false;
      }
    });
    fs.writeFileSync(DATA_FILE, recentLines.join('\n') + '\n');
    console.log(`Pruned old data, remaining points: ${recentLines.length}`);
  } catch (e) {
    console.error('Error pruning data file:', e.message);
  }
}


function average(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((sum, v) => sum + v, 0) / arr.length;
}

function statusToColors(status) {
  if (status >= 200 && status < 300) return [
    'rgba(0,70,0,1)',    // ещё темнее зелёный
    'rgba(0,150,0,1)',    // темнее зелёный
    'rgba(0,255,0,1)',    // ярко-зелёный
  ];
  if (status >= 400 && status < 500) return [
    'rgba(150,100,0,1)',  // тёмно-оранжевый
    'rgba(200,150,0,1)',  // оранжевый
    'rgba(255,255,0,1)',  // ярко-жёлтый
  ];
  if (status >= 500 || status === 0) return [
    'rgba(70,0,0,1)',    // бордовый
    'rgba(150,0,0,1)',    // алый
    'rgba(255,0,0,1)',    // ярко-красный
  ];
  return ['rgba(255,0,0,1)', 'rgba(200,0,0,1)', 'rgba(150,0,0,1)'];
}

setInterval(measureLatency, POLL_INTERVAL);

const PORT = 8080;
server.listen(PORT, () => {
  console.log(`Monitoring server running on http://localhost:${PORT}/`);
});