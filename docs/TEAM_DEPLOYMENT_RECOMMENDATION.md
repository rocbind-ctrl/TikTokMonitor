# 团队部署建议

## 最佳方案

推荐使用“中心服务端 + 多客户端连接”的模式：

```text
Windows/macOS/Linux 客户端
        |
        | HTTP/HTTPS
        v
中心 FastAPI 服务端
        |
        v
SQLite 数据库 / 后续 PostgreSQL
```

## 为什么不建议每个人本地各跑一份

- 多台电脑各自抓取 TikTok，容易造成数据不一致和请求压力升高。
- SQLite 不适合多人从不同机器同时直接读写同一个数据库文件。
- 每台机器都要配置 Python、依赖、定时任务和数据备份，维护成本高。
- 告警、同步日志、审计记录分散，团队协作不方便。

## 部署位置优先级

1. 云服务器或公司内网服务器：最推荐，稳定、可远程访问、易备份。
2. NAS Docker：适合团队都在同一网络或已有 VPN 的情况，成本低。
3. 局域网固定电脑：可以临时使用，但要保证电脑长期在线。
4. 每个人本地独立运行：只适合单人测试，不建议团队正式使用。

## 当前阶段建议

- 小团队内测：先把 `server/` 部署在一台固定 Windows/Mac/NAS 上。
- 正式使用：迁移到云服务器或 NAS Docker，配置 HTTPS 或 VPN。
- 数据量变大后：从 SQLite 迁移到 PostgreSQL。

## 安全要求

- 修改 `config.yaml` 里的 `security.web_password`。
- 使用随机长字符串作为 `security.api_key`。
- 不要把 `config.yaml` 和 `data/monitor.db` 提交到 GitHub。
- 远程访问优先走 VPN 或 HTTPS 反向代理。
- 定期备份 `data/monitor.db`。
