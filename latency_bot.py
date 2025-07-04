import telebot
import asyncio
import websockets
import json
import subprocess
import time
# docker build -f dockerfile.latency_bot -t latency_bot:latest .

with open("/app/configs/latency_bot_config.json", 'r') as f:
    config = json.load(f)
    TELEGRAM_BOT_TOKEN = config['bot_token']
    CHAT_ID = config['chat_id']
    DEBUG_CHAT_ID = config.get('debug_chat_id', CHAT_ID)
    MONITOR_WS_URL = config['monitor_ws_url']
    ALLOWED_LATENCY = config.get('allowed_latency', 500)  

bot = telebot.TeleBot(TELEGRAM_BOT_TOKEN)
loop = asyncio.get_event_loop()


async def listen_monitor():
    while True:
        try:
            async with websockets.connect(MONITOR_WS_URL) as websocket:
                print("Connected to monitor websocket, allowed latency:", ALLOWED_LATENCY)
                bot.send_message(DEBUG_CHAT_ID, "Connected to latency monitor websocket, allowed latency: " + str(ALLOWED_LATENCY))
                failed = False
                while True:
                    message = await websocket.recv()
                    data = json.loads(message)
                    points = data.get('averages', [])
                    if points:
                        latest = points[-1]
                        latency = latest.get('avg5s', 0)
                        req_info = latest.get('reqInfo', '')
                        if latency > ALLOWED_LATENCY or '→ 200' not in req_info:
                            alert = f'🚨 ALERT 🚨\n{req_info}\nLatency: {latency:.1f} ms\n@Lunitarik shell i /restart server?'
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

@bot.message_handler(commands=['restart'])
def handle_restart(message):
    if str(message.chat.id) != CHAT_ID:
        bot.reply_to(message, "⛔️ Unauthorized")
        return
    bot.reply_to(message, "🔄 Restarting the server...")
    subprocess.run(["docker-compose", "restart", "letovo-server"])
    time.sleep(5)
    logs = subprocess.run(["docker-compose", "logs", "--tail 10", "letovo-server"], capture_output=True, text=True)
    bot.send_message(CHAT_ID, f"Server restarted. Last logs:\n```\n{logs.stdout}\n```", parse_mode='MarkdownV2')
    

if __name__ == '__main__':
    ws_task = loop.create_task(listen_monitor())
    import threading
    def run_bot():
        bot.infinity_polling()
    threading.Thread(target=run_bot, daemon=True).start()
    loop.run_forever()

