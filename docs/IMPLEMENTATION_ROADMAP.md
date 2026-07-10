# 实施路线图

## 当前状态

- 复刻源码已恢复在 `replica_src/`。
- Windows 打包产物已验证。
- Mac 可运行源码包已生成。
- 本地 git 仓库已初始化并完成首次提交。

## 推荐路线

### 里程碑 1：服务端整理

目标：将当前可运行代码整理为正式 `server/`。

任务：

- 建立 `server/`。
- 迁移 `replica_src/app`、`main.py`、`requirements.txt`。
- 保留 `replica_src/` 作为 legacy 或历史恢复版。
- 新增 `server/config.example.yaml`。
- 新增服务端 README。
- 新增 smoke test。

验收：

- 服务端可用 `python main.py --web` 启动。
- `/api/health` 返回 200。
- 登录和基础 API 正常。

### 里程碑 2：API 完整化

目标：客户端不依赖服务端 HTML 页面。

任务：

- 新增 JSON 登录 API。
- 新增账号详情 API。
- 新增视频详情 API。
- 新增设置 API。
- 新增批量导入 API。
- 新增统一错误格式。

验收：

- Tauri 客户端所需数据全部可通过 JSON API 获取。
- 当前 Jinja 页面仍可保留作为 Web 管理端。

### 里程碑 3：Tauri 客户端骨架

目标：最小跨平台客户端可运行。

任务：

- 创建 `apps/desktop/`。
- 使用 Tauri v2 + React + TypeScript + Vite。
- 支持配置服务端地址。
- 支持登录。
- 显示 Dashboard 基础统计。

验收：

- `npm run tauri dev` 可启动。
- 能连接本地服务端并显示统计数据。

### 里程碑 4：客户端功能页面

目标：覆盖现有 Web UI 的核心能力。

任务：

- 账号列表。
- 账号详情。
- 视频详情。
- 告警中心。
- 同步日志。
- Provider 健康状态。
- 设置页。

验收：

- 团队日常操作可以只用桌面客户端完成。

### 里程碑 5：CI/CD 打包

目标：GitHub Actions 自动构建三平台客户端。

任务：

- 新增 `server-check.yml`。
- 新增 `desktop-build.yml`。
- Windows artifact。
- macOS artifact。
- Linux artifact。
- tag 发布 GitHub Release。

验收：

- 打 tag 后自动生成 Release artifacts。
- main 分支 push 不上传数据库和真实配置。

### 里程碑 6：团队部署

目标：形成团队可长期使用的部署方式。

任务：

- Dockerfile。
- docker-compose.yml。
- 数据卷挂载。
- 自动备份脚本。
- 健康检查。
- NAS/云服务器部署说明。

验收：

- 服务端可在 NAS/云服务器稳定运行。
- 客户端连接统一服务端。
- 数据可定期备份和恢复。

## 优先级建议

先做：

1. 服务端整理。
2. API 完整化。
3. Tauri 客户端骨架。

暂缓：

- 代码签名。
- 自动更新。
- 多用户角色权限。
- PostgreSQL 迁移。

原因：

- 这些能力有价值，但会增加复杂度。
- 当前最重要的是先把“集中服务端 + 跨平台客户端 + CI 打包”跑通。
