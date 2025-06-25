# 使用官方Python镜像
FROM python:3.13-slim

# 设置工作目录
WORKDIR /app

# 安装uv
RUN pip install uv

# 复制项目文件
COPY pyproject.toml uv.lock ./

# 创建虚拟环境并安装依赖
RUN uv sync --frozen

# 复制应用代码
COPY . .

# 设置环境变量
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

# 暴露端口
EXPOSE 8000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# 启动应用
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"] 