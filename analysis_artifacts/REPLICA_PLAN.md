# TikTokMonitor 拆解与复刻计划

## 1. 已拆解结论

- 程序类型：Windows x64 PE，PyInstaller onefile 打包。
- Python 运行时：CPython 3.11 win_amd64。
- 入口逻辑：`main` 为 marshal code object，已反汇编到 `analysis_artifacts/main_disassembly.txt`。
- 业务源码：`app/*.py`、`templates/*.html`、`static/*.js/css` 可直接从 CArchive 抽取。
- 数据存储：SQLite，路径为运行目录下 `data/monitor.db`，开启 WAL。
- 配置文件：运行目录下 `config.yaml`，UTF-8 编码。
- 应用形态：FastAPI + Jinja2 页面 + 静态资源 + pywebview 桌面壳；desktop 失败会退回浏览器模式。
- 默认端口：`8099`，不可用时尝试 `8888`、`9000`、`9100`。
- 安全：`security.web_password` 存在时 Web/API 页面接口需要登录；当前为 `000000`。

## 2. 已抽取文件

- CArchive 清单：`analysis_artifacts/carchive_entries.json`
- CArchive 文件名：`analysis_artifacts/carchive_names.txt`
- 已选业务文件：`analysis_artifacts/extracted_selected/`
- 入口反汇编：`analysis_artifacts/main_disassembly.txt`
- 启动验证副本：`analysis_artifacts/runtime_probe_root/`

## 3. 原程序模块边界

- `app.routes`：FastAPI 实例、页面路由、API 路由、登录登出、账户管理、同步操作、导出。
- `app.database`：SQLAlchemy ORM、SQLite engine、表结构、连接与初始化。
- `app.migrate`：数据库迁移/补列。
- `app.scheduler`：周期同步任务，读取 `monitor.interval_minutes`。
- `app.sync_service`：单账号/批量同步、队列、并发线程池、写入视频和历史快照。
- `app.scraper`：多 provider 调度，支持 `auto/direct/tikwm/ytdlp`。
- `app.providers.tikwm`：调用 `https://tikwm.com/api/user/info` 和 `user/posts`。
- `app.providers.ytdlp`：通过 `yt-dlp` 获取视频列表。
- `app.providers.direct`：直接请求 TikTok 页面并解析 rehydration 数据。
- `app.analytics`：趋势、今日发布、增长、播放增量、账号视频排序。
- `app.alerts`：播放激增、粉丝下降、同步异常等告警。
- `app.notifications`：Webhook、钉钉、Telegram、Bark 通知。
- `app.desktop`：pywebview 窗口 + 内部 uvicorn 服务。

## 4. 数据库模型

- `accounts`：账号基础信息、分组、电话、员工、备注、启用状态、最近同步时间。
- `videos`：视频基础信息、播放/点赞/评论/分享、发布时间、最近同步时间。
- `account_stats_history`：账号粉丝/关注/总赞/视频数/总播放历史快照。
- `video_stats_history`：视频播放/互动历史快照。
- `alerts`：告警内容、级别、类型、已读状态。
- `sync_logs`：同步状态、耗时、provider、重试次数。
- `provider_health`：provider 成功/失败次数、连续失败、平均延迟。
- `audit_logs`：操作审计。

当前数据库样本：

- 账号：10
- 视频：64
- 账号历史：465
- 视频历史：454
- 告警：111
- 同步日志：936
- provider 健康记录：4

## 5. 复刻实施计划

### 阶段 A：源码恢复整理

1. 从 `analysis_artifacts/extracted_selected` 建立正式源码目录，例如 `replica_src/`。
2. 保留原始结构：`app/`、`templates/`、`static/`、`config.yaml`、`data/`。
3. 将反汇编得到的 `main` 入口重写为可读 `main.py`。
4. 生成 `requirements.txt`，优先使用 CArchive 中的原始版本：
   - `fastapi==0.115.6`
   - `starlette==0.41.3`
   - `uvicorn==0.34.0`
   - `SQLAlchemy==2.0.36`
   - `jinja2==3.1.6`
   - `python-multipart==0.0.20`
   - `pyyaml==6.0.3`
   - `httpx==0.28.1`
   - `curl_cffi==0.15.0`
   - `cryptography==44.0.0`
   - `apscheduler==3.11.2`
   - `yt-dlp==2026.3.17`
   - `pywebview`
5. 修复源码中的显示乱码文本，只处理用户可见文案，不改变业务逻辑。
6. 跑 `compileall`，确保所有 Python 文件语法通过。

