# TikTokMonitorReplica Mac 使用说明

## 重要说明

当前包是 Mac 可运行源码包，不是原生 `.app`。

原因：PyInstaller 不能从 Windows 可靠交叉编译 macOS 可执行文件。若需要真正的 Mac `.app` 或可执行文件，需要在 macOS 本机运行 `build_mac_app.command` 构建。

## 快速启动

1. 解压 `TikTokMonitorReplica_Mac_Source_20260710.zip`。
2. 进入解压后的目录。
3. 双击：

```text
start_mac.command
```

首次运行会自动：

- 创建 `.venv` 虚拟环境。
- 安装 Python 依赖。
- 启动浏览器模式。

启动后访问：

```text
http://127.0.0.1:8099
```

默认登录密码：

```text
000000
```

## Python 要求

推荐 Python 3.11。

如果 Mac 没有 Python 3.11，可用 Homebrew 安装：

```bash
brew install python@3.11
```

## 桌面窗口模式

可尝试双击：

```text
start_mac_desktop.command
```

桌面模式依赖 `pywebview` 和 macOS Cocoa/pyobjc。若失败，请使用 `start_mac.command` 的浏览器模式。

## 构建 Mac 可执行文件

在 macOS 本机运行：

```text
build_mac_app.command
```

构建完成后会生成：

```text
dist/TikTokMonitorReplicaMac/
```

运行前请把 `config.yaml` 和 `data/` 放到生成物同级目录，或继续使用源码目录运行。

## 配置和数据

- `config.yaml`：配置文件。
- `data/monitor.db`：SQLite 数据库。

备份数据时复制整个 `data/` 目录即可。

## 常见问题

### 1. 双击 `.command` 提示没有权限

打开终端，进入目录后执行：

```bash
chmod +x start_mac.command start_mac_desktop.command build_mac_app.command
```

### 2. macOS 阻止运行

右键 `.command` 文件，选择“打开”，然后确认运行。

### 3. 依赖安装很慢或失败

可配置代理后重试，或先手动安装：

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-mac.txt
python main.py --web
```
