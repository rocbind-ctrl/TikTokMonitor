# 跨平台客户端重做与 GitHub Actions 打包方案

## 目标

把当前复刻版 TikTokMonitor 从“Python 打包桌面程序”演进为更适合团队长期使用的架构：

- 后端集中运行，负责同步、数据存储、告警和 API。
- 跨平台客户端只负责 UI 和调用 API。
- GitHub Actions 自动构建 Windows、macOS、Linux 客户端安装包。
- 运行数据、真实配置和密钥不进入 GitHub。

## 推荐架构

```text
TikTokMonitorReplica/
  server/
    app/
    main.py
    requirements.txt
    Dockerfile
    config.example.yaml

  apps/
    desktop/
      src/
      src-tauri/
      package.json
      tauri.conf.json

  docs/
    CROSS_PLATFORM_CLIENT_PLAN.md

  .github/
    workflows/
      desktop-build.yml
      server-check.yml
```

## 技术选型

### 服务端

继续使用当前已验证的技术栈：

- FastAPI
- SQLAlchemy
- SQLite，后续可选 PostgreSQL
- APScheduler
- yt-dlp / tikwm / direct provider

短期不建议重写服务端，因为当前服务端已通过：

- 真实 provider 抓取验证
- 单账号同步写库验证
- 打包后 HTTP 启动验证

### 客户端

推荐：Tauri v2 + React + TypeScript + Vite。

原因：

- 支持 Windows、macOS、Linux。
- 安装包比 Electron 小。
- GitHub Actions 跨平台构建成熟。
- 客户端不需要内嵌 Python，降低打包复杂度。
- 前端可逐步替代当前 Jinja 页面。

备选：

- Electron + React：更成熟但体积大。
- Flutter Desktop：体验好但重写成本更高。
- 纯 Web：最稳，但没有桌面客户端体验。

## 部署模型

### 推荐模型

```text
团队成员电脑
  Tauri 客户端
    |
    | HTTPS / VPN / LAN
    v
统一服务端
  FastAPI
  SQLite/PostgreSQL
  定时同步
  数据备份
```

客户端不直接读写数据库。

原因：

- 避免多台电脑同时写 SQLite。
- 避免每个成员机器都去抓 TikTok。
- 数据和同步任务集中，更容易备份和审计。
- 后续可做权限控制。

## 阶段计划

### 阶段 0：仓库整理

目标：把当前复刻源码变成适合继续开发的 monorepo。

步骤：

1. 新建 `server/`。
2. 将 `replica_src/app`、`replica_src/main.py`、`requirements.txt` 移入 `server/`。
3. 保留 `replica_src/` 作为历史恢复版本，或归档到 `legacy/`。
4. 新增 `server/config.example.yaml`。
5. 新增 `server/Dockerfile` 和 `docker-compose.yml`。
6. 保持 `.gitignore` 排除真实数据和配置。

完成标准：

- `cd server && py -3.11 verify_runtime.py` 通过。
- 旧发布包不受影响。

### 阶段 1：服务端 API 完整化

当前已有部分 API，但仍有不少页面表单路由。客户端需要稳定 JSON API。

需要补齐：

- 登录接口 JSON 化
- 当前用户/session 状态
- 账号详情 API
- 视频详情 API
- 账号增删改 API
- 批量导入 API
- 批量标签 API
- 告警已读 API
- 设置读取/更新 API
- 导出任务 API
- 同步任务列表和状态 API

完成标准：

- 客户端不依赖 Jinja HTML。
- API 有统一响应结构：

```json
{
  "ok": true,
  "data": {},
  "error": null
}
```

### 阶段 2：Tauri 客户端骨架

目标：生成最小可运行客户端。

建议命令：

```bash
npm create tauri-app@latest apps/desktop
```

建议选择：

- Framework: React
- Language: TypeScript
- Package manager: pnpm 或 npm

基础功能：

- 配置服务端地址
- 登录
- 保存 session/token
- 健康检查
- Dashboard 空壳页面

完成标准：

