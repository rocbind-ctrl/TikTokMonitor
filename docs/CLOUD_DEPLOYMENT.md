# Cloud Deployment Guide

This guide deploys TikTokMonitor as one central Docker service on an Ubuntu
cloud server. Keep production secrets on the server only; do not commit them to
Git.

## Recommended Server

- Ubuntu 22.04 LTS or 24.04 LTS
- 2 CPU, 2-4 GB RAM
- 30 GB or larger disk
- Docker and Docker Compose plugin
- Open port `8099` for internal testing, or expose the service through HTTPS,
  VPN, or a fixed-IP allowlist for team use

## Install Docker on Ubuntu

Run these commands on the server:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
```

Optional: allow the current user to run Docker without `sudo`.

```bash
sudo usermod -aG docker "$USER"
```

Log out and back in before using Docker without `sudo`.

## Deploy

Clone the repository:

```bash
git clone https://github.com/netwebqi/TikTokMonitor.git
cd TikTokMonitor
```

Create the server-local config:

```bash
cp server/config.example.yaml server/config.yaml
chmod 600 server/config.yaml
mkdir -p backups
```

Edit `server/config.yaml`:

```yaml
server:
  host: "0.0.0.0"
  port: 8099
  mode: "web"

security:
  web_password: "replace-with-a-random-password"
  api_key: "replace-with-a-random-long-token"
```

Start the service:

```bash
docker compose up --build -d
docker compose ps
docker compose logs --tail=100 tiktokmonitor-server
```

For initial testing, open:

```text
http://SERVER_IP:8099
```

For team use, prefer HTTPS reverse proxy, VPN, or fixed-IP allowlists instead
of a fully public port.

## Backup

Create a manual backup:

```bash
docker compose exec tiktokmonitor-server python scripts/sqlite_backup.py backup --keep-days 30
ls -lh backups
```

Add a daily cron backup at 03:30 server time:

```bash
crontab -e
```

Add this line, replacing `/opt/TikTokMonitor` with the repository path:

```cron
30 3 * * * cd /opt/TikTokMonitor && docker compose exec -T tiktokmonitor-server python scripts/sqlite_backup.py backup --keep-days 30 >> backups/backup.log 2>&1
```

## Restore Drill

Run restores only when the service is stopped:

```bash
docker compose stop tiktokmonitor-server
docker compose run --rm tiktokmonitor-server python scripts/sqlite_backup.py restore /app/backups/monitor_YYYYMMDD_HHMMSS_utc.db --yes
docker compose up -d
```

The restore command creates a `pre_restore` copy of the previous live database
before replacing it.

## Update

Pull the latest code and rebuild:

```bash
git pull
docker compose up --build -d
docker compose ps
```

If an update fails, roll back to the previous commit:

```bash
git log --oneline -n 5
git checkout PREVIOUS_COMMIT
docker compose up --build -d
```

Return to `master` after the issue is fixed:

```bash
git checkout master
git pull
```

## Operational Checks

- Web login works with the production password.
- Desktop client can connect to the server URL.
- Adding an account writes data successfully.
- Restarting the container keeps existing data.
- `backups/` contains recent `monitor_*.db` files.
- A restore drill has been tested before team data becomes important.
