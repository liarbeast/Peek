# Build the web app.
FROM docker.io/library/node:22-slim AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# The server, with Chromium for rendering.
FROM docker.io/library/python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
 && playwright install --with-deps chromium \
 && rm -rf /var/lib/apt/lists/*

COPY server/peek ./peek
COPY --from=web /src/server/peek/static/app ./peek/static/app

ENV PEEK_DATA=/data PEEK_PORT=8080
VOLUME /data
EXPOSE 8080
CMD exec uvicorn --factory peek.app:main --host 0.0.0.0 --port "$PEEK_PORT"