- 本地 `npm run tauri dev` 可启动。
- 能连接本地 FastAPI 服务端。
- 登录成功后进入 Dashboard。

### 阶段 3：客户端页面重做

页面优先级：

1. Dashboard
2. 账号列表
3. 账号详情
4. 视频详情
5. 告警中心
6. 同步日志
7. Provider 健康状态
8. 设置页

设计原则：

- 面向内部运营工具，信息密度适中。
- 不做营销式首页。
- 数据表格、筛选、批量操作优先。
- 所有同步操作显示队列/进度状态。

### 阶段 4：GitHub Actions 分平台打包

客户端骨架稳定后再新增 workflow。

目标产物：

- Windows: `.msi` 或 `.exe`
- macOS: `.dmg` 或 `.app`
- Linux: `.AppImage` 或 `.deb`

推荐 workflow 触发：

- push 到 `main`：只跑检查。
- tag `v*`：构建并发布 Release。
- workflow_dispatch：手动构建。

### 阶段 5：服务端部署包

服务端推荐 Docker/NAS/云服务器运行。

需要提供：

- `Dockerfile`
- `docker-compose.yml`
- 数据卷挂载：
  - `/app/data`
  - `/app/config.yaml`
- 健康检查：
  - `/api/health`
- 备份脚本：
  - SQLite 备份
  - 日志轮转

## API 迁移清单

### 已有 JSON API

- `GET /api/health`
- `GET /api/stats`
- `GET /api/alerts`
- `GET /api/sync/logs`
- `GET /api/sync/progress`
- `GET /api/events/stream`
- `GET /api/intelligence/rankings`
- `GET /api/intelligence/anomalies`
- `GET /api/providers/health`
- `GET /api/accounts`
- `POST /api/accounts/add`
- `POST /api/accounts/{account_id}/tags`
- `POST /api/accounts/{account_id}/sync`
- `POST /api/sync/all`

### 需要新增或改造

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `GET /api/accounts/{account_id}`
- `PATCH /api/accounts/{account_id}`
- `DELETE /api/accounts/{account_id}`
- `POST /api/accounts/batch`
- `POST /api/accounts/bulk-tag`
- `GET /api/videos/{video_id}`
- `POST /api/alerts/{alert_id}/read`
- `POST /api/alerts/read-all`
- `GET /api/settings`
- `PATCH /api/settings`
- `GET /api/export/accounts.csv`
- `GET /api/export/videos.csv`

## GitHub Actions 设计

### server-check.yml

用途：

- Python 依赖安装
- 语法编译
- 后端 smoke test

建议步骤：

```yaml
name: server-check

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  server:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - run: python -m pip install -r server/requirements.txt
      - run: python -m compileall -q server
      - run: python server/verify_runtime.py
```

### desktop-build.yml

用途：

- 构建 Tauri 客户端三平台 artifact。

建议矩阵：

```yaml
strategy:
  matrix:
    include:
      - platform: macos-latest
      - platform: ubuntu-22.04
      - platform: windows-latest
```

注意：

- macOS 签名和 notarization 可后置。
- Windows 签名可后置。
- Linux 需要安装 WebKitGTK 依赖。

## 安全要求

正式给团队使用前必须完成：

- 改掉默认密码。
- `api_key` 使用随机长 token。
- 不允许把真实 `config.yaml` 提交到 GitHub。
- 不允许把 `data/monitor.db` 提交到 GitHub。
- 远程访问优先走 VPN 或 HTTPS。
- 客户端保存服务端地址和 token，不保存数据库。

## 推荐下一步

先执行阶段 0 和阶段 1。

原因：

- 当前最大的短板不是客户端，而是 API 面还不完整。
- API 稳定后，Tauri 客户端可以平滑开发。
- 服务端集中化后，团队使用才真正可靠。

建议下一个执行任务：

1. 新建 `server/` 目录。
2. 迁移当前 `replica_src` 后端代码。
3. 新增 `server/verify_runtime.py`。
4. 补齐认证和账号详情 JSON API。
5. 再创建 Tauri 客户端骨架。
