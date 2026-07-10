# TikTokMonitor

这是从原 Windows 程序拆解恢复后，整理成“集中服务端 + 跨平台桌面客户端”的团队版仓库。

## 目录

- `server/`: FastAPI 服务端，负责数据、同步、告警和 JSON API。
- `apps/desktop/`: Tauri v2 + React + TypeScript 桌面客户端，支持 Windows/macOS/Linux 构建。
- `replica_src/`: 原 Windows 程序恢复出的可运行源码，作为历史基线保留。
- `.github/workflows/`: 服务端检查和桌面端分平台打包工作流。
- `docs/`: 迁移、部署、优化和进度说明。

## 本地运行服务端

```powershell
cd server
Copy-Item config.example.yaml config.yaml
py -3.11 -m pip install -r requirements.txt
py -3.11 main.py --web
```

默认地址：

```text
http://127.0.0.1:8099
```

## 本地运行桌面端

```powershell
cd apps/desktop
npm install
npm run tauri dev
```

桌面端启动后填写服务端地址，例如：

```text
http://127.0.0.1:8099
```

## 打包

GitHub Actions 会按平台生成安装包：

- Windows: `.msi`
- macOS: `.dmg`
- Linux: `.deb` / `.AppImage`

本机 Windows 可验证：

```powershell
cd apps/desktop
npm run build
npx tauri build --bundles msi
```

## 不提交到 Git

- `config.yaml`
- `data/`
- `*.db`
- `release/`
- `node_modules/`
- `dist/`
- Tauri `target/`
- 原始 `.exe` 和生成的安装包

正式给团队使用前，请修改默认密码和 `api_key`。
