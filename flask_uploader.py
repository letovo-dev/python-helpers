import flask
import json, os
import requests

app = flask.Flask(__name__)
ROOT_PATH = ".."

with open('UploaderConfig.json', 'r') as f:
    config = json.load(f)

def api_check_admin(token: str):
    if not config["check_admin"]:
        return True
    if not token:
        return False
    r = requests.get("http://localhost/api/auth/amiadmin", headers={"Bearer": token}, verify=False)
    return json.loads(r.text)["status"] == 't'

@app.route('/', methods=['POST'])
def upload_file():
    if 'file' not in flask.request.files:
        return "No file part", 400
    file = flask.request.files['file']
    if file.filename == '':
        return "No selected file", 400
    extention = file.filename.split('.')[-1].lower()
    if extention in config["supported"]:
        file_path = os.path.join(ROOT_PATH, config["paths"][config["supported"][extention]])
    else: 
        file_path = os.path.join(ROOT_PATH, config["paths"]["other"])
    token = flask.request.form.get('Bearer', None)
    if not api_check_admin(token):
        return "You are not admin", 403
    # TODO pic paths and change to links
    file.save(os.path.join(file_path, file.filename))
    # TODO saving file info to database
    requests.post("http://localhost/api/notify/upload", json={
        "file_name": file.filename,
        "file_type": extention,
        "file_path": os.path.join(config["paths"][config["supported"].get(extention, "other")], file.filename)
    }, headers={"Bearer": token}, verify=False)
    return str(os.path.join(config["paths"][config["supported"][extention]], file.filename))

@app.route('/avatar', methods=['POST'])
def upload_avatar():
    if 'file' not in flask.request.files:
        return "No file part", 400
    file = flask.request.files['file']
    if file.filename == '':
        return "No selected file", 400
    file_path = os.path.join(ROOT_PATH, config["ava_path"])
    token = flask.request.form.get('Bearer', None)
    if not api_check_admin(token):
        return "You are not admin", 403
    file.save(os.path.join(file_path, file.filename))
    return config["media_url"] + str(os.path.join(config["ava_path"], file.filename))

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8880, debug=True, threaded=True, use_reloader=False)