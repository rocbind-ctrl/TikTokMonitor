#!/bin/bash
set -e

cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
  if command -v python3.11 >/dev/null 2>&1; then
    python3.11 -m venv .venv
  else
    python3 -m venv .venv
  fi
fi

source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements-mac.txt
python -m PyInstaller --noconfirm --clean TikTokMonitorReplicaMac.spec

echo
echo "构建完成：dist/TikTokMonitorReplicaMac"
echo "运行前请把 config.yaml 和 data/ 放到 dist/TikTokMonitorReplicaMac 同级目录。"
