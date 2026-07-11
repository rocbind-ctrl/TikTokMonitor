FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV TIKTOKMONITOR_NO_BROWSER=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY scripts ./scripts
COPY static ./static
COPY templates ./templates
COPY main.py ./main.py

RUN mkdir -p /app/data /app/backups

EXPOSE 8099

CMD ["python", "main.py", "--web"]
