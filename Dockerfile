FROM docker.io/library/python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
 && playwright install --with-deps chromium \
 && rm -rf /var/lib/apt/lists/*

COPY server/peek ./peek

ENV PEEK_DATA=/data
VOLUME /data
EXPOSE 8080
CMD ["uvicorn", "peek.app:app", "--host", "0.0.0.0", "--port", "8080"]
