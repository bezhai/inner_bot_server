# Stage 1: 构建依赖并安装
FROM library/python:3.10-slim AS builder

WORKDIR /app

COPY requirements.txt /app/requirements.txt

RUN pip install --no-cache-dir -r /app/requirements.txt -i https://mirrors.aliyun.com/pypi/simple/

COPY ./app /app/app

# Stage 2: 创建生产镜像
FROM library/python:3.10-slim

WORKDIR /app

COPY --from=builder /usr/local/lib/python3.10/site-packages /usr/local/lib/python3.10/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

COPY --from=builder /app /app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]