完成标准：

- `py -3.11 -m compileall replica_src/app` 通过。
- `py -3.11 -c "from app.routes import app"` 通过。
- `main.py --web` 可以启动。

### 阶段 B：运行时验证

1. 用现有 `config.yaml` 和 `data/monitor.db` 启动恢复版。
2. 验证无需登录接口：
   - `GET /api/health`
3. 验证登录流程：
   - `GET /`
   - `POST /login password=000000`
4. 验证核心页面：
   - `/`
   - `/alerts`
   - `/logs`
   - `/settings`
   - `/account/{id}`
   - `/video/{id}`
5. 验证核心 API：
   - `/api/stats`
   - `/api/accounts`
   - `/api/alerts`
   - `/api/sync/logs`
   - `/api/intelligence/rankings`
   - `/api/providers/health`
6. 验证导出：
   - `/export/accounts.csv`
   - `/export/videos.csv`

完成标准：

- API 返回 HTTP 200 或预期 401。
- 页面能渲染 HTML，不出现模板异常。
- SQLite 数据统计与原数据库一致。

### 阶段 C：同步功能验证

1. 使用测试账号执行单账号同步，先设置较小 `max_videos_per_account`。
2. 分别验证 provider：
   - `provider=tikwm`
   - `provider=ytdlp`
   - `provider=direct`
   - `provider=auto`
3. 验证同步结果：
   - `accounts.last_sync_at` 更新。
   - `videos` 新增或更新。
   - `video_stats_history` 增加快照。
   - `sync_logs` 增加记录。
   - `provider_health` 更新成功/失败数据。
4. 验证网络失败、代理为空、TikTok 限流时的错误路径。

完成标准：

- 至少一个 provider 能成功拉取账号/视频数据。
- 失败路径能写入 sync log，不导致服务崩溃。
- 批量同步不会出现 SQLite 写入冲突。

### 阶段 D：桌面壳验证

1. 验证 `server.mode=web` 浏览器模式。
2. 验证 `server.mode=desktop` pywebview 模式。
3. 验证 8099 被占用时自动切换端口。
4. 验证 WebView2 缺失时退回浏览器模式。

完成标准：

- Web 模式能打开浏览器。
- Desktop 模式能打开窗口，窗口关闭后进程正常退出。
- 端口冲突时不会直接崩溃。

### 阶段 E：重新打包

1. 编写 PyInstaller spec。
2. 打包内容包含：
   - `app/`
   - `templates/`
   - `static/`
   - 必要 hidden imports
   - WebView/yt-dlp/curl_cffi 相关依赖
3. 生成 onefile exe。
4. 在干净目录中放置 `config.yaml` 和 `data/` 运行。
5. 对比原 exe 行为：
   - 版本
   - 默认窗口/端口
   - 页面/API
   - 同步日志
   - 数据库兼容性

完成标准：

- 新 exe 可在同级 `config.yaml` + `data/monitor.db` 上运行。
- 核心 API 和页面与恢复版一致。
- 不依赖开发目录源码。

## 6. 当前可行性验证结果

已验证：

- CArchive 可读，业务源码和资源可抽取。
- `app/*.py` 源码可被 Python 3.11 编译。
- 使用抽取源码、现有配置和现有数据库创建 `runtime_probe_root` 后，可以导入 FastAPI 应用。
- `GET /api/health` 返回 200：
  - version: `5.0`
  - accounts: `10`
  - active_accounts: `10`
  - unread_alerts: `111`
- 未登录访问受保护接口返回 401，符合配置。
- 使用当前密码 `000000` 登录后：
  - `GET /api/stats` 返回 200
  - `GET /api/accounts` 返回 200
  - `/alerts` 返回 HTML 200
  - `/settings` 返回 HTML 200

未验证：

- 外部 TikTok/tikwm/yt-dlp 同步链路。
- pywebview 桌面窗口真实打开。
- PyInstaller 重新打包后的 onefile 行为。
- 所有页面的视觉和交互细节。

## 7. 主要风险

- 网络 provider 风险：TikTok、tikwm、yt-dlp 都可能因限流、地区、代理或接口变更失败。
- 文案乱码风险：部分源码字符串在抽取后显示为 mojibake，需要修复用户可见中文。
- 依赖版本风险：运行环境已对齐大部分原始版本，但 pywebview 原包版本需继续从 metadata 或行为确认。
- 打包风险：pywebview、curl_cffi、yt-dlp 在 PyInstaller 中可能需要 hidden imports 或 data collection。
- 数据写入风险：批量同步用线程池写 SQLite，需要验证 WAL 下并发写入是否稳定。

