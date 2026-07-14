# TikTokMonitor 使用说明

本文面向日常使用者和服务器维护者，说明如何访问系统、使用 Web
界面和桌面端、管理账号与告警，以及如何做备份、更新和排查问题。

## 1. 系统地址

当前云服务器地址：

```text
http://170.106.117.104:8099
```

Web 登录页：

```text
http://170.106.117.104:8099/login
```

桌面端连接服务器时填写：

```text
http://170.106.117.104:8099
```

生产登录密码和 API Key 保存在服务器本地：

```bash
/root/tiktokmonitor-credentials.txt
```

不要把密码、API Key、SSH 私钥或云服务器账号发到聊天、群聊或 GitHub。

## 2. 获取登录密码

在有服务器 SSH 权限的电脑上执行：

```powershell
ssh -i "C:\Users\zhu\Desktop\key\guigu2026.pem" root@170.106.117.104 "cat /root/tiktokmonitor-credentials.txt"
```

只把 `web_password` 发给需要登录系统的团队成员。`api_key` 只给自动化脚本或受信任的服务使用。

## 3. Web 端使用

打开：

```text
http://170.106.117.104:8099
```

如果未登录，系统会自动跳转到 `/login`。

登录后可以使用：

- 首页仪表盘：查看账号、视频、告警和同步概况。
- 账号列表：查看所有监控账号。
- 账号详情：查看账号资料、视频列表、趋势图和历史数据。
- 视频详情：查看单条视频指标和趋势。
- 告警页：查看异常增长、粉丝波动等告警。
- 同步日志：查看同步任务执行结果。
- 设置页：查看和调整非敏感运行参数。

密码、API Key 和 Webhook 不会在桌面端显示或编辑。需要修改敏感配置时，请在服务器上编辑 `server/config.yaml`。

## 4. 桌面端使用

桌面端适合团队成员日常查看数据，不需要每个人都运行服务端。

使用步骤：

1. 安装对应平台的桌面端构件。
2. 打开 TikTokMonitor Desktop。
3. 在服务器地址中填写：

   ```text
   http://170.106.117.104:8099
   ```

4. 使用 Web 登录密码登录。
5. 登录后即可查看仪表盘、账号、视频、告警和同步日志。

GitHub Actions 当前会生成三个桌面端构件：

- `tiktokmonitor-windows-latest`
- `tiktokmonitor-macos-latest`
- `tiktokmonitor-ubuntu-22.04`

安装未知来源桌面端时，Windows/macOS 可能会出现系统安全提示。确认构件来自本仓库 Actions 后再继续安装。

### 数据分析工作台

桌面端“数据分析”支持 `7 天`、`14 天` 和 `30 天`周期。切换周期后，系统会把本期与紧邻的上一周期进行比较。

- “本期增播”和“本期增粉”显示可比较账号的汇总变化。
- “可比账号”表示同时拥有本期和上一周期基准快照的账号数量。
- 覆盖率较低时不要只看环比结论，应先完成更多账号同步。
- 账号和视频排行可以直接打开详情，也可以跳到对应列表继续筛选。
- “保存视图”会把当前周期保存在本机，适合固定周报或月报流程。
- “导出账号”“导出视频”“导出异常”分别生成当前周期的 CSV。

如果分析页提示样本不足，通常不是系统故障，而是账号尚未积累跨周期历史快照。持续同步后，可比较样本会逐步增加。

## 5. 添加和同步账号

添加账号时建议使用 TikTok 用户名或主页链接。添加后可以：

- 手动同步单个账号。
- 执行全部账号同步。
- 在账号详情中查看最新视频和历史趋势。

同步频率由服务器配置控制：

```yaml
monitor:
  interval_minutes: 30
  max_videos_per_account: 50
```

如需调整，编辑服务器文件：

```bash
/opt/TikTokMonitor/server/config.yaml
```

修改后重启服务：

```bash
cd /opt/TikTokMonitor
docker compose restart tiktokmonitor-server
```

## 6. 告警使用

告警用于提示播放量激增、粉丝下降或异常波动。

常用操作：

- 按告警等级筛选。
- 查看告警关联账号或视频。
- 将单条告警标记为已读。
- 批量将选中告警标记为已读。

告警阈值在服务器配置中：

```yaml
alerts:
  enabled: true
  play_surge_threshold: 500
  follower_drop_threshold: 10
  cooldown_hours: 6
  anomaly_detection: true
```

调整后重启容器生效。

## 7. 服务器运维

服务器部署目录：

```bash
/opt/TikTokMonitor
```

查看容器状态：

