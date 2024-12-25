# Stage 1: 构建依赖并安装
FROM python:3.10.16-slim AS builder

# 设置工作目录
WORKDIR /app

# 复制 requirements.txt 文件
COPY requirements.txt /app/requirements.txt

# 使用国内源加速 pip 安装，并升级 pip
RUN pip install --no-cache-dir -r /app/requirements.txt -i https://mirrors.aliyun.com/pypi/simple/

# 复制项目文件
COPY ./app /app/app

# Stage 2: 创建生产镜像
FROM python:3.10-slim

# 设置工作目录
WORKDIR /app

COPY --from=builder /usr/local/lib/python3.10/site-packages /usr/local/lib/python3.10/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# 从构建阶段复制依赖和项目文件
COPY --from=builder /app /app

# 暴露端口
EXPOSE 8000

# 运行 FastAPI 应用
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]