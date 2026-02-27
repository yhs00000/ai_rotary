import _thread as thread
import base64
import hashlib
import hmac
import json
import ssl
from datetime import datetime
from time import mktime
from urllib.parse import urlencode, urlparse
from wsgiref.handlers import format_date_time
import websocket
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
# Enable CORS for frontend running locally or elsewhere
CORS(app)

# iFlytek Spark LLM Config
APPID = "ca2eabd1"
API_SECRET = "OTM4MDQ1Mzk4MzNjZjZjYTFhMGU0ZDJj"
API_KEY = "d9e150aed3e7b7a0abba33dac96b017f"
GPT_URL = "wss://spark-api.xf-yun.com/v4.0/chat"

# Global string to store response pieces during ws session
global_answer = ""

class Ws_Param(object):
    def __init__(self, APIKey, APISecret, gpt_url):
        self.APIKey = APIKey
        self.APISecret = APISecret
        self.host = urlparse(gpt_url).netloc
        self.path = urlparse(gpt_url).path
        self.gpt_url = gpt_url

    def create_url(self):
        now = datetime.now()
        date = format_date_time(mktime(now.timetuple()))
        signature_origin = "host: " + self.host + "\n"
        signature_origin += "date: " + date + "\n"
        signature_origin += "GET " + self.path + " HTTP/1.1"
        signature_sha = hmac.new(self.APISecret.encode('utf-8'), signature_origin.encode('utf-8'),
                                 digestmod=hashlib.sha256).digest()
        signature_sha_base64 = base64.b64encode(signature_sha).decode(encoding='utf-8')
        authorization_origin = f'api_key="{self.APIKey}", algorithm="hmac-sha256", headers="host date request-line", signature="{signature_sha_base64}"'
        authorization = base64.b64encode(authorization_origin.encode('utf-8')).decode(encoding='utf-8')
        v = {"authorization": authorization, "date": date, "host": self.host}
        return self.gpt_url + '?' + urlencode(v)

def on_error(ws, error):
    print("### error:", error)

def on_close(ws, close_status_code, close_msg):
    print("### closed ###")

def on_open(ws):
    thread.start_new_thread(run, (ws,))

def run(ws, *args):
    # Construct input payload
    data = json.dumps(gen_params(ws.question_text))
    ws.send(data)

def on_message(ws, message):
    global global_answer
    data = json.loads(message)
    code = data['header']['code']
    if code != 0:
        print(f'API error: {code}, {data}')
        ws.close()
    else:
        choices = data["payload"]["choices"]
        status = choices["status"]
        content = choices["text"][0]["content"]
        global_answer += content # Append the response chunks
        if status == 2:
            # End of response
            ws.close()

def gen_params(text):
    return {
        "payload": {
            "message": {
                "text": [
                    {
                        "role": "system",
                        "content": "你是一个提取关键词的助手。请从用户的输入中提取出所有的选项（名词或短语）。请只输出选项内容，每个选项之间用换行符（\\n）分隔。不要输出任何其他解释性文字。"
                    },
                    {
                        "role": "user",
                        "content": text
                    }
                ]
            }
        },
        "parameter": {
            "chat": {
                "max_tokens": 4096,
                "domain": "4.0Ultra",
                "top_k": 6,
                "temperature": 0.5 # lower temperature for focus on extraction
            }
        },
        "header": {
            "app_id": APPID
        }
    }

@app.route('/analyze', methods=['POST'])
def analyze():
    global global_answer
    global_answer = "" # reset state
    
    body = request.json
    if not body or 'text' not in body:
        return jsonify({"error": "Missing 'text' in payload"}), 400
        
    user_input = body.get('text', '').strip()
    if not user_input:
        return jsonify({"error": "Empty text"}), 400

    print(f"Received speech input: {user_input}")

    wsParam = Ws_Param(API_KEY, API_SECRET, GPT_URL)
    websocket.enableTrace(False)
    wsUrl = wsParam.create_url()
    
    ws = websocket.WebSocketApp(wsUrl, on_message=on_message, on_error=on_error, on_close=on_close, on_open=on_open)
    ws.question_text = user_input
    # Run the websocket app holding execution until it's finished and closed
    ws.run_forever(sslopt={"cert_reqs": ssl.CERT_NONE})

    # Clean the response based on different potential separator behaviors
    cleaned_items = [item.strip() for item in global_answer.split('\n') if item.strip()]
    if len(cleaned_items) <= 1 and ' ' in global_answer:
        cleaned_items = [item.strip() for item in global_answer.split(' ') if item.strip()]

    print(f"Extracted options: {cleaned_items}")
    return jsonify({"items": cleaned_items})

if __name__ == '__main__':
    print("Voice-to-Roulette backend running on port 5000...")
    app.run(debug=True, port=5000)
