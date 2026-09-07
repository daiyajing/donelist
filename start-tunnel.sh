#!/bin/bash
# 快速公网隧道 —— 在你自己的电脑上运行此脚本
# 用法: bash start-tunnel.sh
# 会自动下载 cloudflared 并把本地 5000 端口暴露到公网

set -e
PORT=${1:-5000}

# 检查 Flask 是否在运行
if ! curl -s -o /dev/null http://localhost:$PORT; then
  echo "❌ 本地 $PORT 端口没有服务，请先运行: python3 app.py"
  exit 1
fi

# 下载 cloudflared（如果没有）
if ! command -v cloudflared &> /dev/null; then
  echo "⬇️  正在下载 cloudflared..."
  OS=$(uname -s | tr '[:upper:]' '[:lower:]')
  ARCH=$(uname -m)
  if [ "$ARCH" = "arm64" ]; then ARCH="arm64"; else ARCH="amd64"; fi
  curl -sL -o /usr/local/bin/cloudflared \
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-${OS}-${ARCH}"
  chmod +x /usr/local/bin/cloudflared
fi

echo "🚀 启动公网隧道..."
echo ""
cloudflared tunnel --url http://localhost:$PORT
