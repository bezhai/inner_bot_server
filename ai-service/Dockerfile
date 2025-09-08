FROM python:3.11-slim

RUN groupadd -r appuser && useradd -r -g appuser -m appuser

WORKDIR /app

# 配置pip使用阿里云镜像源
RUN pip config set global.index-url https://mirrors.aliyun.com/pypi/simple/ && \
    pip config set global.trusted-host mirrors.aliyun.com

# 安装uv
RUN pip install uv

# 复制项目配置文件
COPY pyproject.toml uv.lock uv.toml ./

# 配置uv使用阿里云镜像源并同步依赖
RUN uv sync --index-url https://mirrors.aliyun.com/pypi/simple/ --extra-index-url https://mirrors.aliyun.com/pypi/simple/ --allow-insecure-host mirrors.aliyun.com

# 复制应用代码
COPY ./app /app/app

# 设置时区为东八区
ENV TZ=Asia/Shanghai
ENV PYTHONPATH=/app
ENV UV_CACHE_DIR=/tmp/uv-cache

RUN mkdir -p /logs/ai-service && chown -R appuser:appuser /logs

RUN chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

CMD ["uv", "run", "--no-sync", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--log-config", "app/config/logging_config.json"]