## 8. 下一步建议

先进入阶段 A，建立 `replica_src/`，把抽取源码整理成可维护项目。完成后立刻做阶段 B 的接口和页面回归，再决定是否投入阶段 C 的真实 TikTok 同步验证。

## 9. 执行进展

### 2026-07-10 阶段 A/B 离线验证

已完成：

- 建立正式源码目录 `replica_src/`。
- 复制业务源码目录：
  - `app/`
  - `templates/`
  - `static/`
  - `config.yaml`
  - `data/`
- 根据入口反汇编重写可读 `replica_src/main.py`。
- 生成 `replica_src/requirements.txt`。
- 生成 `replica_src/README.md`。
- 生成一键回归脚本 `replica_src/verify_runtime.py`。

验证结果：

- `py -3.11 -m compileall -q .` 通过。
- `py -3.11 verify_runtime.py` 通过。
- `GET /api/health` 返回 200。
- 未登录 `GET /api/stats` 返回 401。
- `POST /login password=000000` 返回 303。
- 登录后：
  - `GET /api/stats` 返回 200。
  - `GET /api/accounts` 返回 200。
  - `/alerts`、`/settings`、`/logs` 页面返回 HTML 200。
- 样本数据一致：
  - 账号数：10
  - 视频数：64

下一阶段建议：

1. 执行阶段 C：真实 provider 同步验证。
2. 执行阶段 D：Web 模式和 pywebview 桌面窗口手工验证。
3. 通过后进入阶段 E：PyInstaller spec 与重新打包。

### 2026-07-10 阶段 C 真实 provider 验证

已完成：

- 新增 provider 干跑脚本 `replica_src/verify_providers.py`。
- 新增单账号同步脚本 `replica_src/verify_sync_once.py`。
- 更新 `replica_src/README.md`，记录验证命令。
- 在写库同步前备份 `replica_src/data` 到：
  - `replica_src/data_backup_before_provider_sync_20260710_105910`

provider 干跑结果，测试账号 `puppypuppy018`，`max_videos=3`：

- `tikwm`：成功，获取账号基础信息和 3 个视频。
- `ytdlp`：成功，通过 `tikwm-profile + ytdlp` 获取账号基础信息和 3 个视频。
- `direct`：成功获取账号基础信息，未获取视频列表；返回预期 warning：直连模式仅获取基础信息。
- `auto`：成功，通过 `tikwm-profile + ytdlp` 获取账号基础信息和 3 个视频。

单账号写库同步结果：

- 账号：`puppypuppy018`
- 最大视频数：3
- 状态：`success`
- 最新同步日志 ID：937
- 更新视频数：2
- provider：`tikwm-profile,ytdlp`
- 重试次数：0
- 耗时：6.3 秒

同步前后表计数：

- `accounts`：10 -> 10
- `videos`：64 -> 64
- `account_stats_history`：465 -> 466
- `video_stats_history`：454 -> 456
- `alerts`：111 -> 113
- `sync_logs`：936 -> 937
- `provider_health`：4 -> 4

同步后验证：

- `py -3.11 verify_runtime.py` 通过。
- `py -3.11 -m compileall -q .` 通过。
- `py -3.11 verify_providers.py --username puppypuppy018 --max-videos 3` 通过。

阶段 C 结论：

- 当前网络环境下，真实抓取链路可用。
- `auto` 的实际可用路径是 `tikwm-profile + ytdlp`。
- `direct` 可以作为账号基础信息 fallback，但不适合作为视频播放量主来源。
- 复制数据库的写入路径可用，能正常产生历史快照、同步日志和告警。

剩余风险：

- TikTok/tikwm/yt-dlp 都是外部链路，后续仍可能受地区、限流、接口变化影响。
- 本阶段只做了单账号小范围同步，尚未做批量并发同步压力验证。
- 尚未验证 pywebview 桌面窗口和 PyInstaller 重新打包。

### 2026-07-10 阶段 D/E Web 与打包验证

已完成：

- 为 `replica_src/main.py` 增加测试用环境变量 `TIKTOKMONITOR_NO_BROWSER=1`。
  - 默认行为不变，Web 模式仍会自动打开浏览器。
  - 设置该环境变量后，便于自动化验证时不弹浏览器。
- 新增 `replica_src/verify_web_server.py`。
- 新增 `replica_src/verify_desktop_deps.py`。
- 新增 `replica_src/TikTokMonitorReplica.spec`。
- 新增 `replica_src/verify_packaged_exe.py`。
- 更新 `replica_src/README.md`。

