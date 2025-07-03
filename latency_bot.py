import telebot
import asyncio
import websockets
import json

# docker build -f dockerfile.latency_bot -t latency_bot:latest .

with open("/app/configs/latency_bot_config.json", 'r') as f:
    config = json.load(f)
    TELEGRAM_BOT_TOKEN = config['bot_token']
    CHAT_ID = config['chat_id']
    MONITOR_WS_URL = config['monitor_ws_url']

bot = telebot.TeleBot(TELEGRAM_BOT_TOKEN)


async def listen_monitor():
    while True:
        try:
            async with websockets.connect(MONITOR_WS_URL) as websocket:
                print("Connected to monitor websocket")
                bot.send_message(CHAT_ID, "Connected to latency monitor websocket.")
                failed = False
                while True:
                    message = await websocket.recv()
                    data = json.loads(message)
                    points = data.get('averages', [])
                    if points:
                        latest = points[-1]
                        latency = latest.get('avg5s', 0)
                        req_info = latest.get('reqInfo', '')
                        if latency > 200 or '→ 200' not in req_info:
                            alert = f'🚨 ALERT 🚨\n{req_info}\nLatency: {latency:.1f} ms'
                            if not failed:
                                failed = True
                                bot.send_message(CHAT_ID, alert)
                        elif failed:
                            failed = False
                            alert = f'✅ OK\n{req_info}\nLatency: {latency:.1f} ms'
                            bot.send_message(CHAT_ID, alert)
        except Exception as e:
            print(f"Error: {e}, reconnecting in 5s...")
            await asyncio.sleep(5)

if __name__ == '__main__':
    print("Starting latency monitor...")
    loop = asyncio.get_event_loop()
    loop.run_until_complete(listen_monitor())
