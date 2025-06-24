FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY flask_uploader.py .

EXPOSE 8880

CMD ["python3", "flask_uploader.py"]