阶段 D 非侵入式验证：

- `py -3.11 verify_web_server.py` 通过。
  - `/api/health` 返回 200。
  - `/` 返回 HTML 200。
  - `/login` 返回 HTML 200。
- `py -3.11 verify_desktop_deps.py` 通过。
  - `webview` 可导入。
  - `pythonnet` 可导入。
  - `clr_loader` 可导入。
  - `webview.platforms.winforms` 可导入。
  - Microsoft Edge WebView2 runtime 已检测到。

阶段 E 打包验证：

- 命令：`py -3.11 -m PyInstaller --noconfirm --clean TikTokMonitorReplica.spec`
- 构建成功。
- 输出文件：
  - `replica_src/dist/TikTokMonitorReplica.exe`
  - 大小：48,540,738 bytes
- `py -3.11 verify_packaged_exe.py` 通过。
  - 脚本创建 `dist_runtime_probe/`。
  - 复制 exe、`config.yaml`、`data/`。
  - 使用临时端口启动 exe。
  - 设置 `TIKTOKMONITOR_NO_BROWSER=1` 避免弹浏览器。
  - `/api/health` 返回 200。
  - `/` 返回 HTML 200。
  - `/login` 返回 HTML 200。
  - 验证后自动结束 exe 进程。
- 已确认无残留 `TikTokMonitorReplica.exe` 进程。

PyInstaller 构建警告说明：

- `pywebview` 数据收集提示跳过 `pywebview` 包名，但实际 `webview` hook 已处理并且桌面依赖导入通过。
- `android`、`pysqlite2`、`MySQLdb`、`psycopg2` 等 hidden import 未找到属于可选平台/数据库依赖，不影响当前 SQLite + Windows 目标。
- Windows 系统 DLL 解析警告多为系统库探测项；打包 exe 已通过本机启动验证。

剩余未做：

- 真实弹出 pywebview 桌面窗口的人眼验证。
- 批量并发同步压力验证。
- 将 exe 放到完全干净目录/另一台机器做便携性验证。

### 2026-07-10 发布包

已完成：

- 新增中文使用说明：
  - `replica_src/使用说明.md`
- 生成发布目录：
  - `release/TikTokMonitorReplica_Release_20260710/`
- 生成发布压缩包：
  - `release/TikTokMonitorReplica_Release_20260710.zip`

发布包内容：

- `TikTokMonitorReplica.exe`
- `config.yaml`
- `data/monitor.db`
- `使用说明.md`

发布包校验：

- zip 大小：48,203,846 bytes
- SHA256：`6AB9C6D8803AD666D247468E13038A2D5DBF40B9E8234D506DB71CE3FE5FB789`
- 压缩包内容清单已确认。
- 发布目录中的 exe 已用临时端口启动验证：
  - `/api/health` 返回 200。
  - 账号数：10。
  - 未读告警：113。
- 验证后已确认无残留 `TikTokMonitorReplica.exe` 进程。

### 2026-07-10 Mac 可运行源码包

已完成：

- 新增 `replica_src/requirements-mac.txt`。
- 新增 `replica_src/start_mac.command`。
- 新增 `replica_src/start_mac_desktop.command`。
- 新增 `replica_src/build_mac_app.command`。
- 新增 `replica_src/TikTokMonitorReplicaMac.spec`。
- 新增 `replica_src/Mac使用说明.md`。
- 生成 Mac 源码发布目录：
  - `release/TikTokMonitorReplica_Mac_Source_20260710/`
- 生成 Mac 源码发布包：
  - `release/TikTokMonitorReplica_Mac_Source_20260710.zip`

说明：

- 当前包是 macOS 可运行源码包，不是原生 `.app`。
- 原因：PyInstaller 不能从 Windows 可靠交叉编译 macOS 可执行文件。
- 若需要 macOS 原生可执行文件，需要在 macOS 本机运行：
  - `build_mac_app.command`

Mac 包内容：

- `app/`
- `templates/`
- `static/`
- `data/monitor.db`
- `config.yaml`
- `main.py`
- `requirements-mac.txt`
- `start_mac.command`
- `start_mac_desktop.command`
- `build_mac_app.command`
- `TikTokMonitorReplicaMac.spec`
- `Mac使用说明.md`

Mac 包校验：

- zip 大小：182,793 bytes
- SHA256：`0D781F3A3F02D47662D9AE2499A71E601039FE84AA05DBE118871FF736CA81F5`
- 压缩包内容已确认，不包含 `__pycache__`。
