import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleDot,
  FileUp,
  LogOut,
  Play,
  Plus,
  RefreshCcw,
  Server,
  Settings as SettingsIcon,
  UserRound,
  Users,
  Video as VideoIcon
} from "lucide-react";
import {
  Account,
  AccountDetail,
  Alert,
  AccountFilters,
  createApiClient,
  DashboardData,
  Health,
  PageMeta,
  ProviderHealth,
  SessionState,
  Settings,
  Stats,
  SyncLog,
  Video
} from "./api";

const DEFAULT_SERVER = "http://127.0.0.1:8099";
type View = "dashboard" | "account" | "video" | "import" | "settings";
const EMPTY_PAGE_META: PageMeta = { page: 1, per_page: 1, total: 0, total_pages: 1 };

function compactNumber(value: number | undefined) {
  return new Intl.NumberFormat("zh-CN", { notation: "compact" }).format(value || 0);
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

function signedNumber(value: number | undefined) {
  const number = value || 0;
  return `${number > 0 ? "+" : ""}${compactNumber(number)}`;
}

export default function App() {
  const [serverUrl, setServerUrl] = useState(
    () => localStorage.getItem("tiktokmonitor.serverUrl") || DEFAULT_SERVER
  );
  const [sessionToken, setSessionToken] = useState(
    () => localStorage.getItem("tiktokmonitor.sessionToken") || ""
  );
  const [draftServerUrl, setDraftServerUrl] = useState(serverUrl);
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<SessionState | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [accountsMeta, setAccountsMeta] = useState<PageMeta>(EMPTY_PAGE_META);
  const [alertsMeta, setAlertsMeta] = useState<PageMeta>(EMPTY_PAGE_META);
  const [logsMeta, setLogsMeta] = useState<PageMeta>(EMPTY_PAGE_META);
  const [accountPage, setAccountPage] = useState(1);
  const [alertPage, setAlertPage] = useState(1);
  const [logPage, setLogPage] = useState(1);
  const [providers, setProviders] = useState<ProviderHealth[]>([]);
  const [view, setView] = useState<View>("dashboard");
  const [accountDetail, setAccountDetail] = useState<AccountDetail | null>(null);
  const [videoDetail, setVideoDetail] = useState<Video | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [alertLevel, setAlertLevel] = useState("");
  const [selectedAlertIds, setSelectedAlertIds] = useState<number[]>([]);
  const [newUsername, setNewUsername] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [accountFilters, setAccountFilters] = useState<AccountFilters>({ sort: "plays_desc" });
  const [importText, setImportText] = useState("");
  const [importGroup, setImportGroup] = useState("");
  const [importPhone, setImportPhone] = useState("");
  const [importEmployee, setImportEmployee] = useState("");
  const [importSync, setImportSync] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const api = useMemo(() => createApiClient(serverUrl, sessionToken), [serverUrl, sessionToken]);
  const authenticated = session ? session.authenticated || !session.auth_enabled : false;

  const loadData = useCallback(async (client = api) => {
    setBusy(true);
    setMessage("");
    try {
      const [nextSession, nextHealth] = await Promise.all([
        client.session(),
        client.health()
      ]);
      setSession(nextSession);
      setHealth(nextHealth);

      const nextAuthenticated = nextSession.authenticated || !nextSession.auth_enabled;
      if (!nextAuthenticated) {
        setDashboard(null);
        setStats(null);
        setAccounts([]);
        setAlerts([]);
        setLogs([]);
        setAccountsMeta(EMPTY_PAGE_META);
        setAlertsMeta(EMPTY_PAGE_META);
        setLogsMeta(EMPTY_PAGE_META);
        setProviders([]);
        setSelectedAlertIds([]);
        return;
      }

      const [nextDashboard, nextStats, nextAccounts, nextAlerts, nextLogs, nextProviders] = await Promise.all([
        client.dashboard(),
        client.stats(),
        client.accounts(accountPage, 50, accountFilters),
        client.alerts(alertPage, 30, unreadOnly, alertLevel),
        client.logs(logPage),
        client.providers()
      ]);
      setDashboard(nextDashboard);
      setStats(nextStats);
      setAccounts(nextAccounts.items);
      setAlerts(nextAlerts.items);
      setLogs(nextLogs.items);
      setAccountsMeta(nextAccounts.meta);
      setAlertsMeta(nextAlerts.meta);
      setLogsMeta(nextLogs.meta);
      setProviders(nextProviders);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "连接失败";
      setMessage(
        detail === "Failed to fetch"
          ? `连接失败：${serverUrl}。请确认服务器地址、端口、防火墙，以及 Windows 安装版是否已更新到最新版本。`
          : detail
      );
    } finally {
      setBusy(false);
    }
  }, [accountFilters, accountPage, alertLevel, alertPage, api, logPage, unreadOnly]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function login() {
    setBusy(true);
    setMessage("");
    try {
      const result = await api.login(password);
      if (result.session_token) {
        localStorage.setItem("tiktokmonitor.sessionToken", result.session_token);
        setSessionToken(result.session_token);
      }
      setPassword("");
      await loadData(result.session_token ? createApiClient(serverUrl, result.session_token) : api);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登录失败");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api.logout();
    localStorage.removeItem("tiktokmonitor.sessionToken");
    setSessionToken("");
    setSession({ authenticated: false, auth_enabled: true, api_key_enabled: false });
    setView("dashboard");
  }

  function saveServer() {
    const normalized = draftServerUrl.trim().replace(/\/+$/, "");
    localStorage.setItem("tiktokmonitor.serverUrl", normalized);
    localStorage.removeItem("tiktokmonitor.sessionToken");
    setSessionToken("");
    setServerUrl(normalized);
  }

  function updateAccountFilter(key: keyof AccountFilters, value: string) {
    setAccountFilters((current) => ({ ...current, [key]: value }));
    setAccountPage(1);
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

  async function openAccount(accountId: number, videoPage = 1, logPage = 1) {
    setBusy(true);
    try {
      setAccountDetail(await api.account(accountId, videoPage, logPage));
      setView("account");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法加载账号详情");
    } finally {
      setBusy(false);
    }
  }

  async function openVideo(videoId: number, historyPage = 1) {
    setBusy(true);
    try {
      setVideoDetail(await api.video(videoId, historyPage));
      setView("video");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法加载视频详情");
    } finally {
      setBusy(false);
    }
  }

  async function openSettings() {
    setBusy(true);
    try {
      setSettings(await api.settings());
      setView("settings");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法加载设置");
    } finally {
      setBusy(false);
    }
  }

  async function handleAlert(alert: Alert) {
    setBusy(true);
    try {
      if (!alert.is_read) {
        await api.markAlertRead(alert.id);
        setAlerts((current) => current.map((item) => item.id === alert.id ? { ...item, is_read: true } : item));
        setSelectedAlertIds((current) => current.filter((id) => id !== alert.id));
        setStats((current) => current ? { ...current, unread_alerts: Math.max(0, current.unread_alerts - 1) } : current);
      }
      if (alert.account_id) {
        await openAccount(alert.account_id);
      } else if (alert.video_id) {
        await openVideo(alert.video_id);
      } else {
        await loadData();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "告警操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function importAccounts() {
    if (!importText.trim()) return;
    setBusy(true);
    try {
      const result = await api.importAccounts({
        raw: importText,
        group_name: importGroup,
        phone: importPhone,
        employee: importEmployee,
        sync: importSync
      });
      setMessage(`导入完成：新增 ${result.added}，更新 ${result.updated}，已加入同步队列 ${result.queued}`);
      setImportText("");
      await loadData();
      setView("dashboard");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "批量导入失败");
    } finally {
      setBusy(false);
    }
  }

  async function markSelectedAlertsRead() {
    if (!selectedAlertIds.length) return;
    setBusy(true);
    try {
      const result = await api.markAlertsRead(selectedAlertIds);
      setMessage(`已标记 ${result.updated} 条告警为已读`);
      setSelectedAlertIds([]);
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "批量告警操作失败");
    } finally {
      setBusy(false);
    }
  }

  function updateSetting(section: keyof Settings, key: string, value: unknown) {
    setSettings((current) => ({
      ...current,
      [section]: { ...(current?.[section] || {}), [key]: value }
    }));
  }

  async function saveSettings() {
    if (!settings) return;
    setBusy(true);
    try {
      const result = await api.updateSettings({
        monitor: settings.monitor,
        sync: settings.sync,
        tiktok: settings.tiktok,
        alerts: settings.alerts,
        intelligence: settings.intelligence,
        notifications: { enabled: Boolean(settings.notifications?.enabled) }
      });
      setSettings(result.settings);
      setMessage("设置已保存，将在下一次同步中生效。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存设置失败");
    } finally {
      setBusy(false);
    }
  }

  const visibleAlerts = unreadOnly ? alerts.filter((alert) => !alert.is_read) : alerts;
  const viewTitles: Record<View, [string, string]> = {
    dashboard: ["团队监控台", "集中服务器，多平台客户端。"],
    account: ["账号详情", "账号资料、增长与同步记录。"],
    video: ["视频详情", "视频指标与历史快照。"],
    import: ["批量导入账号", "每行一个账号，可附带分组、手机和员工。"],
    settings: ["设置", "仅显示可安全编辑的服务端配置。"]
  };

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
              title={draftServerUrl}
              aria-label="服务器地址"
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
                onKeyDown={(event) => event.key === "Enter" && void login()}
              />
            </label>
            <button className="primary-button" disabled={busy} onClick={() => void login()}>
              登录
            </button>
          </section>
        ) : (
          <button className="ghost-button" onClick={() => void logout()}>
            <LogOut aria-hidden="true" />
            退出会话
          </button>
        )}

        <nav className="side-nav" aria-label="桌面端导航">
          <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>
            <Activity aria-hidden="true" />
            总览
          </button>
          <button className={view === "import" ? "active" : ""} disabled={!authenticated} onClick={() => setView("import")}>
            <FileUp aria-hidden="true" />
            批量导入
          </button>
          <button className={view === "settings" ? "active" : ""} disabled={!authenticated} onClick={() => void openSettings()}>
            <SettingsIcon aria-hidden="true" />
            设置
          </button>
        </nav>

        <div className="status-line">
          <CheckCircle2 aria-hidden="true" />
          <span>{health?.ok ? `服务 ${health.version}` : "等待连接"}</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>{viewTitles[view][0]}</h1>
            <p>{viewTitles[view][1]}</p>
          </div>
          <div className="topbar-actions">
            {view !== "dashboard" ? (
              <button className="ghost-light-button" onClick={() => setView("dashboard")}>
                <ArrowLeft aria-hidden="true" />
                返回总览
              </button>
            ) : null}
            <button className="icon-button" title="刷新" disabled={busy} onClick={() => void loadData()}>
              <RefreshCcw aria-hidden="true" />
            </button>
            {view === "dashboard" ? (
              <button className="primary-button" disabled={busy || !authenticated} onClick={() => void syncAll()}>
                <Play aria-hidden="true" />
                全部同步
              </button>
            ) : null}
          </div>
        </header>

        {message ? <div className="notice">{message}</div> : null}

        {view === "dashboard" ? (
          <Dashboard
            accounts={accounts}
            accountsMeta={accountsMeta}
            accountPage={accountPage}
            dashboard={dashboard}
            alerts={visibleAlerts}
            alertsMeta={alertsMeta}
            alertPage={alertPage}
            logs={logs}
            logsMeta={logsMeta}
            logPage={logPage}
            providers={providers}
            stats={stats}
            busy={busy}
            authenticated={authenticated}
            newUsername={newUsername}
            newGroup={newGroup}
            accountFilters={accountFilters}
            unreadOnly={unreadOnly}
            alertLevel={alertLevel}
            selectedAlertIds={selectedAlertIds}
            onUsernameChange={setNewUsername}
            onGroupChange={setNewGroup}
            onAccountFilterChange={updateAccountFilter}
            onUnreadOnlyChange={(value) => {
              setUnreadOnly(value);
              setAlertPage(1);
              setSelectedAlertIds([]);
            }}
            onAlertLevelChange={(value) => {
              setAlertLevel(value);
              setAlertPage(1);
              setSelectedAlertIds([]);
            }}
            onToggleAlert={(alertId, selected) => setSelectedAlertIds((current) => selected ? [...new Set([...current, alertId])] : current.filter((id) => id !== alertId))}
            onMarkSelected={() => void markSelectedAlertsRead()}
            onAccountPage={setAccountPage}
            onAlertPage={setAlertPage}
            onLogPage={setLogPage}
            onAdd={() => void addAccount()}
            onSync={(id) => void syncOne(id)}
            onOpenAccount={(id) => void openAccount(id)}
            onAlert={(alert) => void handleAlert(alert)}
            onReadAll={async () => {
              await api.markAllAlertsRead();
              await loadData();
            }}
          />
        ) : null}
        {view === "account" && accountDetail ? (
          <AccountPage
            account={accountDetail}
            busy={busy}
            onSync={() => void syncOne(accountDetail.id)}
            onVideo={(id) => void openVideo(id)}
            onVideoPage={(page) => void openAccount(accountDetail.id, page, accountDetail.logs_meta?.page || 1)}
            onLogPage={(page) => void openAccount(accountDetail.id, accountDetail.videos_meta?.page || 1, page)}
          />
        ) : null}
        {view === "video" && videoDetail ? <VideoPage video={videoDetail} onAccount={(id) => void openAccount(id)} onHistoryPage={(page) => void openVideo(videoDetail.id, page)} /> : null}
        {view === "import" ? (
          <ImportPage
            text={importText}
            group={importGroup}
            phone={importPhone}
            employee={importEmployee}
            sync={importSync}
            busy={busy}
            onText={setImportText}
            onGroup={setImportGroup}
            onPhone={setImportPhone}
            onEmployee={setImportEmployee}
            onSync={setImportSync}
            onSubmit={() => void importAccounts()}
          />
        ) : null}
        {view === "settings" ? <SettingsPage settings={settings} busy={busy} onChange={updateSetting} onSave={() => void saveSettings()} /> : null}
      </section>
    </main>
  );
}

function Dashboard({
  accounts,
  accountsMeta,
  accountPage,
  dashboard,
  alerts,
  alertsMeta,
  alertPage,
  logs,
  logsMeta,
  logPage,
  providers,
  stats,
  busy,
  authenticated,
  newUsername,
  newGroup,
  accountFilters,
  unreadOnly,
  alertLevel,
  selectedAlertIds,
  onUsernameChange,
  onGroupChange,
  onAccountFilterChange,
  onUnreadOnlyChange,
  onAlertLevelChange,
  onToggleAlert,
  onMarkSelected,
  onAccountPage,
  onAlertPage,
  onLogPage,
  onAdd,
  onSync,
  onOpenAccount,
  onAlert,
  onReadAll
}: {
  accounts: Account[];
  accountsMeta: PageMeta;
  accountPage: number;
  dashboard: DashboardData | null;
  alerts: Alert[];
  alertsMeta: PageMeta;
  alertPage: number;
  logs: SyncLog[];
  logsMeta: PageMeta;
  logPage: number;
  providers: ProviderHealth[];
  stats: Stats | null;
  busy: boolean;
  authenticated: boolean;
  newUsername: string;
  newGroup: string;
  accountFilters: AccountFilters;
  unreadOnly: boolean;
  alertLevel: string;
  selectedAlertIds: number[];
  onUsernameChange: (value: string) => void;
  onGroupChange: (value: string) => void;
  onAccountFilterChange: (key: keyof AccountFilters, value: string) => void;
  onUnreadOnlyChange: (value: boolean) => void;
  onAlertLevelChange: (value: string) => void;
  onToggleAlert: (alertId: number, selected: boolean) => void;
  onMarkSelected: () => void;
  onAccountPage: (page: number) => void;
  onAlertPage: (page: number) => void;
  onLogPage: (page: number) => void;
  onAdd: () => void;
  onSync: (id: number) => void;
  onOpenAccount: (id: number) => void;
  onAlert: (alert: Alert) => void;
  onReadAll: () => Promise<void>;
}) {
  const options = dashboard?.options || accountsMeta.options || { groups: [], phones: [], employees: [], sort_options: accountsMeta.sort_options || {} };
  const sortOptions = options.sort_options || accountsMeta.sort_options || {};
  const progress = dashboard?.sync.progress;
  const syncBusy = Boolean(progress?.running || (dashboard?.sync.queue_size || 0) > 0);
  const clearAccountFilters = () => {
    (["q", "group", "phone", "employee", "post_today"] as (keyof AccountFilters)[]).forEach((key) => onAccountFilterChange(key, ""));
    onAccountFilterChange("sort", "plays_desc");
  };
  return (
    <>
      <section className="metric-grid">
        <Metric icon={<Users />} label="账号" value={stats?.total_accounts} detail={`${stats?.active_accounts || 0} 个启用`} />
        <Metric icon={<Activity />} label="视频" value={stats?.total_videos} detail={`${compactNumber(stats?.total_plays)} 播放`} />
        <Metric icon={<AlertTriangle />} label="未读告警" value={stats?.unread_alerts} detail={`最近同步 ${formatDate(stats?.last_sync_at)}`} />
      </section>

      {dashboard ? (
        <>
          <section className="metric-grid today-grid">
            <Metric icon={<VideoIcon />} label="今日新发" value={dashboard.today.total_videos} detail={`${dashboard.today.date_label} · ${dashboard.today.tz_label}`} />
            <Metric icon={<Activity />} label="今日增播" value={dashboard.today.plays_increase} detail={`新发播放 ${compactNumber(dashboard.today.total_plays)}`} />
            <Metric icon={<CheckCircle2 />} label="今日已发" value={dashboard.today.posted_accounts} detail={`未发 ${dashboard.today.not_posted_accounts} 个账号`} />
          </section>

          {syncBusy ? (
            <section className="panel sync-strip">
              <strong>{progress?.running ? "同步中" : "同步队列等待中"}</strong>
              <span>
                {progress?.running
                  ? `${progress.completed || 0}/${progress.total || 0}${progress.current_username ? ` · @${progress.current_username}` : ""}`
                  : `队列 ${dashboard.sync.queue_size} 个`}
              </span>
            </section>
          ) : null}

          {dashboard.group_stats.length ? (
            <section className="chip-row" aria-label="大品类筛选">
              <button className={!accountFilters.group ? "active" : ""} onClick={() => onAccountFilterChange("group", "")}>全部品类</button>
              {dashboard.group_stats.map((group) => (
                <button
                  className={accountFilters.group === group.group_name ? "active" : ""}
                  key={group.group_name}
                  onClick={() => onAccountFilterChange("group", group.group_name)}
                >
                  {group.group_name}<span>{group.account_count}号 · {signedNumber(group.plays_24h)}</span>
                </button>
              ))}
            </section>
          ) : null}

          {dashboard.employee_report.rows.length ? (
            <section className="panel employee-report">
              <div className="panel-head">
                <h2>员工发文与播放</h2>
                <span>近 {dashboard.employee_report.days} 天</span>
              </div>
              <div className="table-wrap">
                <table className="compact-table">
                  <thead>
                    <tr>
                      <th>员工</th>
                      <th>账号</th>
                      <th>今日已发</th>
                      <th>今日新发播放</th>
                      <th>今日增播</th>
                      <th>周期发文</th>
                      <th>周期播放</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.employee_report.rows.slice(0, 8).map((row) => (
                      <tr key={row.employee}>
                        <td><button className="link-button" onClick={() => onAccountFilterChange("employee", row.employee)}>{row.employee}</button></td>
                        <td>{row.account_count}</td>
                        <td>{row.posted_today}/{row.account_count}</td>
                        <td>{compactNumber(row.today_new_plays)}</td>
                        <td>{signedNumber(row.today_plays_gain)}</td>
                        <td>{row.total_period}</td>
                        <td>{compactNumber(row.total_plays_period)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      <section className="entry-row">
        <input value={newUsername} onChange={(event) => onUsernameChange(event.target.value)} placeholder="TikTok 用户名或主页链接" />
        <input value={newGroup} onChange={(event) => onGroupChange(event.target.value)} placeholder="分组" />
        <button className="primary-button" disabled={busy || !authenticated} onClick={onAdd}>
          <Plus aria-hidden="true" />
          添加
        </button>
      </section>

      <section className="content-grid">
        <section className="panel panel-wide">
          <div className="panel-head">
            <h2>账号</h2>
            <span>{accountsMeta.total} 条</span>
          </div>
          <div className="account-filter-grid">
            <input value={accountFilters.q || ""} onChange={(event) => onAccountFilterChange("q", event.target.value)} placeholder="搜用户名、品类、手机、员工、备注…" />
            <select className="filter-select" value={accountFilters.group || ""} onChange={(event) => onAccountFilterChange("group", event.target.value)}>
              <option value="">全部品类</option>
              {options.groups.map((value) => <option value={value} key={value}>{value}</option>)}
            </select>
            <select className="filter-select" value={accountFilters.phone || ""} onChange={(event) => onAccountFilterChange("phone", event.target.value)}>
              <option value="">全部手机</option>
              {options.phones.map((value) => <option value={value} key={value}>{value}</option>)}
            </select>
            <select className="filter-select" value={accountFilters.employee || ""} onChange={(event) => onAccountFilterChange("employee", event.target.value)}>
              <option value="">全部员工</option>
              {options.employees.map((value) => <option value={value} key={value}>{value}</option>)}
              <option value="未分配">未分配</option>
            </select>
            <select className="filter-select" value={accountFilters.post_today || ""} onChange={(event) => onAccountFilterChange("post_today", event.target.value)}>
              <option value="">今日发文：全部</option>
              <option value="yes">今日已发</option>
              <option value="no">今日未发</option>
            </select>
            <select className="filter-select" value={accountFilters.sort || "plays_desc"} onChange={(event) => onAccountFilterChange("sort", event.target.value)}>
              {Object.entries(sortOptions).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
            </select>
            <button className="ghost-light-button" onClick={clearAccountFilters}>清除筛选</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>账号</th><th>标签</th><th>粉丝</th><th>今日</th><th>新发播放</th><th>今日增播</th><th>总播放</th><th>24h</th><th></th></tr></thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <td><button className="link-button" onClick={() => onOpenAccount(account.id)}>@{account.username}</button><span>{account.nickname || account.employee || "未标注"}</span></td>
                    <td><span>{account.group || "未分组"}</span><small>{account.phone || "-"} · {account.employee || "未分配"}</small></td>
                    <td>{compactNumber(account.followers)}</td>
                    <td>{account.posted_today ? <span className="post-badge post-yes">+{account.today_post_count || 0}</span> : <span className="post-badge post-no">未发</span>}</td>
                    <td>{account.today_new_plays ? compactNumber(account.today_new_plays) : "-"}</td>
                    <td>{signedNumber(account.growth?.today_plays_increase)}</td>
                    <td>{compactNumber(account.total_plays)}</td>
                    <td>{signedNumber(account.growth?.plays_increase)}</td>
                    <td><button className="icon-button" title="同步账号" disabled={busy || !authenticated} onClick={() => onSync(account.id)}><RefreshCcw aria-hidden="true" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PageControls meta={accountsMeta} page={accountPage} onPage={onAccountPage} />
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>告警</h2>
            <div className="panel-actions">
              <label className="check-label"><input type="checkbox" checked={unreadOnly} onChange={(event) => onUnreadOnlyChange(event.target.checked)} /> 未读</label>
              <select className="filter-select" value={alertLevel} onChange={(event) => onAlertLevelChange(event.target.value)}>
                <option value="">全部级别</option>
                <option value="info">信息</option>
                <option value="warning">警告</option>
                <option value="error">错误</option>
              </select>
              <button className="text-button" disabled={busy || !authenticated || !selectedAlertIds.length} onClick={onMarkSelected}>标记所选已读</button>
              <button className="text-button" disabled={busy || !authenticated || !stats?.unread_alerts} onClick={() => void onReadAll()}>全部已读</button>
            </div>
          </div>
          <div className="stack-list">
            {alerts.map((alert) => (
              <article className={`list-item alert-item ${alert.is_read ? "" : "item-hot"}`} key={alert.id}>
                <label className="alert-select"><input type="checkbox" checked={selectedAlertIds.includes(alert.id)} onChange={(event) => onToggleAlert(alert.id, event.target.checked)} aria-label="选择告警" /></label>
                <button className="list-action" onClick={() => onAlert(alert)}>
                  <strong>{alert.title || alert.type}</strong><span>{alert.message}</span><small>{formatDate(alert.created_at)}{!alert.is_read ? " · 点击查看并标为已读" : ""}</small>
                </button>
              </article>
            ))}
            {!alerts.length ? <p className="empty-state">暂无符合条件的告警。</p> : null}
          </div>
          <PageControls meta={alertsMeta} page={alertPage} onPage={onAlertPage} />
        </section>

        <section className="panel">
          <div className="panel-head"><h2>同步日志</h2><span>{logsMeta.total} 条</span></div>
          <div className="stack-list">
            {logs.map((log) => <article className="list-item" key={log.id}><strong>{log.username || "系统"}</strong><span>{log.message || log.status}</span><small>{formatDate(log.created_at)}</small></article>)}
          </div>
          <PageControls meta={logsMeta} page={logPage} onPage={onLogPage} />
        </section>

        <section className="panel">
          <div className="panel-head"><h2>采集源</h2><span>{providers.length} 个</span></div>
          <div className="provider-grid">
            {providers.map((provider) => <article className="provider-tile" key={provider.provider}><strong>{provider.provider}</strong><span>成功 {provider.success_count || 0}</span><span>失败 {provider.failure_count || 0}</span></article>)}
          </div>
        </section>
      </section>
    </>
  );
}

function AccountPage({ account, busy, onSync, onVideo, onVideoPage, onLogPage }: {
  account: AccountDetail;
  busy: boolean;
  onSync: () => void;
  onVideo: (id: number) => void;
  onVideoPage: (page: number) => void;
  onLogPage: (page: number) => void;
}) {
  const growth = account.growth;
  const videos = [...account.video_items].sort((left, right) => {
    return new Date(right.published_at || 0).getTime() - new Date(left.published_at || 0).getTime();
  });
  return <section className="detail-layout">
    <section className="panel profile-panel">
      <div className="profile-heading">
        {account.avatar_url ? <img className="avatar" src={account.avatar_url} alt="" /> : <UserRound aria-hidden="true" />}
        <div><h2>@{account.username}</h2><p>{account.nickname || "未设置昵称"} · {account.group || "未分组"}</p></div>
      </div>
      <button className="primary-button" disabled={busy} onClick={onSync}><RefreshCcw aria-hidden="true" />同步账号</button>
    </section>
    <section className="metric-grid detail-metrics">
      <Metric icon={<Users />} label="粉丝" value={account.followers} detail={`24h ${signedNumber(growth?.follower_delta)}`} />
      <Metric icon={<VideoIcon />} label="视频" value={account.videos} detail={`TikTok 显示 ${account.tiktok_video_count || 0}`} />
      <Metric icon={<Activity />} label="总播放" value={account.total_plays} detail={`24h ${signedNumber(growth?.plays_delta)}`} />
      <Metric icon={<AlertTriangle />} label="互动率" value={account.engagement_rate} detail={`今日播放 ${signedNumber(growth?.today_plays_increase)}`} />
    </section>
    {account.trend?.labels.length ? (
      <section className="panel">
        <div className="panel-head"><h2>账号趋势</h2><span>最近 {account.trend.labels.length} 个快照</span></div>
        <TrendChart
          labels={account.trend.labels}
          series={[
            { label: "粉丝", values: account.trend.followers, color: "#0c6e7e" },
            { label: "播放", values: account.trend.plays, color: "#f28c52" }
          ]}
        />
      </section>
    ) : null}
    <section className="panel">
      <div className="panel-head"><h2>最近视频</h2><span>{videos.length} 条</span></div>
      <div className="table-wrap"><table><thead><tr><th>标题</th><th>播放</th><th>点赞</th><th>评论</th><th>发布时间</th></tr></thead><tbody>
        {videos.map((video) => <tr key={video.id}><td><button className="link-button" onClick={() => onVideo(video.id)}>{video.title || "无标题视频"}</button></td><td>{compactNumber(video.play_count)}</td><td>{compactNumber(video.like_count)}</td><td>{compactNumber(video.comment_count)}</td><td>{formatDate(video.published_at)}</td></tr>)}
      </tbody></table></div>
      <PageControls meta={account.videos_meta || EMPTY_PAGE_META} page={account.videos_meta?.page || 1} onPage={onVideoPage} />
    </section>
    <section className="panel">
      <div className="panel-head"><h2>最近同步记录</h2><span>{account.logs.length} 条</span></div>
      <div className="stack-list">{account.logs.map((log) => <article className="list-item" key={log.id}><strong>{log.status}</strong><span>{log.message || "同步完成"}</span><small>{formatDate(log.created_at)} · 更新 {log.videos_updated} 个视频</small></article>)}</div>
      <PageControls meta={account.logs_meta || EMPTY_PAGE_META} page={account.logs_meta?.page || 1} onPage={onLogPage} />
    </section>
  </section>;
}

function VideoPage({ video, onAccount, onHistoryPage }: { video: Video; onAccount: (id: number) => void; onHistoryPage: (page: number) => void }) {
  return <section className="detail-layout">
    <section className="panel profile-panel">
      <div className="profile-heading">
        {video.cover_url ? <img className="video-cover" src={video.cover_url} alt="" /> : <VideoIcon aria-hidden="true" />}
        <div><h2>{video.title || "无标题视频"}</h2>{video.account ? <button className="link-button" onClick={() => onAccount(video.account!.id)}>@{video.account.username}</button> : null}</div>
      </div>
      {video.video_id ? <a className="ghost-light-button" href={`https://www.tiktok.com/@${video.account?.username || ""}/video/${video.video_id}`} target="_blank" rel="noreferrer">打开 TikTok</a> : null}
    </section>
    <section className="metric-grid detail-metrics">
      <Metric icon={<Activity />} label="播放" value={video.play_count} detail={`发布于 ${formatDate(video.published_at)}`} />
      <Metric icon={<CheckCircle2 />} label="点赞" value={video.like_count} detail="当前累计" />
      <Metric icon={<AlertTriangle />} label="评论" value={video.comment_count} detail={`分享 ${compactNumber(video.share_count)}`} />
    </section>
    {video.history?.length ? (
      <section className="panel">
        <div className="panel-head"><h2>视频趋势</h2><span>{video.history.length} 个快照</span></div>
        <TrendChart
          labels={video.history.map((row) => formatDate(row.recorded_at))}
          series={[
            { label: "播放", values: video.history.map((row) => row.play_count), color: "#f28c52" },
            { label: "点赞", values: video.history.map((row) => row.like_count), color: "#0c6e7e" }
          ]}
        />
      </section>
    ) : null}
    <section className="panel">
      <div className="panel-head"><h2>指标历史</h2><span>{video.history?.length || 0} 个快照</span></div>
      <div className="table-wrap"><table><thead><tr><th>记录时间</th><th>播放</th><th>点赞</th><th>评论</th><th>分享</th></tr></thead><tbody>
        {(video.history || []).map((row) => <tr key={row.id}><td>{formatDate(row.recorded_at)}</td><td>{compactNumber(row.play_count)}</td><td>{compactNumber(row.like_count)}</td><td>{compactNumber(row.comment_count)}</td><td>{compactNumber(row.share_count)}</td></tr>)}
      </tbody></table></div>
      <PageControls meta={video.history_meta || EMPTY_PAGE_META} page={video.history_meta?.page || 1} onPage={onHistoryPage} />
      {!video.history?.length ? <p className="empty-state">尚无历史快照；完成多次同步后将显示指标变化。</p> : null}
    </section>
  </section>;
}

function ImportPage({ text, group, phone, employee, sync, busy, onText, onGroup, onPhone, onEmployee, onSync, onSubmit }: {
  text: string; group: string; phone: string; employee: string; sync: boolean; busy: boolean;
  onText: (value: string) => void; onGroup: (value: string) => void; onPhone: (value: string) => void; onEmployee: (value: string) => void; onSync: (value: boolean) => void; onSubmit: () => void;
}) {
  return <section className="panel form-panel">
    <p className="form-help">每行填写一个用户名或 TikTok 主页链接。也可使用逗号、制表符或竖线追加：用户名、分组、手机、员工、备注。</p>
    <textarea value={text} onChange={(event) => onText(event.target.value)} placeholder={"username\nusername, 分组, 手机, 员工, 备注"} rows={12} />
    <div className="form-grid"><label>默认分组<input value={group} onChange={(event) => onGroup(event.target.value)} /></label><label>默认手机<input value={phone} onChange={(event) => onPhone(event.target.value)} /></label><label>默认员工<input value={employee} onChange={(event) => onEmployee(event.target.value)} /></label></div>
    <label className="check-label"><input type="checkbox" checked={sync} onChange={(event) => onSync(event.target.checked)} /> 导入后立即加入同步队列</label>
    <button className="primary-button" disabled={busy || !text.trim()} onClick={onSubmit}><FileUp aria-hidden="true" />开始导入</button>
  </section>;
}

function SettingsPage({ settings, busy, onChange, onSave }: { settings: Settings | null; busy: boolean; onChange: (section: keyof Settings, key: string, value: unknown) => void; onSave: () => void }) {
  if (!settings) return <p className="empty-state">正在加载设置…</p>;
  const value = (section: keyof Settings, key: string) => String(settings[section]?.[key] ?? "");
  const number = (section: keyof Settings, key: string, next: string) => onChange(section, key, next === "" ? 0 : Number(next));
  return <section className="settings-grid">
    <section className="panel form-panel"><h2>监控与同步</h2><div className="form-grid"><label>同步间隔（分钟）<input type="number" min="1" value={value("monitor", "interval_minutes")} onChange={(e) => number("monitor", "interval_minutes", e.target.value)} /></label><label>每账号最大视频数<input type="number" min="1" value={value("monitor", "max_videos_per_account")} onChange={(e) => number("monitor", "max_videos_per_account", e.target.value)} /></label><label>同步并发数<input type="number" min="1" value={value("sync", "max_workers")} onChange={(e) => number("sync", "max_workers", e.target.value)} /></label><label>最大重试次数<input type="number" min="0" value={value("sync", "max_retries")} onChange={(e) => number("sync", "max_retries", e.target.value)} /></label></div></section>
    <section className="panel form-panel"><h2>采集与告警</h2><div className="form-grid"><label>采集提供方<input value={value("tiktok", "provider")} onChange={(e) => onChange("tiktok", "provider", e.target.value)} /></label><label>播放激增阈值<input type="number" min="0" value={value("alerts", "play_surge_threshold")} onChange={(e) => number("alerts", "play_surge_threshold", e.target.value)} /></label><label>掉粉阈值<input type="number" min="0" value={value("alerts", "follower_drop_threshold")} onChange={(e) => number("alerts", "follower_drop_threshold", e.target.value)} /></label><label>告警冷却（小时）<input type="number" min="0" value={value("alerts", "cooldown_hours")} onChange={(e) => number("alerts", "cooldown_hours", e.target.value)} /></label></div><label className="check-label"><input type="checkbox" checked={Boolean(settings.alerts?.enabled)} onChange={(e) => onChange("alerts", "enabled", e.target.checked)} /> 启用告警</label><label className="check-label"><input type="checkbox" checked={Boolean(settings.notifications?.enabled)} onChange={(e) => onChange("notifications", "enabled", e.target.checked)} /> 启用通知发送</label></section>
    <div className="settings-actions"><button className="primary-button" disabled={busy} onClick={onSave}><SettingsIcon aria-hidden="true" />保存设置</button><span>密码、API Key 与 Webhook 不会在桌面端显示或编辑。</span></div>
  </section>;
}

function Metric({ icon, label, value, detail }: { icon: JSX.Element; label: string; value: number | undefined; detail: string }) {
  return <article className="metric-card"><div className="metric-icon">{icon}</div><div><span>{label}</span><strong>{label === "互动率" ? `${value || 0}%` : compactNumber(value)}</strong><small>{detail}</small></div></article>;
}

function PageControls({ meta, page, onPage }: { meta: PageMeta; page: number; onPage: (page: number) => void }) {
  if (meta.total_pages <= 1) return null;
  return (
    <nav className="page-controls" aria-label="分页导航">
      <span>第 {page} / {meta.total_pages} 页，共 {meta.total} 条</span>
      <button className="ghost-light-button" disabled={page <= 1} onClick={() => onPage(page - 1)}>上一页</button>
      <button className="ghost-light-button" disabled={page >= meta.total_pages} onClick={() => onPage(page + 1)}>下一页</button>
    </nav>
  );
}

function TrendChart({ labels, series }: { labels: string[]; series: { label: string; values: number[]; color: string }[] }) {
  const width = 720;
  const height = 220;
  const padding = { top: 18, right: 18, bottom: 34, left: 42 };
  const maxPoints = Math.max(...series.flatMap((item) => item.values), 1);
  const minPoints = Math.min(...series.flatMap((item) => item.values), 0);
  const range = Math.max(1, maxPoints - minPoints);
  const x = (index: number) => padding.left + (index * (width - padding.left - padding.right)) / Math.max(1, labels.length - 1);
  const y = (value: number) => padding.top + ((maxPoints - value) * (height - padding.top - padding.bottom)) / range;
  const path = (values: number[]) => values.map((value, index) => `${index ? "L" : "M"}${x(index)},${y(value)}`).join(" ");
  const labelIndexes = Array.from(new Set([0, Math.floor((labels.length - 1) / 2), Math.max(0, labels.length - 1)]));

  return (
    <div className="trend-chart">
      <div className="trend-legend">{series.map((item) => <span key={item.label}><i style={{ background: item.color }} />{item.label}</span>)}</div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="趋势图">
        {[0, 0.5, 1].map((ratio) => <line key={ratio} x1={padding.left} x2={width - padding.right} y1={padding.top + ratio * (height - padding.top - padding.bottom)} y2={padding.top + ratio * (height - padding.top - padding.bottom)} />)}
        {series.map((item) => <path key={item.label} d={path(item.values)} stroke={item.color} />)}
        {labelIndexes.map((index) => <text key={index} x={x(index)} y={height - 10} textAnchor="middle">{labels[index]}</text>)}
      </svg>
    </div>
  );
}
