import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  LogOut,
  Play,
  Plus,
  RefreshCcw,
  Server,
  Users
} from "lucide-react";
import {
  Account,
  Alert,
  createApiClient,
  Health,
  ProviderHealth,
  SessionState,
  Stats,
  SyncLog
} from "./api";

const DEFAULT_SERVER = "http://127.0.0.1:8099";

function compactNumber(value: number | undefined) {
  const n = value || 0;
  return new Intl.NumberFormat("zh-CN", { notation: "compact" }).format(n);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export default function App() {
  const [serverUrl, setServerUrl] = useState(
    () => localStorage.getItem("tiktokmonitor.serverUrl") || DEFAULT_SERVER
  );
  const [draftServerUrl, setDraftServerUrl] = useState(serverUrl);
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<SessionState | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [providers, setProviders] = useState<ProviderHealth[]>([]);
  const [newUsername, setNewUsername] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const api = useMemo(() => createApiClient(serverUrl), [serverUrl]);

  const loadData = useCallback(async () => {
    setBusy(true);
    setMessage("");
    try {
      const [nextSession, nextHealth, nextStats, nextAccounts, nextAlerts, nextLogs, nextProviders] =
        await Promise.all([
          api.session(),
          api.health(),
          api.stats(),
          api.accounts(),
          api.alerts(),
          api.logs(),
          api.providers()
        ]);
      setSession(nextSession);
      setHealth(nextHealth);
      setStats(nextStats);
      setAccounts(nextAccounts);
      setAlerts(nextAlerts);
      setLogs(nextLogs);
      setProviders(nextProviders);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "连接失败");
    } finally {
      setBusy(false);
    }
  }, [api]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function login() {
    setBusy(true);
    setMessage("");
    try {
      await api.login(password);
      setPassword("");
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登录失败");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api.logout();
    setSession({ authenticated: false, auth_enabled: true, api_key_enabled: false });
  }

  async function saveServer() {
    const normalized = draftServerUrl.trim().replace(/\/+$/, "");
    localStorage.setItem("tiktokmonitor.serverUrl", normalized);
    setServerUrl(normalized);
  }

  async function addAccount() {
    if (!newUsername.trim()) return;
    setBusy(true);
    try {
      const result = await api.addAccount(newUsername, newGroup);
      setMessage(result.message);
      setNewUsername("");
      setNewGroup("");
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "添加失败");
    } finally {
      setBusy(false);
    }
  }

  async function syncAll() {
    setBusy(true);
    try {
      const result = await api.syncAll();
      setMessage(result.message);
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "同步失败");
    } finally {
      setBusy(false);
    }
  }

  async function syncOne(accountId: number) {
    setBusy(true);
    try {
      const result = await api.syncAccount(accountId);
      setMessage(result.message);
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "同步失败");
    } finally {
      setBusy(false);
    }
  }

  const authenticated = session ? session.authenticated || !session.auth_enabled : false;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <CircleDot aria-hidden="true" />
          <div>
            <strong>TikTokMonitor</strong>
            <span>Desktop Console</span>
          </div>
        </div>

        <label className="field">
          <span>服务器</span>
          <div className="server-row">
            <input
              value={draftServerUrl}
              onChange={(event) => setDraftServerUrl(event.target.value)}
              placeholder={DEFAULT_SERVER}
            />
            <button className="icon-button" title="保存服务器地址" onClick={saveServer}>
              <Server aria-hidden="true" />
            </button>
          </div>
        </label>

        {session?.auth_enabled && !authenticated ? (
          <section className="login-box">
            <label className="field">
              <span>密码</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void login();
                }}
              />
            </label>
            <button className="primary-button" disabled={busy} onClick={login}>
              登录
            </button>
          </section>
        ) : (
          <button className="ghost-button" onClick={logout}>
            <LogOut aria-hidden="true" />
            退出会话
          </button>
        )}

        <div className="status-line">
          <CheckCircle2 aria-hidden="true" />
          <span>{health?.ok ? `服务 ${health.version}` : "等待连接"}</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>团队监控台</h1>
            <p>集中服务端，多平台客户端。</p>
          </div>
          <div className="topbar-actions">
            <button className="icon-button" title="刷新" disabled={busy} onClick={() => void loadData()}>
              <RefreshCcw aria-hidden="true" />
            </button>
            <button className="primary-button" disabled={busy || !authenticated} onClick={() => void syncAll()}>
              <Play aria-hidden="true" />
              全部同步
            </button>
          </div>
        </header>

        {message ? <div className="notice">{message}</div> : null}

        <section className="metric-grid">
          <Metric icon={<Users />} label="账号" value={stats?.total_accounts} detail={`${stats?.active_accounts || 0} 个启用`} />
          <Metric icon={<Activity />} label="视频" value={stats?.total_videos} detail={`${compactNumber(stats?.total_plays)} 播放`} />
          <Metric icon={<AlertTriangle />} label="未读告警" value={stats?.unread_alerts} detail={`最近同步 ${formatDate(stats?.last_sync_at)}`} />
        </section>

        <section className="entry-row">
          <input
            value={newUsername}
            onChange={(event) => setNewUsername(event.target.value)}
            placeholder="TikTok 用户名或主页链接"
          />
          <input
            value={newGroup}
            onChange={(event) => setNewGroup(event.target.value)}
            placeholder="分组"
          />
          <button className="primary-button" disabled={busy || !authenticated} onClick={() => void addAccount()}>
            <Plus aria-hidden="true" />
            添加
          </button>
        </section>

        <section className="content-grid">
          <section className="panel panel-wide">
            <div className="panel-head">
              <h2>账号</h2>
              <span>{accounts.length} 条</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>账号</th>
                    <th>分组</th>
                    <th>粉丝</th>
                    <th>视频</th>
                    <th>总播放</th>
                    <th>最后同步</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
                    <tr key={account.id}>
                      <td>
                        <strong>@{account.username}</strong>
                        <span>{account.nickname || account.employee || "未标注"}</span>
                      </td>
                      <td>{account.group || "-"}</td>
                      <td>{compactNumber(account.followers)}</td>
                      <td>{account.videos}</td>
                      <td>{compactNumber(account.total_plays)}</td>
                      <td>{formatDate(account.last_sync)}</td>
                      <td>
                        <button
                          className="icon-button"
                          title="同步账号"
                          disabled={busy || !authenticated}
                          onClick={() => void syncOne(account.id)}
                        >
                          <RefreshCcw aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>告警</h2>
              <button
                className="text-button"
                disabled={busy || !authenticated}
                onClick={async () => {
                  await api.markAllAlertsRead();
                  await loadData();
                }}
              >
                全部已读
              </button>
            </div>
            <div className="stack-list">
              {alerts.slice(0, 8).map((alert) => (
                <article className={`list-item ${alert.is_read ? "" : "item-hot"}`} key={alert.id}>
                  <strong>{alert.title || alert.type}</strong>
                  <span>{alert.message}</span>
                  <small>{formatDate(alert.created_at)}</small>
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>同步日志</h2>
              <span>{logs.length} 条</span>
            </div>
            <div className="stack-list">
              {logs.slice(0, 8).map((log) => (
                <article className="list-item" key={log.id}>
                  <strong>{log.username || "系统"}</strong>
                  <span>{log.message || log.status}</span>
                  <small>{formatDate(log.created_at)}</small>
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>采集源</h2>
              <span>{providers.length} 个</span>
            </div>
            <div className="provider-grid">
              {providers.map((provider) => (
                <article className="provider-tile" key={provider.provider}>
                  <strong>{provider.provider}</strong>
                  <span>成功 {provider.success_count || 0}</span>
                  <span>失败 {provider.failure_count || 0}</span>
                </article>
              ))}
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}

function Metric({
  icon,
  label,
  value,
  detail
}: {
  icon: JSX.Element;
  label: string;
  value: number | undefined;
  detail: string;
}) {
  return (
    <article className="metric-card">
      <div className="metric-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{compactNumber(value)}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}