```bash
cd /opt/TikTokMonitor
docker compose ps
```

查看日志：

```bash
cd /opt/TikTokMonitor
docker compose logs --tail=100 tiktokmonitor-server
```

重启服务：

```bash
cd /opt/TikTokMonitor
docker compose restart tiktokmonitor-server
```

停止服务：

```bash
cd /opt/TikTokMonitor
docker compose stop tiktokmonitor-server
```

启动服务：

```bash
cd /opt/TikTokMonitor
docker compose up -d
```

## 8. 备份和恢复

数据存储在容器内：

```text
/app/data/monitor.db
```

宿主机会把备份保存到：

```bash
/opt/TikTokMonitor/backups
```

手动备份：

```bash
cd /opt/TikTokMonitor
docker compose exec -T tiktokmonitor-server python scripts/sqlite_backup.py backup --keep-days 30
ls -lh backups
```

当前服务器已配置每日自动备份：

```cron
30 3 * * * cd /opt/TikTokMonitor && docker compose exec -T tiktokmonitor-server python scripts/sqlite_backup.py backup --keep-days 30 >> backups/backup.log 2>&1
```

查看自动备份日志：

```bash
cd /opt/TikTokMonitor
tail -n 100 backups/backup.log
```

恢复备份前必须先停服务：

```bash
cd /opt/TikTokMonitor
docker compose stop tiktokmonitor-server
docker compose run --rm tiktokmonitor-server python scripts/sqlite_backup.py restore /app/backups/monitor_YYYYMMDD_HHMMSS_utc.db --yes
docker compose up -d
```

恢复命令会在覆盖当前数据库前生成一份 `pre_restore` 保护副本。

## 9. 更新服务端

如果服务器是通过 Git 克隆方式部署：

```bash
cd /opt/TikTokMonitor
git pull
docker compose up --build -d
docker compose ps
```

当前服务器是通过本地打包上传方式部署。后续如果继续由 Codex 代操作，可以把最新提交打包上传到 `/opt/TikTokMonitor`，再执行：

```bash
cd /opt/TikTokMonitor
docker compose up --build -d
```

更新前建议先做一次手动备份。

## 10. 安全建议

- 正式团队使用前，建议配置 HTTPS、VPN 或固定 IP 白名单。
- 不要公开暴露 `config.yaml`、`monitor.db`、备份文件、SSH 私钥或 API Key。
- 不要把 `server/config.yaml` 提交到 Git。
- 定期轮换 `web_password` 和 `api_key`。
- 新成员离开团队后，及时更换登录密码。
- 备份文件也包含业务数据，应按敏感数据处理。

## 11. 常见问题

### 页面打不开

先在服务器检查容器：

```bash
cd /opt/TikTokMonitor
docker compose ps
docker compose logs --tail=100 tiktokmonitor-server
```

再确认端口监听：

```bash
ss -ltnp | grep ':8099'
```

如果服务器本机正常但外部打不开，检查云厂商安全组或系统防火墙是否放行 `8099/tcp`。

### 登录失败

确认使用的是 `/root/tiktokmonitor-credentials.txt` 中的 `web_password`，不是 `api_key`。

如需重置密码，编辑：

```bash
/opt/TikTokMonitor/server/config.yaml
```

然后重启服务：

```bash
cd /opt/TikTokMonitor
docker compose restart tiktokmonitor-server
```

### 桌面端连接失败

确认桌面端服务器地址填写完整：

```text
http://170.106.117.104:8099
```

然后用浏览器打开同一个地址测试。如果浏览器也打不开，先按“页面打不开”排查服务器。

### 同步失败

查看同步日志和服务日志：

```bash
cd /opt/TikTokMonitor
docker compose logs --tail=200 tiktokmonitor-server
```

常见原因包括网络访问 TikTok 不稳定、代理配置为空、第三方 provider 临时不可用或账号链接格式不正确。

### 磁盘占用增长

检查 Docker 和备份目录：

```bash
df -h
du -sh /opt/TikTokMonitor/backups
docker system df
```

备份脚本默认保留 30 天。确认备份可用后，可以清理过旧文件。

## 12. 关键文件位置

- 服务部署目录：`/opt/TikTokMonitor`
- 生产配置：`/opt/TikTokMonitor/server/config.yaml`
- 登录凭据记录：`/root/tiktokmonitor-credentials.txt`
- 数据库：容器内 `/app/data/monitor.db`
- 备份目录：`/opt/TikTokMonitor/backups`
- Docker Compose：`/opt/TikTokMonitor/docker-compose.yml`
- 云部署指南：`docs/CLOUD_DEPLOYMENT.md`
