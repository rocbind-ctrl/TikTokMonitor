#!/bin/bash
set -e

cd "$(dirname "$0")"

if command -v python3.11 >/dev/null 2>&1; then
  PYTHON_BIN="python3.11"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
else
  echo "未找到 Python。请先安装 Python 3.11 或更高版本。"
  echo "推荐安装方式：brew install python@3.11"
  read -r -p "按回车退出..."
  exit 1
fi

if [ ! -d ".venv" ]; then
  "$PYTHON_BIN" -m venv .venv
fi

source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements-mac.txt

python main.py --desktop
