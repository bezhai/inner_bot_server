FROM python:3.11-slim

ENV TZ=Asia/Shanghai \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources

RUN apt-get update && apt-get install -y --no-install-recommends \
    tzdata \
    && ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN groupadd -r appuser && useradd -r -g appuser -m appuser

WORKDIR /app

RUN pip install uv -i https://mirrors.aliyun.com/pypi/simple/

COPY pyproject.toml uv.lock uv.toml ./

RUN uv sync --frozen \
    --index-url https://mirrors.aliyun.com/pypi/simple/ \
    --extra-index-url https://mirrors.aliyun.com/pypi/simple/


# 8. 日志目录
RUN mkdir -p /logs/ai-service && chown -R appuser:appuser /logs

USER appuser

EXPOSE 8000

CMD ["uv", "run", "--no-sync", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--log-config", "app/config/logging_config.json"]