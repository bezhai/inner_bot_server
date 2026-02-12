FROM python:3.11-slim

# Install docker CLI (for docker compose), make, git, curl (healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl gnupg make git \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg \
        | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && chmod a+r /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
        https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
        > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies directly (not a pip-installable package)
RUN pip install --no-cache-dir "fastmcp>=2.0.0,<3.0.0" "httpx>=0.27.0" "uvicorn>=0.30.0"

COPY server.py .

EXPOSE 9090

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -sf http://localhost:9090/sse -o /dev/null || exit 1

CMD ["python", "server.py"]
