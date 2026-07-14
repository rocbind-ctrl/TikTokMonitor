import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleDot,
  Copy,
  ExternalLink,
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
  AccountUpdate,
  Alert,
  AccountFilters,
  AuditFilters,
  AuditLog,
  BackupList,
  createApiClient,
  DashboardData,
  DataQuality,
  DataQualityCard,
  Health,
  InsightsData,
  LogFilters,
  PageMeta,
  ProviderHealth,
  SessionState,
  Settings,
  Stats,
  SyncLog,
  Video
} from "./api";

const DEFAULT_SERVER = "http://127.0.0.1:8099";
type View = "dashboard" | "quality" | "insights" | "account" | "video" | "alerts" | "logs" | "audit" | "providers" | "operations" | "backups" | "import" | "settings" | "help";
type SavedAccountFilter = { id: string; name: string; filters: AccountFilters };
type OperationState = {
  status: "running" | "success" | "error";
  title: string;
  detail: string;
  timestamp: string;
  key?: string;
  durationMs?: number;
};
const EMPTY_PAGE_META: PageMeta = { page: 1, per_page: 1, total: 0, total_pages: 1 };
const SAVED_ACCOUNT_FILTERS_KEY = "tiktokmonitor.savedAccountFilters";
const OPERATION_HISTORY_KEY = "tiktokmonitor.operationHistory";

function compactNumber(value: number | undefined) {
  return new Intl.NumberFormat("zh-CN", { notation: "compact" }).format(value || 0);
}

function formatBytes(value: number | undefined) {
  const bytes = value || 0;
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
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

function profileUrl(username: string | undefined) {
  const clean = (username || "").replace(/^@/, "").trim();
  return clean ? `https://www.tiktok.com/@${clean}` : "";
}

function videoUrlForUsername(username: string | undefined, videoId: string | undefined) {
  const cleanVideoId = (videoId || "").trim();
  const accountUrl = profileUrl(username);
  return accountUrl && cleanVideoId ? `${accountUrl}/video/${cleanVideoId}` : "";
}

function videoUrl(video: Pick<Video, "video_id" | "account">) {
  return videoUrlForUsername(video.account?.username, video.video_id);
}

function operationTime() {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date());
}

function formatDuration(value: number | undefined) {
  if (!value) return "";
  const seconds = Math.max(1, Math.round(value / 1000));
  return seconds >= 60 ? `${Math.floor(seconds / 60)}分${seconds % 60}秒` : `${seconds}秒`;
}

function errorDetail(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
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
  const [dataQuality, setDataQuality] = useState<DataQuality | null>(null);
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [accountsMeta, setAccountsMeta] = useState<PageMeta>(EMPTY_PAGE_META);
  const [alertsMeta, setAlertsMeta] = useState<PageMeta>(EMPTY_PAGE_META);
  const [logsMeta, setLogsMeta] = useState<PageMeta>(EMPTY_PAGE_META);
  const [auditMeta, setAuditMeta] = useState<PageMeta>(EMPTY_PAGE_META);
  const [accountPage, setAccountPage] = useState(1);
  const [alertPage, setAlertPage] = useState(1);
  const [logPage, setLogPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [providers, setProviders] = useState<ProviderHealth[]>([]);
  const [backups, setBackups] = useState<BackupList | null>(null);
  const [view, setView] = useState<View>("dashboard");
  const [accountDetail, setAccountDetail] = useState<AccountDetail | null>(null);
  const [videoDetail, setVideoDetail] = useState<Video | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [alertLevel, setAlertLevel] = useState("");
  const [selectedAlertIds, setSelectedAlertIds] = useState<number[]>([]);
  const [logFilters, setLogFilters] = useState<LogFilters>({});
  const [auditFilters, setAuditFilters] = useState<AuditFilters>({});
  const [savedAccountFilters, setSavedAccountFilters] = useState<SavedAccountFilter[]>(() => {
    try {
      const raw = localStorage.getItem(SAVED_ACCOUNT_FILTERS_KEY);
      return raw ? JSON.parse(raw) as SavedAccountFilter[] : [];
    } catch {
      return [];
    }
  });
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
  const [operation, setOperation] = useState<OperationState | null>(null);
  const [activeOperationKey, setActiveOperationKey] = useState("");
  const [operationHistory, setOperationHistory] = useState<OperationState[]>(() => {
    try {
      const raw = localStorage.getItem(OPERATION_HISTORY_KEY);
      return raw ? JSON.parse(raw) as OperationState[] : [];
    } catch {
      return [];
    }
  });

  const api = useMemo(() => createApiClient(serverUrl, sessionToken), [serverUrl, sessionToken]);
  const authenticated = session ? session.authenticated || !session.auth_enabled : false;

  function reportOperation(
    status: OperationState["status"],
    title: string,
    detail: string,
    options: { key?: string; startedAt?: number } = {}
  ) {
    const next: OperationState = {
      status,
      title,
      detail,
      timestamp: operationTime(),
      key: options.key,
      durationMs: options.startedAt ? Date.now() - options.startedAt : undefined
    };
    setOperation(next);
    if (options.key) {
      setActiveOperationKey((current) => status === "running" ? options.key || current : current === options.key ? "" : current);
    }
    setOperationHistory((current) => {
      const deduped = options.key && status === "running"
        ? current.filter((item) => !(item.key === options.key && item.status === "running"))
        : current;
      const nextHistory = [next, ...deduped].slice(0, 10);
      localStorage.setItem(OPERATION_HISTORY_KEY, JSON.stringify(nextHistory));
      return nextHistory;
    });
  }

  const loadData = useCallback(async (client = api, options: { announce?: boolean } = {}) => {
    setBusy(true);
    const startedAt = Date.now();
    if (options.announce) {
      setMessage("");
      reportOperation("running", "刷新数据", "正在从服务器读取最新账号、日志和运维状态…", { key: "refresh" });
    }
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
        setDataQuality(null);
        setInsights(null);
        setStats(null);
        setAccounts([]);
        setAlerts([]);
        setLogs([]);
        setAuditLogs([]);
        setAccountsMeta(EMPTY_PAGE_META);
        setAlertsMeta(EMPTY_PAGE_META);
        setLogsMeta(EMPTY_PAGE_META);
        setAuditMeta(EMPTY_PAGE_META);
        setProviders([]);
        setBackups(null);
        setSelectedAlertIds([]);
        return;
      }

      const [nextDashboard, nextDataQuality, nextInsights, nextStats, nextAccounts, nextAlerts, nextLogs, nextAuditLogs, nextProviders, nextBackups] = await Promise.all([
        client.dashboard(),
        client.dataQuality(),
        client.insights(),
        client.stats(),
        client.accounts(accountPage, 50, accountFilters),
        client.alerts(alertPage, 30, unreadOnly, alertLevel),
        client.logs(logPage, 30, logFilters),
        client.auditLogs(auditPage, 30, auditFilters),
        client.providers(),
        client.backups()
      ]);
      setDashboard(nextDashboard);
      setDataQuality(nextDataQuality);
      setInsights(nextInsights);
      setStats(nextStats);
      setAccounts(nextAccounts.items);
      setAlerts(nextAlerts.items);
      setLogs(nextLogs.items);
      setAuditLogs(nextAuditLogs.items);
      setAccountsMeta(nextAccounts.meta);
      setAlertsMeta(nextAlerts.meta);
      setLogsMeta(nextLogs.meta);
      setAuditMeta(nextAuditLogs.meta);
      setProviders(nextProviders);
      setBackups(nextBackups);
      if (options.announce) {
        reportOperation(
          "success",
          "刷新完成",
          `已更新 ${nextAccounts.meta.total} 个账号、${nextAlerts.meta.total} 条告警、${nextLogs.meta.total} 条同步日志。`,
          { key: "refresh", startedAt }
        );
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "连接失败";
      const nextMessage =
        detail === "Failed to fetch"
          ? `连接失败：${serverUrl}。请确认服务器地址、端口、防火墙，以及 Windows 安装版是否已更新到最新版本。`
          : detail;
      setMessage(
        nextMessage
      );
      if (options.announce) {
        reportOperation("error", "刷新失败", nextMessage, { key: "refresh", startedAt });
      }
    } finally {
      setBusy(false);
    }
  }, [accountFilters, accountPage, alertLevel, alertPage, api, auditFilters, auditPage, logFilters, logPage, serverUrl, unreadOnly]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function login() {
    setBusy(true);
    setMessage("");
    reportOperation("running", "登录服务器", "正在验证密码并建立桌面端会话…");
    try {
      const result = await api.login(password);
      if (result.session_token) {
        localStorage.setItem("tiktokmonitor.sessionToken", result.session_token);
        setSessionToken(result.session_token);
      }
      setPassword("");
      await loadData(result.session_token ? createApiClient(serverUrl, result.session_token) : api);
      reportOperation("success", "登录成功", "会话已建立，已刷新服务器数据。");
    } catch (error) {
      const detail = errorDetail(error, "登录失败");
      setMessage(detail);
      reportOperation("error", "登录失败", detail);
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
    reportOperation("success", "服务器地址已保存", `当前连接地址：${normalized}`);
  }

  function updateAccountFilter(key: keyof AccountFilters, value: string) {
    setAccountFilters((current) => ({ ...current, [key]: value }));
    setAccountPage(1);
  }

  function updateLogFilter(key: keyof LogFilters, value: string) {
    setLogFilters((current) => ({ ...current, [key]: value }));
    setLogPage(1);
  }

  function updateAuditFilter(key: keyof AuditFilters, value: string) {
    setAuditFilters((current) => ({ ...current, [key]: value }));
    setAuditPage(1);
  }

  function persistSavedAccountFilters(next: SavedAccountFilter[]) {
    setSavedAccountFilters(next);
    localStorage.setItem(SAVED_ACCOUNT_FILTERS_KEY, JSON.stringify(next));
  }

  function saveCurrentAccountFilter() {
    const name = window.prompt("给当前账号筛选取个名字", `筛选 ${savedAccountFilters.length + 1}`);
    if (!name?.trim()) return;
    const nextFilter: SavedAccountFilter = {
      id: `${Date.now()}`,
      name: name.trim(),
      filters: { ...accountFilters }
    };
    persistSavedAccountFilters([nextFilter, ...savedAccountFilters].slice(0, 12));
    setMessage(`已保存筛选：${nextFilter.name}`);
  }

  function applySavedAccountFilter(saved: SavedAccountFilter) {
    setAccountFilters({ ...saved.filters });
    setAccountPage(1);
    setMessage(`已应用筛选：${saved.name}`);
  }

  function deleteSavedAccountFilter(filterId: string) {
    persistSavedAccountFilters(savedAccountFilters.filter((item) => item.id !== filterId));
  }

  function downloadBlobFile(filename: string, blob: Blob) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function downloadTextFile(filename: string, content: string, type = "text/csv;charset=utf-8") {
    downloadBlobFile(filename, new Blob([content], { type }));
  }

  async function copyText(text: string, label: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      reportOperation("success", "已复制链接", `${label} 已复制到剪贴板。`);
    } catch (error) {
      const detail = errorDetail(error, "复制失败");
      setMessage(detail);
      reportOperation("error", "复制失败", detail);
    }
  }

  function showAccountLogs(accountId: number) {
    setLogFilters({ account_id: accountId });
    setLogPage(1);
    setView("logs");
    reportOperation("success", "已筛选同步日志", `正在查看账号 #${accountId} 的同步记录。`);
  }

  function showAccountAudit(accountId: number) {
    setAuditFilters({ account_id: accountId });
    setAuditPage(1);
    setView("audit");
    reportOperation("success", "已筛选审计日志", `正在查看账号 #${accountId} 的操作记录。`);
  }

  function showAlertCenterForAccount(account: Pick<Account, "id" | "username">) {
    setUnreadOnly(false);
    setAlertLevel("");
    setAlertPage(1);
    setView("alerts");
    reportOperation("success", "已打开告警中心", `当前版本告警中心暂未按账号过滤；可查看与 @${account.username} 相关的近期告警。`);
  }

  function applyQualityFilter(quality: string) {
    setAccountFilters((current) => ({ ...current, quality, status: "active", sort: "plays_desc" }));
    setAccountPage(1);
    setView("dashboard");
    reportOperation("success", "已应用数据健康筛选", dataQuality?.filters?.[quality] || quality);
  }

  async function exportAccountsCsv() {
    setBusy(true);
    setMessage("");
    const startedAt = Date.now();
    const filename = `accounts_${new Date().toISOString().slice(0, 10)}.csv`;
    reportOperation("running", "导出账号 CSV", `正在按当前筛选导出 ${accountsMeta.total} 个账号…`, { key: "export-accounts" });
    try {
      const csv = await api.exportAccountsCsv(accountFilters);
      downloadTextFile(filename, csv);
      reportOperation("success", "账号 CSV 已导出", `文件已交给系统下载：${filename} · ${accountsMeta.total} 个账号`, { key: "export-accounts", startedAt });
    } catch (error) {
      const detail = errorDetail(error, "导出账号失败");
      setMessage(detail);
      reportOperation("error", "导出账号失败", detail, { key: "export-accounts", startedAt });
    } finally {
      setBusy(false);
    }
  }

  async function exportVideosCsv() {
    setBusy(true);
    setMessage("");
    const startedAt = Date.now();
    const filename = `videos_${new Date().toISOString().slice(0, 10)}.csv`;
    reportOperation("running", "导出视频 CSV", `正在导出 ${stats?.total_videos || 0} 条视频记录…`, { key: "export-videos" });
    try {
      const csv = await api.exportVideosCsv();
      downloadTextFile(filename, csv);
      reportOperation("success", "视频 CSV 已导出", `文件已交给系统下载：${filename} · ${stats?.total_videos || 0} 条视频`, { key: "export-videos", startedAt });
    } catch (error) {
      const detail = errorDetail(error, "导出视频失败");
      setMessage(detail);
      reportOperation("error", "导出视频失败", detail, { key: "export-videos", startedAt });
    } finally {
      setBusy(false);
    }
  }

  async function createBackup() {
    setBusy(true);
    setMessage("");
    const startedAt = Date.now();
    reportOperation("running", "创建数据库备份", "正在请求服务器生成 SQLite 数据库快照…", { key: "backup-create" });
    try {
      const backup = await api.createBackup(30);
      setBackups(await api.backups());
      reportOperation("success", "备份已创建", `${backup.name} · ${formatBytes(backup.size)}，可在备份管理中下载。`, { key: "backup-create", startedAt });
    } catch (error) {
      const detail = errorDetail(error, "创建备份失败");
      setMessage(detail);
      reportOperation("error", "创建备份失败", detail, { key: "backup-create", startedAt });
    } finally {
      setBusy(false);
    }
  }

  async function downloadBackup(name: string) {
    setBusy(true);
    setMessage("");
    const startedAt = Date.now();
    reportOperation("running", "下载备份", `正在下载 ${name}…`, { key: "backup-download" });
    try {
      const content = await api.downloadBackup(name);
      downloadBlobFile(name, new Blob([content], { type: "application/octet-stream" }));
      reportOperation("success", "备份已开始下载", `文件已交给系统下载：${name}`, { key: "backup-download", startedAt });
    } catch (error) {
      const detail = errorDetail(error, "下载备份失败");
      setMessage(detail);
      reportOperation("error", "下载备份失败", detail, { key: "backup-download", startedAt });
    } finally {
      setBusy(false);
    }
  }

  async function addAccount() {
    if (!newUsername.trim()) return;
    setBusy(true);
    setMessage("");
    reportOperation("running", "添加账号", `正在添加 @${newUsername.trim().replace(/^@/, "")}…`);
    try {
      const result = await api.addAccount(newUsername, newGroup);
      reportOperation(result.status === "exists" ? "success" : "success", result.status === "exists" ? "账号已存在" : "账号已添加", result.message);
      setNewUsername("");
      setNewGroup("");
      if (result.status === "exists") {
        await openAccount(result.account.id);
      } else {
        await loadData();
      }
    } catch (error) {
      const detail = errorDetail(error, "添加失败");
      setMessage(detail);
      reportOperation("error", "添加账号失败", detail);
    } finally {
      setBusy(false);
    }
  }

  async function syncAll() {
    const syncQueueBusy = Boolean(dashboard?.sync.progress?.running || (dashboard?.sync.queue_size || 0) > 0);
    if (syncQueueBusy) {
      reportOperation("error", "同步队列未空", "已有同步任务正在运行或排队，请等待完成后再触发全部同步。", { key: "sync-all" });
      return;
    }
    setBusy(true);
    setMessage("");
    const startedAt = Date.now();
    reportOperation("running", "全部同步", `正在把 ${stats?.active_accounts || accountsMeta.total || 0} 个启用账号加入同步队列…`, { key: "sync-all" });
    try {
      const result = await api.syncAll();
      await loadData();
      reportOperation("success", "全部同步已触发", `已加入队列 ${result.queued ?? stats?.active_accounts ?? 0} 个账号，当前队列 ${result.queue_size ?? "-"}。`, { key: "sync-all", startedAt });
    } catch (error) {
      const detail = errorDetail(error, "同步失败");
      setMessage(detail);
      reportOperation("error", "全部同步失败", detail, { key: "sync-all", startedAt });
    } finally {
      setBusy(false);
    }
  }

  async function syncOne(accountId: number) {
    setBusy(true);
    setMessage("");
    const startedAt = Date.now();
    const account = accounts.find((item) => item.id === accountId) || (accountDetail?.id === accountId ? accountDetail : null);
    reportOperation("running", "同步账号", `正在触发 ${account ? `@${account.username}` : `账号 #${accountId}`} 同步…`, { key: `sync-account-${accountId}` });
    try {
      const result = await api.syncAccount(accountId);
      await loadData();
      reportOperation("success", "账号同步已触发", `${result.message || "同步任务已加入队列"} · 当前队列 ${result.queue_size ?? "-"}`, { key: `sync-account-${accountId}`, startedAt });
    } catch (error) {
      const detail = errorDetail(error, "同步失败");
      setMessage(detail);
      reportOperation("error", "账号同步失败", detail, { key: `sync-account-${accountId}`, startedAt });
    } finally {
      setBusy(false);
    }
  }

  async function updateAccount(accountId: number, payload: AccountUpdate) {
    setBusy(true);
    setMessage("");
    reportOperation("running", "保存账号信息", "正在保存账号标签、员工、手机或备注…");
    try {
      const account = await api.updateAccount(accountId, payload);
      setAccounts((current) => current.map((item) => item.id === accountId ? { ...item, ...account } : item));
      setAccountDetail((current) => current?.id === accountId ? { ...current, ...account } : current);
      await loadData();
      reportOperation("success", "账号信息已保存", `@${account.username} 的资料已更新。`);
    } catch (error) {
      const detail = errorDetail(error, "保存账号信息失败");
      setMessage(detail);
      reportOperation("error", "保存账号信息失败", detail);
    } finally {
      setBusy(false);
    }
  }

  async function bulkUpdateAccounts(updates: AccountUpdate) {
    const labels: Record<string, string> = {
      group_name: "品类/分组",
      phone: "手机",
      employee: "员工",
      note: "备注"
    };
    const updateLines = Object.entries(updates)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `- ${labels[key] || key}：${value || "清空"}`);
    const filterLines = [
      accountFilters.q ? `关键词：${accountFilters.q}` : "",
      accountFilters.group ? `品类：${accountFilters.group}` : "",
      accountFilters.phone ? `手机：${accountFilters.phone}` : "",
      accountFilters.employee ? `员工：${accountFilters.employee}` : "",
      accountFilters.post_today ? `今日发文：${accountFilters.post_today === "yes" ? "已发" : "未发"}` : "",
      `状态：${accountFilters.status || "active"}`
    ].filter(Boolean);
    const confirmed = window.confirm([
      `将批量更新当前筛选出的 ${accountsMeta.total} 个账号。`,
      "",
      "修改内容：",
      ...updateLines,
      "",
      "当前筛选：",
      ...(filterLines.length ? filterLines.map((line) => `- ${line}`) : ["- 无筛选"]),
      "",
      "该操作会写入所有匹配账号，请确认。"
    ].join("\n"));
    if (!confirmed) return;
    setBusy(true);
    setMessage("");
    reportOperation("running", "批量更新账号", `正在更新当前筛选出的 ${accountsMeta.total} 个账号…`);
    try {
      const result = await api.bulkUpdateAccounts(accountFilters, updates);
      await loadData();
      reportOperation("success", "批量更新完成", `已更新 ${result.updated} 个账号。`);
    } catch (error) {
      const detail = errorDetail(error, "批量更新失败");
      setMessage(detail);
      reportOperation("error", "批量更新失败", detail);
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount(account: Account) {
    if (!window.confirm(`确定删除 @${account.username} 吗？该操作会删除本地账号和关联记录。`)) return;
    setBusy(true);
    setMessage("");
    reportOperation("running", "删除账号", `正在删除 @${account.username}…`);
    try {
      await api.deleteAccount(account.id);
      if (accountDetail?.id === account.id) {
        setAccountDetail(null);
        setView("dashboard");
      }
      await loadData();
      reportOperation("success", "账号已删除", `@${account.username} 已从监控列表移除。`);
    } catch (error) {
      const detail = errorDetail(error, "删除账号失败");
      setMessage(detail);
      reportOperation("error", "删除账号失败", detail);
    } finally {
      setBusy(false);
    }
  }

  async function toggleAccountActive(account: Account) {
    setBusy(true);
    setMessage("");
    try {
      const nextActive = !account.is_active;
      reportOperation("running", nextActive ? "启用账号" : "停用账号", `正在更新 @${account.username} 的状态…`);
      await api.updateAccount(account.id, { is_active: nextActive });
      await loadData();
      reportOperation("success", nextActive ? "账号已启用" : "账号已停用", `@${account.username} 已${nextActive ? "重新加入" : "移出"}同步范围。`);
    } catch (error) {
      const detail = errorDetail(error, "更新账号状态失败");
      setMessage(detail);
      reportOperation("error", "更新账号状态失败", detail);
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
    const lineCount = importText.split(/\r?\n/).filter((line) => line.trim()).length;
    const confirmed = window.confirm([
      `即将导入 ${lineCount} 行账号数据。`,
      "",
      `默认分组：${importGroup.trim() || "不设置"}`,
      `默认手机：${importPhone.trim() || "不设置"}`,
      `默认员工：${importEmployee.trim() || "不设置"}`,
      `导入后同步：${importSync ? "加入同步队列" : "不自动同步"}`,
      "",
      "导入会新增账号或更新已有账号标签，请确认粘贴内容无误。"
    ].join("\n"));
    if (!confirmed) return;
    setBusy(true);
    setMessage("");
    const startedAt = Date.now();
    reportOperation("running", "批量导入账号", `正在解析并导入 ${lineCount} 行账号数据…`, { key: "import-accounts" });
    try {
      const result = await api.importAccounts({
        raw: importText,
        group_name: importGroup,
        phone: importPhone,
        employee: importEmployee,
        sync: importSync
      });
      setImportText("");
      await loadData();
      setView("dashboard");
      reportOperation("success", "批量导入完成", `新增 ${result.added}，更新 ${result.updated}，已加入同步队列 ${result.queued}。`, { key: "import-accounts", startedAt });
    } catch (error) {
      const detail = errorDetail(error, "批量导入失败");
      setMessage(detail);
      reportOperation("error", "批量导入失败", detail, { key: "import-accounts", startedAt });
    } finally {
      setBusy(false);
    }
  }

  async function markSelectedAlertsRead() {
    if (!selectedAlertIds.length) return;
    setBusy(true);
    setMessage("");
    const startedAt = Date.now();
    reportOperation("running", "标记告警已读", `正在处理 ${selectedAlertIds.length} 条所选告警…`, { key: "alerts-read-selected" });
    try {
      const result = await api.markAlertsRead(selectedAlertIds);
      setSelectedAlertIds([]);
      await loadData();
      reportOperation("success", "告警已处理", `已标记 ${result.updated} 条告警为已读。`, { key: "alerts-read-selected", startedAt });
    } catch (error) {
      const detail = errorDetail(error, "批量告警操作失败");
      setMessage(detail);
      reportOperation("error", "批量告警操作失败", detail, { key: "alerts-read-selected", startedAt });
    } finally {
      setBusy(false);
    }
  }

  async function markAllAlertsRead() {
    setBusy(true);
    setMessage("");
    const startedAt = Date.now();
    reportOperation("running", "全部告警已读", `正在处理 ${stats?.unread_alerts || 0} 条未读告警…`, { key: "alerts-read-all" });
    try {
      await api.markAllAlertsRead();
      await loadData();
      reportOperation("success", "全部告警已读", "所有未读告警已标记为已读。", { key: "alerts-read-all", startedAt });
    } catch (error) {
      const detail = errorDetail(error, "全部告警操作失败");
      setMessage(detail);
      reportOperation("error", "全部告警操作失败", detail, { key: "alerts-read-all", startedAt });
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
    setMessage("");
    reportOperation("running", "保存设置", "正在保存安全可编辑的服务端配置…");
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
      reportOperation("success", "设置已保存", "新设置将在下一次同步中生效。");
    } catch (error) {
      const detail = errorDetail(error, "保存设置失败");
      setMessage(detail);
      reportOperation("error", "保存设置失败", detail);
    } finally {
      setBusy(false);
    }
  }

  const visibleAlerts = unreadOnly ? alerts.filter((alert) => !alert.is_read) : alerts;
  const syncQueueBusy = Boolean(dashboard?.sync.progress?.running || (dashboard?.sync.queue_size || 0) > 0 || activeOperationKey === "sync-all");
  const viewTitles: Record<View, [string, string]> = {
    dashboard: ["团队监控台", "集中服务器，多平台客户端。"],
    quality: ["数据健康", "检查过期同步、无视频、失败同步和缺失指标账号。"],
    insights: ["数据分析", "趋势、健康排行、异常检测和增长榜。"],
    account: ["账号详情", "账号资料、增长与同步记录。"],
    video: ["视频详情", "视频指标与历史快照。"],
    alerts: ["告警中心", "集中处理未读告警、异常提示和关联账号。"],
    logs: ["同步日志", "按状态、采集源和关键词排查同步任务。"],
    audit: ["审计日志", "查看账号、同步、备份、告警和批量操作记录。"],
    providers: ["采集源健康", "查看 provider 成功率、延迟和最近失败情况。"],
    operations: ["运维中心", "集中查看服务器、同步、采集源、备份和最近日志。"],
    backups: ["备份管理", "查看、创建和下载服务器数据库备份。"],
    import: ["批量导入账号", "每行一个账号，可附带分组、手机和员工。"],
    settings: ["设置", "仅显示可安全编辑的服务端配置。"],
    help: ["使用指南", "首次使用、日常流程、排查和交接说明。"]
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
          <button className={view === "insights" ? "active" : ""} disabled={!authenticated} onClick={() => setView("insights")}>
            <VideoIcon aria-hidden="true" />
            数据分析
          </button>
          <button className={view === "quality" ? "active" : ""} disabled={!authenticated} onClick={() => setView("quality")}>
            <AlertTriangle aria-hidden="true" />
            数据健康
          </button>
          <button className={view === "alerts" ? "active" : ""} disabled={!authenticated} onClick={() => setView("alerts")}>
            <AlertTriangle aria-hidden="true" />
            告警中心
          </button>
          <button className={view === "logs" ? "active" : ""} disabled={!authenticated} onClick={() => setView("logs")}>
            <RefreshCcw aria-hidden="true" />
            同步日志
          </button>
          <button className={view === "audit" ? "active" : ""} disabled={!authenticated} onClick={() => setView("audit")}>
            <CheckCircle2 aria-hidden="true" />
            审计日志
          </button>
          <button className={view === "providers" ? "active" : ""} disabled={!authenticated} onClick={() => setView("providers")}>
            <Server aria-hidden="true" />
            采集源
          </button>
          <button className={view === "operations" ? "active" : ""} disabled={!authenticated} onClick={() => setView("operations")}>
            <Activity aria-hidden="true" />
            运维中心
          </button>
          <button className={view === "backups" ? "active" : ""} disabled={!authenticated} onClick={() => setView("backups")}>
            <FileUp aria-hidden="true" />
            备份管理
          </button>
          <button className={view === "import" ? "active" : ""} disabled={!authenticated} onClick={() => setView("import")}>
            <FileUp aria-hidden="true" />
            批量导入
          </button>
          <button className={view === "settings" ? "active" : ""} disabled={!authenticated} onClick={() => void openSettings()}>
            <SettingsIcon aria-hidden="true" />
            设置
          </button>
          <button className={view === "help" ? "active" : ""} onClick={() => setView("help")}>
            <CheckCircle2 aria-hidden="true" />
            使用指南
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
            <button className="icon-button" title="刷新" disabled={busy} onClick={() => void loadData(api, { announce: true })}>
              <RefreshCcw aria-hidden="true" />
            </button>
            {view === "dashboard" ? (
              <button className="primary-button" disabled={busy || !authenticated || syncQueueBusy} onClick={() => void syncAll()}>
                <Play aria-hidden="true" />
                {syncQueueBusy ? "同步排队中" : "全部同步"}
              </button>
            ) : null}
          </div>
        </header>

        {operation ? <OperationNotice operation={operation} /> : null}
        {message ? <div className="notice notice-error">{message}</div> : null}

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
            savedAccountFilters={savedAccountFilters}
            unreadOnly={unreadOnly}
            alertLevel={alertLevel}
            selectedAlertIds={selectedAlertIds}
            onUsernameChange={setNewUsername}
            onGroupChange={setNewGroup}
            onAccountFilterChange={updateAccountFilter}
            onSaveAccountFilter={saveCurrentAccountFilter}
            onApplyAccountFilter={applySavedAccountFilter}
            onDeleteAccountFilter={deleteSavedAccountFilter}
            onExportAccounts={() => void exportAccountsCsv()}
            onExportVideos={() => void exportVideosCsv()}
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
            onUpdateAccount={(id, payload) => void updateAccount(id, payload)}
            onBulkUpdate={(updates) => void bulkUpdateAccounts(updates)}
            onToggleActive={(account) => void toggleAccountActive(account)}
            onDeleteAccount={(account) => void deleteAccount(account)}
            onOpenAccount={(id) => void openAccount(id)}
            onNavigate={setView}
            onCopyAccountLink={(account) => void copyText(profileUrl(account.username), `@${account.username} 主页链接`)}
            onAlert={(alert) => void handleAlert(alert)}
            onReadAll={() => markAllAlertsRead()}
          />
        ) : null}
        {view === "quality" ? (
          <QualityPage
            quality={dataQuality}
            providers={providers}
            logs={logs}
            onApplyQuality={applyQualityFilter}
            onOpenAccount={(id) => void openAccount(id)}
          />
        ) : null}
        {view === "insights" ? (
          <InsightsPage
            insights={insights}
            onAccount={(id) => void openAccount(id)}
            onVideo={(id) => void openVideo(id)}
          />
        ) : null}
        {view === "alerts" ? (
          <AlertsPage
            alerts={visibleAlerts}
            meta={alertsMeta}
            page={alertPage}
            stats={stats}
            busy={busy}
            authenticated={authenticated}
            unreadOnly={unreadOnly}
            alertLevel={alertLevel}
            selectedAlertIds={selectedAlertIds}
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
            onReadAll={() => markAllAlertsRead()}
            onPage={setAlertPage}
            onAlert={(alert) => void handleAlert(alert)}
          />
        ) : null}
        {view === "logs" ? (
          <LogsPage
            logs={logs}
            meta={logsMeta}
            page={logPage}
            filters={logFilters}
            providers={providers}
            onFilterChange={updateLogFilter}
            onClearFilters={() => {
              setLogFilters({});
              setLogPage(1);
            }}
            onPage={setLogPage}
          />
        ) : null}
        {view === "audit" ? (
          <AuditLogsPage
            logs={auditLogs}
            meta={auditMeta}
            page={auditPage}
            filters={auditFilters}
            onFilterChange={updateAuditFilter}
            onClearFilters={() => {
              setAuditFilters({});
              setAuditPage(1);
            }}
            onPage={setAuditPage}
          />
        ) : null}
        {view === "providers" ? (
          <ProvidersPage providers={providers} />
        ) : null}
        {view === "operations" ? (
          <OperationsPage
            health={health}
            stats={stats}
            dashboard={dashboard}
            providers={providers}
            logs={logs}
            auditLogs={auditLogs}
            backups={backups}
            operation={operation}
            operationHistory={operationHistory}
            activeOperationKey={activeOperationKey}
            busy={busy}
            authenticated={authenticated}
            onRefresh={() => void loadData(api, { announce: true })}
            onSyncAll={() => void syncAll()}
            onCreateBackup={() => void createBackup()}
            onDownloadBackup={(name) => void downloadBackup(name)}
          />
        ) : null}
        {view === "backups" ? (
          <BackupsPage
            backups={backups}
            busy={busy}
            authenticated={authenticated}
            onCreate={() => void createBackup()}
            onDownload={(name) => void downloadBackup(name)}
          />
        ) : null}
        {view === "account" && accountDetail ? (
          <AccountPage
            account={accountDetail}
            busy={busy}
            onSync={() => void syncOne(accountDetail.id)}
            onVideo={(id) => void openVideo(id)}
            onCopyUsername={() => void copyText(`@${accountDetail.username}`, `@${accountDetail.username} 用户名`)}
            onCopyProfile={() => void copyText(profileUrl(accountDetail.username), `@${accountDetail.username} 主页链接`)}
            onCopyVideoLink={(video) => void copyText(videoUrlForUsername(accountDetail.username, video.video_id), "视频链接")}
            onShowLogs={() => showAccountLogs(accountDetail.id)}
            onShowAudit={() => showAccountAudit(accountDetail.id)}
            onShowAlerts={() => showAlertCenterForAccount(accountDetail)}
            onVideoPage={(page) => void openAccount(accountDetail.id, page, accountDetail.logs_meta?.page || 1)}
            onLogPage={(page) => void openAccount(accountDetail.id, accountDetail.videos_meta?.page || 1, page)}
          />
        ) : null}
        {view === "video" && videoDetail ? (
          <VideoPage
            video={videoDetail}
            onAccount={(id) => void openAccount(id)}
            onCopyLink={() => void copyText(videoUrl(videoDetail), "视频链接")}
            onCopyVideoId={() => void copyText(videoDetail.video_id || "", "视频 ID")}
            onCopyAuthorProfile={() => void copyText(profileUrl(videoDetail.account?.username), `@${videoDetail.account?.username || "账号"} 主页链接`)}
            onHistoryPage={(page) => void openVideo(videoDetail.id, page)}
          />
        ) : null}
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
        {view === "help" ? <HelpPage onNavigate={setView} authenticated={authenticated} /> : null}
      </section>
    </main>
  );
}

function OperationNotice({ operation }: { operation: OperationState }) {
  const icon = operation.status === "running"
    ? <RefreshCcw aria-hidden="true" />
    : operation.status === "success"
      ? <CheckCircle2 aria-hidden="true" />
      : <AlertTriangle aria-hidden="true" />;
  const label = operation.status === "running" ? "进行中" : operation.status === "success" ? "已完成" : "失败";
  return (
    <section className={`operation-notice operation-${operation.status}`} aria-live="polite">
      <div className="operation-icon">{icon}</div>
      <div>
        <strong>{operation.title}<span>{label}</span></strong>
        <p>{operation.detail}</p>
        <small>{operation.timestamp}{operation.durationMs ? ` · 用时 ${formatDuration(operation.durationMs)}` : ""}</small>
      </div>
    </section>
  );
}

function EmptyState({ title, detail, action }: { title: string; detail: string; action?: JSX.Element }) {
  return (
    <div className="empty-card">
      <strong>{title}</strong>
      <p>{detail}</p>
      {action ? <div className="empty-actions">{action}</div> : null}
    </div>
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
  savedAccountFilters,
  unreadOnly,
  alertLevel,
  selectedAlertIds,
  onUsernameChange,
  onGroupChange,
  onAccountFilterChange,
  onSaveAccountFilter,
  onApplyAccountFilter,
  onDeleteAccountFilter,
  onExportAccounts,
  onExportVideos,
  onUnreadOnlyChange,
  onAlertLevelChange,
  onToggleAlert,
  onMarkSelected,
  onAccountPage,
  onAlertPage,
  onLogPage,
  onAdd,
  onSync,
  onUpdateAccount,
  onBulkUpdate,
  onToggleActive,
  onDeleteAccount,
  onOpenAccount,
  onNavigate,
  onCopyAccountLink,
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
  savedAccountFilters: SavedAccountFilter[];
  unreadOnly: boolean;
  alertLevel: string;
  selectedAlertIds: number[];
  onUsernameChange: (value: string) => void;
  onGroupChange: (value: string) => void;
  onAccountFilterChange: (key: keyof AccountFilters, value: string) => void;
  onSaveAccountFilter: () => void;
  onApplyAccountFilter: (saved: SavedAccountFilter) => void;
  onDeleteAccountFilter: (filterId: string) => void;
  onExportAccounts: () => void;
  onExportVideos: () => void;
  onUnreadOnlyChange: (value: boolean) => void;
  onAlertLevelChange: (value: string) => void;
  onToggleAlert: (alertId: number, selected: boolean) => void;
  onMarkSelected: () => void;
  onAccountPage: (page: number) => void;
  onAlertPage: (page: number) => void;
  onLogPage: (page: number) => void;
  onAdd: () => void;
  onSync: (id: number) => void;
  onUpdateAccount: (id: number, payload: AccountUpdate) => void;
  onBulkUpdate: (updates: AccountUpdate) => void;
  onToggleActive: (account: Account) => void;
  onDeleteAccount: (account: Account) => void;
  onOpenAccount: (id: number) => void;
  onNavigate: (view: View) => void;
  onCopyAccountLink: (account: Account) => void;
  onAlert: (alert: Alert) => void;
  onReadAll: () => Promise<void>;
}) {
  const options = dashboard?.options || accountsMeta.options || { groups: [], phones: [], employees: [], sort_options: accountsMeta.sort_options || {} };
  const sortOptions = options.sort_options || accountsMeta.sort_options || {};
  const progress = dashboard?.sync.progress;
  const syncBusy = Boolean(progress?.running || (dashboard?.sync.queue_size || 0) > 0);
  const [bulkTags, setBulkTags] = useState({ group_name: "", phone: "", employee: "", note: "" });
  const hasBulkUpdates = Object.values(bulkTags).some((value) => value.trim());
  const submitBulkUpdate = () => {
    const updates: AccountUpdate = {};
    if (bulkTags.group_name.trim()) updates.group_name = bulkTags.group_name.trim();
    if (bulkTags.phone.trim()) updates.phone = bulkTags.phone.trim();
    if (bulkTags.employee.trim()) updates.employee = bulkTags.employee.trim();
    if (bulkTags.note.trim()) updates.note = bulkTags.note.trim();
    if (!Object.keys(updates).length) return;
    onBulkUpdate(updates);
    setBulkTags({ group_name: "", phone: "", employee: "", note: "" });
  };
  const clearAccountFilters = () => {
    (["q", "group", "phone", "employee", "post_today", "quality"] as (keyof AccountFilters)[]).forEach((key) => onAccountFilterChange(key, ""));
    onAccountFilterChange("status", "active");
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

          <section className="panel quick-start-panel">
            <div className="panel-head">
              <div>
                <h2>常用流程</h2>
                <span>不知道下一步点哪里时，从这里开始。</span>
              </div>
            </div>
            <div className="quick-action-grid">
              <button className="quick-action-card" disabled={!authenticated} onClick={() => onNavigate("quality")}>
                <AlertTriangle aria-hidden="true" />
                <strong>检查数据健康</strong>
                <span>找出未同步、无视频、同步失败和缺指标账号。</span>
              </button>
              <button className="quick-action-card" disabled={!authenticated} onClick={() => onNavigate("import")}>
                <FileUp aria-hidden="true" />
                <strong>批量导入账号</strong>
                <span>粘贴用户名或主页链接，批量添加并可立即加入同步队列。</span>
              </button>
              <button className="quick-action-card" disabled={!authenticated} onClick={onExportAccounts}>
                <Activity aria-hidden="true" />
                <strong>导出当前报表</strong>
                <span>按当前筛选导出账号 CSV，适合交接和复盘。</span>
              </button>
              <button className="quick-action-card" disabled={!authenticated} onClick={() => onNavigate("alerts")}>
                <AlertTriangle aria-hidden="true" />
                <strong>处理告警</strong>
                <span>集中查看未读告警、异常和需要人工确认的问题。</span>
              </button>
              <button className="quick-action-card" disabled={!authenticated} onClick={() => onNavigate("logs")}>
                <RefreshCcw aria-hidden="true" />
                <strong>排查同步</strong>
                <span>按状态、采集源和关键词查看最近同步日志。</span>
              </button>
              <button className="quick-action-card" disabled={!authenticated} onClick={() => onNavigate("operations")}>
                <Server aria-hidden="true" />
                <strong>服务器运维</strong>
                <span>查看队列、采集源、备份和最近任务结果。</span>
              </button>
            </div>
            <div className="operator-guide">
              <span>推荐顺序</span>
              <ol>
                <li>先看数据健康，确认哪些账号需要补同步。</li>
                <li>再用筛选/员工报表定位负责人和品类。</li>
                <li>最后导出 CSV 或进入运维中心做备份与排查。</li>
              </ol>
            </div>
          </section>

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
            <select className="filter-select" value={accountFilters.quality || ""} onChange={(event) => onAccountFilterChange("quality", event.target.value)}>
              <option value="">数据健康：全部</option>
              {Object.entries(options.quality_filters || {}).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
            </select>
            <select className="filter-select" value={accountFilters.status || "active"} onChange={(event) => onAccountFilterChange("status", event.target.value)}>
              <option value="active">启用账号</option>
              <option value="inactive">停用账号</option>
              <option value="all">全部状态</option>
            </select>
            <select className="filter-select" value={accountFilters.sort || "plays_desc"} onChange={(event) => onAccountFilterChange("sort", event.target.value)}>
              {Object.entries(sortOptions).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
            </select>
            <button className="ghost-light-button" onClick={clearAccountFilters}>清除筛选</button>
            <button className="ghost-light-button" disabled={!authenticated} onClick={onSaveAccountFilter}>保存筛选</button>
          </div>
          {savedAccountFilters.length ? (
            <div className="saved-filter-row">
              <span>已保存筛选</span>
              {savedAccountFilters.map((saved) => (
                <span className="saved-filter-chip" key={saved.id}>
                  <button onClick={() => onApplyAccountFilter(saved)}>{saved.name}</button>
                  <button aria-label={`删除筛选 ${saved.name}`} onClick={() => onDeleteAccountFilter(saved.id)}>×</button>
                </span>
              ))}
            </div>
          ) : null}
          <div className="bulk-tag-panel">
            <span>批量修改当前筛选结果（{accountsMeta.total} 个）</span>
            <input value={bulkTags.group_name} onChange={(event) => setBulkTags((current) => ({ ...current, group_name: event.target.value }))} placeholder="品类/分组，留空不改" />
            <input value={bulkTags.phone} onChange={(event) => setBulkTags((current) => ({ ...current, phone: event.target.value }))} placeholder="手机，留空不改" />
            <input value={bulkTags.employee} onChange={(event) => setBulkTags((current) => ({ ...current, employee: event.target.value }))} placeholder="员工，留空不改" />
            <input value={bulkTags.note} onChange={(event) => setBulkTags((current) => ({ ...current, note: event.target.value }))} placeholder="备注，留空不改" />
            <button className="ghost-light-button" disabled={busy || !authenticated || !accountsMeta.total || !hasBulkUpdates} onClick={submitBulkUpdate}>批量保存</button>
            <button className="ghost-light-button" disabled={busy || !authenticated} onClick={onExportAccounts}>导出账号 CSV</button>
            <button className="ghost-light-button" disabled={busy || !authenticated} onClick={onExportVideos}>导出视频 CSV</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>账号</th><th>标签</th><th>粉丝</th><th>今日</th><th>新发播放</th><th>今日增播</th><th>总播放</th><th>24h</th><th></th></tr></thead>
              <tbody>
                {accounts.map((account) => (
                  <tr className={account.is_active ? "" : "inactive-row"} key={account.id}>
                    <td>
                      <button className="link-button" onClick={() => onOpenAccount(account.id)}>@{account.username}</button>
                      <span>{account.nickname || account.employee || "未标注"}</span>
                      <div className="mini-action-row">
                        <a href={profileUrl(account.username)} target="_blank" rel="noreferrer">TikTok</a>
                        <button onClick={() => onCopyAccountLink(account)}>复制</button>
                      </div>
                    </td>
                    <td>
                      <EditableAccountTags account={account} busy={busy || !authenticated} onSave={(payload) => onUpdateAccount(account.id, payload)} />
                    </td>
                    <td>{compactNumber(account.followers)}</td>
                    <td>{account.posted_today ? <span className="post-badge post-yes">+{account.today_post_count || 0}</span> : <span className="post-badge post-no">未发</span>}</td>
                    <td>{account.today_new_plays ? compactNumber(account.today_new_plays) : "-"}</td>
                    <td>{signedNumber(account.growth?.today_plays_increase)}</td>
                    <td>{compactNumber(account.total_plays)}</td>
                    <td>{signedNumber(account.growth?.plays_increase)}</td>
                    <td>
                      <div className="account-actions">
                        <button className="icon-button" title="同步账号" disabled={busy || !authenticated} onClick={() => onSync(account.id)}><RefreshCcw aria-hidden="true" /></button>
                        <button className="text-button" disabled={busy || !authenticated} onClick={() => onOpenAccount(account.id)}>详情</button>
                        <button className="text-button" disabled={busy || !authenticated} onClick={() => onToggleActive(account)}>{account.is_active ? "停用" : "启用"}</button>
                        <button className="text-button danger-text" disabled={busy || !authenticated} onClick={() => onDeleteAccount(account)}>删除</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!accounts.length ? (
            <EmptyState
              title={accountsMeta.total ? "当前页没有账号" : "还没有可显示的账号"}
              detail={accountsMeta.total ? "换一页或清除筛选后再查看。" : "可以在上方输入 TikTok 用户名/主页链接添加，也可以到“批量导入”一次导入多个账号。"}
              action={<button className="ghost-light-button" onClick={clearAccountFilters}>清除筛选</button>}
            />
          ) : null}
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
            {!alerts.length ? (
              <EmptyState
                title="暂无符合条件的告警"
                detail={unreadOnly || alertLevel ? "可以切换级别或取消“未读”筛选。" : "系统暂未发现异常；同步账号后会继续生成新的告警。"}
              />
            ) : null}
          </div>
          <PageControls meta={alertsMeta} page={alertPage} onPage={onAlertPage} />
        </section>

        <section className="panel">
          <div className="panel-head"><h2>同步日志</h2><span>{logsMeta.total} 条</span></div>
          <div className="stack-list">
            {logs.map((log) => <article className="list-item" key={log.id}><strong>{log.username || "系统"}</strong><span>{log.message || log.status}</span><small>{formatDate(log.created_at)}</small></article>)}
            {!logs.length ? (
              <EmptyState
                title="暂无同步日志"
                detail="触发“全部同步”或单账号同步后，这里会显示同步结果、采集源和错误信息。"
              />
            ) : null}
          </div>
          <PageControls meta={logsMeta} page={logPage} onPage={onLogPage} />
        </section>

        <section className="panel">
          <div className="panel-head"><h2>采集源</h2><span>{providers.length} 个</span></div>
          <div className="provider-grid">
            {providers.map((provider) => <article className="provider-tile" key={provider.provider}><strong>{provider.provider}</strong><span>成功 {provider.success_count || 0}</span><span>失败 {provider.failure_count || 0}</span></article>)}
          </div>
          {!providers.length ? (
            <EmptyState
              title="暂无采集源记录"
              detail="完成一次同步后，系统会记录 provider 的成功、失败和延迟情况。"
            />
          ) : null}
        </section>
      </section>
    </>
  );
}

function InsightsPage({
  insights,
  onAccount,
  onVideo
}: {
  insights: InsightsData | null;
  onAccount: (id: number) => void;
  onVideo: (id: number) => void;
}) {
  if (!insights) return <p className="empty-state">正在加载数据分析…</p>;
  return (
    <section className="detail-layout">
      <section className="metric-grid detail-metrics">
        <Metric icon={<Activity />} label="分析周期" value={insights.summary.days} detail="最近天数" />
        <Metric icon={<Users />} label="健康排行" value={insights.summary.ranked_accounts} detail="已参与评分账号" />
        <Metric icon={<AlertTriangle />} label="异常检测" value={insights.summary.anomalies} detail={`未读告警 ${insights.summary.unread_alerts}`} />
        <Metric icon={<VideoIcon />} label="增长视频" value={insights.summary.gainers} detail="24h 播放增长 TOP" />
      </section>

      {insights.trend.labels.length ? (
        <section className="panel">
          <div className="panel-head"><h2>{insights.summary.days} 日趋势</h2><span>播放 / 粉丝</span></div>
          <TrendChart
            labels={insights.trend.labels}
            series={[
              { label: "播放", values: insights.trend.plays, color: "#f28c52" },
              { label: "粉丝", values: insights.trend.followers, color: "#0c6e7e" }
            ]}
          />
        </section>
      ) : (
        <section className="panel"><p className="empty-state">暂无趋势数据；完成多次同步后会生成趋势图。</p></section>
      )}

      <section className="analytics-grid">
        <section className="panel">
          <div className="panel-head"><h2>24h 播放增长 TOP</h2><span>{insights.gainers.length} 条</span></div>
          <div className="stack-list">
            {insights.gainers.map((item) => (
              <article className="list-item" key={item.video.id}>
                <button className="list-action" onClick={() => onVideo(item.video.id)}>
                  <strong>{item.video.title || "无标题视频"}</strong>
                  <span>@{item.account.username} · 当前 {compactNumber(item.current_plays)}</span>
                  <small className="delta-up">+{compactNumber(item.play_delta)}</small>
                </button>
              </article>
            ))}
            {!insights.gainers.length ? <p className="empty-state">暂无 24h 播放增长数据。</p> : null}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head"><h2>异常检测</h2><span>{insights.anomalies.length} 条</span></div>
          <div className="stack-list rich-list">
            {insights.anomalies.map((item, index) => (
              <article className={`list-item item-hot anomaly-${item.level || "warning"}`} key={`${item.account.id}-${item.type}-${index}`}>
                <button className="list-action" onClick={() => onAccount(item.account.id)}>
                  <strong>{item.title}<span className={`level-badge level-${item.level || "warning"}`}>{item.level || "warning"}</span></strong>
                  <span>{item.message}</span>
                  <small>@{item.account.username}{item.z_score !== undefined ? ` · z=${item.z_score}` : ""}</small>
                </button>
              </article>
            ))}
            {!insights.anomalies.length ? <p className="empty-state">暂无异常检测结果。</p> : null}
          </div>
        </section>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>账号健康排行</h2><span>{insights.rankings.length} 个账号</span></div>
        <div className="table-wrap">
          <table className="compact-table">
            <thead><tr><th>#</th><th>账号</th><th>健康分</th><th>等级</th><th>24h 播放</th><th>粉丝变化</th><th>互动率</th><th>同步成功率</th></tr></thead>
            <tbody>
              {insights.rankings.map((row, index) => (
                <tr key={row.account.id}>
                  <td>{index + 1}</td>
                  <td><button className="link-button" onClick={() => onAccount(row.account.id)}>@{row.account.username}</button><small>{row.account.group || row.account.employee || row.account.nickname || "未标注"}</small></td>
                  <td><span className={`health-badge ${row.health.color || ""}`}>{row.health.score}</span></td>
                  <td>{row.health.grade}</td>
                  <td>{signedNumber(row.plays_delta_24h)}</td>
                  <td>{signedNumber(row.follower_delta_24h)}</td>
                  <td>{row.engagement}%</td>
                  <td>{row.health.sync_rate ?? "-"}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!insights.rankings.length ? <p className="empty-state">暂无账号健康排行。</p> : null}
      </section>

      {insights.alerts.length ? (
        <section className="panel">
          <div className="panel-head"><h2>未读告警摘要</h2><span>{insights.alerts.length} 条</span></div>
          <div className="stack-list rich-list">
            {insights.alerts.map((alert) => (
              <article className={`list-item ${alert.is_read ? "" : "item-hot"}`} key={alert.id}>
                <strong>{alert.title || alert.type}<span className={`level-badge level-${alert.level || "info"}`}>{alert.level || "info"}</span></strong>
                <span>{alert.message}</span>
                <small>{formatDate(alert.created_at)}</small>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function QualityPage({
  quality,
  providers,
  logs,
  onApplyQuality,
  onOpenAccount
}: {
  quality: DataQuality | null;
  providers: ProviderHealth[];
  logs: SyncLog[];
  onApplyQuality: (quality: string) => void;
  onOpenAccount: (id: number) => void;
}) {
  if (!quality) return <p className="empty-state">正在加载数据健康状态…</p>;
  const failedProviders = providers.filter((provider) => provider.available === false || (provider.consecutive_failures || 0) > 0);
  const recentFailures = logs.filter((log) => log.status === "error").slice(0, 6);
  const healthyRatio = quality.total_accounts
    ? Math.round((quality.healthy_accounts / quality.total_accounts) * 100)
    : 100;
  return (
    <section className="detail-layout">
      <section className="metric-grid detail-metrics">
        <Metric icon={<CheckCircle2 />} label="健康账号" value={quality.healthy_accounts} detail={`${healthyRatio}% 无明显问题`} />
        <Metric icon={<Users />} label="监控账号" value={quality.total_accounts} detail="当前启用账号范围" />
        <Metric icon={<AlertTriangle />} label="健康问题" value={quality.cards.reduce((sum, card) => sum + card.count, 0)} detail="同一账号可能命中多项" />
        <Metric icon={<Server />} label="采集源风险" value={failedProviders.length} detail={`${providers.length} 个 provider 已记录`} />
      </section>

      <section className="quality-grid">
        {quality.cards.map((card) => (
          <QualityCard
            card={card}
            key={card.key}
            onApply={() => onApplyQuality(card.key)}
            onOpenAccount={onOpenAccount}
          />
        ))}
      </section>

      <section className="operations-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>采集源风险</h2>
            <span>{failedProviders.length ? `${failedProviders.length} 个需关注` : "正常"}</span>
          </div>
          <div className="stack-list">
            {(failedProviders.length ? failedProviders : providers.slice(0, 4)).map((provider) => (
              <article className="list-item" key={provider.provider}>
                <strong>{provider.provider}</strong>
                <span>成功率 {provider.success_rate ?? 100}% · 连续失败 {provider.consecutive_failures || 0}</span>
                <small>最近失败：{formatDate(provider.last_failure_at || provider.last_failure)}</small>
              </article>
            ))}
            {!providers.length ? <EmptyState title="暂无采集源数据" detail="完成同步后，这里会显示 provider 成功率和失败风险。" /> : null}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>最近失败同步</h2>
            <span>{recentFailures.length} 条</span>
          </div>
          <div className="stack-list">
            {recentFailures.map((log) => (
              <article className="list-item" key={log.id}>
                <strong>{log.username || "系统"}</strong>
                <span>{log.message || "同步失败"}</span>
                <small>{formatDate(log.created_at)} · {log.provider_used || "未知采集源"}</small>
              </article>
            ))}
            {!recentFailures.length ? <EmptyState title="暂无失败同步" detail="最近同步日志里没有失败记录。" /> : null}
          </div>
        </section>
      </section>
    </section>
  );
}

function QualityCard({
  card,
  onApply,
  onOpenAccount
}: {
  card: DataQualityCard;
  onApply: () => void;
  onOpenAccount: (id: number) => void;
}) {
  return (
    <section className={`panel quality-card quality-${card.severity}`}>
      <div className="panel-head">
        <div>
          <h2>{card.label}</h2>
          <span>{card.count ? "需要处理" : "暂无问题"}</span>
        </div>
        <strong>{card.count}</strong>
      </div>
      <button className="ghost-light-button" disabled={!card.count} onClick={onApply}>查看账号</button>
      <div className="stack-list">
        {card.samples.map((sample) => (
          <article className="list-item" key={sample.id}>
            <button className="list-action" onClick={() => onOpenAccount(sample.id)}>
              <strong>@{sample.username}</strong>
              <span>{sample.group || sample.employee || sample.nickname || "未标注"}</span>
              <small>
                同步 {formatDate(sample.last_sync_at)} · 视频 {sample.videos} · 最近发文 {formatDate(sample.latest_video_at)}
              </small>
            </button>
          </article>
        ))}
        {!card.samples.length ? <p className="empty-state">当前没有样例账号。</p> : null}
      </div>
    </section>
  );
}

function AlertsPage({
  alerts,
  meta,
  page,
  stats,
  busy,
  authenticated,
  unreadOnly,
  alertLevel,
  selectedAlertIds,
  onUnreadOnlyChange,
  onAlertLevelChange,
  onToggleAlert,
  onMarkSelected,
  onReadAll,
  onPage,
  onAlert
}: {
  alerts: Alert[];
  meta: PageMeta;
  page: number;
  stats: Stats | null;
  busy: boolean;
  authenticated: boolean;
  unreadOnly: boolean;
  alertLevel: string;
  selectedAlertIds: number[];
  onUnreadOnlyChange: (value: boolean) => void;
  onAlertLevelChange: (value: string) => void;
  onToggleAlert: (alertId: number, selected: boolean) => void;
  onMarkSelected: () => void;
  onReadAll: () => Promise<void>;
  onPage: (page: number) => void;
  onAlert: (alert: Alert) => void;
}) {
  return (
    <section className="detail-layout">
      <section className="metric-grid detail-metrics">
        <Metric icon={<AlertTriangle />} label="未读告警" value={stats?.unread_alerts} detail="需要优先处理" />
        <Metric icon={<CheckCircle2 />} label="当前列表" value={meta.total} detail={unreadOnly ? "仅未读" : "全部告警"} />
        <Metric icon={<Users />} label="已选择" value={selectedAlertIds.length} detail="可批量标为已读" />
        <Metric icon={<Activity />} label="当前页" value={alerts.length} detail={alertLevel || "全部级别"} />
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>告警中心</h2>
          <div className="panel-actions">
            <label className="check-label"><input type="checkbox" checked={unreadOnly} onChange={(event) => onUnreadOnlyChange(event.target.checked)} /> 只看未读</label>
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
        <div className="stack-list rich-list">
          {alerts.map((alert) => (
            <article className={`list-item alert-item ${alert.is_read ? "" : "item-hot"}`} key={alert.id}>
              <label className="alert-select"><input type="checkbox" checked={selectedAlertIds.includes(alert.id)} onChange={(event) => onToggleAlert(alert.id, event.target.checked)} aria-label="选择告警" /></label>
              <button className="list-action" onClick={() => onAlert(alert)}>
                <strong>{alert.title || alert.type}<span className={`level-badge level-${alert.level || "info"}`}>{alert.level || "info"}</span></strong>
                <span>{alert.message}</span>
                <small>{formatDate(alert.created_at)}{alert.account_id ? ` · 账号 #${alert.account_id}` : ""}{alert.video_id ? ` · 视频 #${alert.video_id}` : ""}{!alert.is_read ? " · 点击查看并标为已读" : ""}</small>
              </button>
            </article>
          ))}
          {!alerts.length ? (
            <EmptyState
              title="暂无符合条件的告警"
              detail={unreadOnly || alertLevel ? "可以切换级别或取消“只看未读”筛选。" : "系统暂未发现异常；同步账号后会继续生成新的告警。"}
            />
          ) : null}
        </div>
        <PageControls meta={meta} page={page} onPage={onPage} />
      </section>
    </section>
  );
}

function LogsPage({
  logs,
  meta,
  page,
  filters,
  providers,
  onFilterChange,
  onClearFilters,
  onPage
}: {
  logs: SyncLog[];
  meta: PageMeta;
  page: number;
  filters: LogFilters;
  providers: ProviderHealth[];
  onFilterChange: (key: keyof LogFilters, value: string) => void;
  onClearFilters: () => void;
  onPage: (page: number) => void;
}) {
  const providerNames = Array.from(new Set(providers.map((provider) => provider.provider).filter(Boolean)));
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>同步日志</h2>
        <span>{meta.total} 条</span>
      </div>
      <div className="log-filter-grid">
        <input value={filters.q || ""} onChange={(event) => onFilterChange("q", event.target.value)} placeholder="搜索账号、消息、状态或采集源" />
        <select className="filter-select" value={filters.status || ""} onChange={(event) => onFilterChange("status", event.target.value)}>
          <option value="">全部状态</option>
          <option value="success">成功</option>
          <option value="error">错误</option>
          <option value="warning">警告</option>
        </select>
        <select className="filter-select" value={filters.provider || ""} onChange={(event) => onFilterChange("provider", event.target.value)}>
          <option value="">全部采集源</option>
          {providerNames.map((provider) => <option value={provider} key={provider}>{provider}</option>)}
        </select>
        <button className="ghost-light-button" onClick={onClearFilters}>清除筛选</button>
      </div>
      <div className="table-wrap">
        <table className="compact-table">
          <thead><tr><th>时间</th><th>账号</th><th>状态</th><th>采集源</th><th>更新视频</th><th>重试</th><th>消息</th></tr></thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{formatDate(log.created_at)}</td>
                <td>{log.username || "系统"}</td>
                <td><span className={`level-badge level-${log.status === "success" ? "info" : log.status || "warning"}`}>{log.status}</span></td>
                <td>{log.provider_used || "-"}</td>
                <td>{log.videos_updated || 0}</td>
                <td>{log.retry_count || 0}</td>
                <td>{log.message || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!logs.length ? (
        <EmptyState
          title="暂无符合条件的同步日志"
          detail={filters.q || filters.status || filters.provider ? "可以清除筛选后查看全部同步记录。" : "触发同步后，这里会记录状态、采集源、更新视频数和失败原因。"}
          action={(filters.q || filters.status || filters.provider) ? <button className="ghost-light-button" onClick={onClearFilters}>清除筛选</button> : undefined}
        />
      ) : null}
      <PageControls meta={meta} page={page} onPage={onPage} />
    </section>
  );
}

function auditActionLabel(action: string) {
  const labels: Record<string, string> = {
    add_account: "添加账号",
    edit_account: "编辑账号",
    delete_account: "删除账号",
    bulk_tag_accounts: "批量标签",
    sync_account: "同步账号",
    sync_all: "全部同步",
    import_accounts: "批量导入",
    create_backup: "创建备份",
    read_alert: "告警已读",
    read_all_alerts: "全部告警已读",
    mark_alerts_read: "批量告警已读",
    toggle_account: "切换账号状态"
  };
  return labels[action] || action || "-";
}

function AuditLogsPage({
  logs,
  meta,
  page,
  filters,
  onFilterChange,
  onClearFilters,
  onPage
}: {
  logs: AuditLog[];
  meta: PageMeta;
  page: number;
  filters: AuditFilters;
  onFilterChange: (key: keyof AuditFilters, value: string) => void;
  onClearFilters: () => void;
  onPage: (page: number) => void;
}) {
  const actions = meta.actions || [];
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>审计日志</h2>
        <span>{meta.total} 条</span>
      </div>
      <div className="audit-filter-grid">
        <input value={filters.q || ""} onChange={(event) => onFilterChange("q", event.target.value)} placeholder="搜索操作、详情、操作者或账号" />
        <select className="filter-select" value={filters.action || ""} onChange={(event) => onFilterChange("action", event.target.value)}>
          <option value="">全部操作</option>
          {actions.map((action) => <option value={action} key={action}>{auditActionLabel(action)}</option>)}
        </select>
        <input value={filters.actor || ""} onChange={(event) => onFilterChange("actor", event.target.value)} placeholder="操作者" />
        <input value={filters.account_id || ""} onChange={(event) => onFilterChange("account_id", event.target.value)} placeholder="账号 ID" />
        <button className="ghost-light-button" onClick={onClearFilters}>清除筛选</button>
      </div>
      <div className="table-wrap">
        <table className="compact-table">
          <thead><tr><th>时间</th><th>操作</th><th>操作者</th><th>账号</th><th>详情</th></tr></thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{formatDate(log.created_at)}</td>
                <td><span className="level-badge level-info">{auditActionLabel(log.action)}</span><small>{log.action}</small></td>
                <td>{log.actor || "system"}</td>
                <td>{log.account_username ? `@${log.account_username}` : log.account_id ? `#${log.account_id}` : "-"}</td>
                <td>{log.detail || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!logs.length ? (
        <EmptyState
          title="暂无符合条件的审计日志"
          detail={filters.q || filters.action || filters.actor || filters.account_id ? "可以清除筛选后查看全部审计记录。" : "执行同步、导入、备份或告警处理后，这里会记录操作时间和详情。"}
          action={(filters.q || filters.action || filters.actor || filters.account_id) ? <button className="ghost-light-button" onClick={onClearFilters}>清除筛选</button> : undefined}
        />
      ) : null}
      <PageControls meta={meta} page={page} onPage={onPage} />
    </section>
  );
}

function ProvidersPage({ providers }: { providers: ProviderHealth[] }) {
  const available = providers.filter((provider) => provider.available !== false).length;
  return (
    <section className="detail-layout">
      <section className="metric-grid detail-metrics">
        <Metric icon={<Server />} label="采集源" value={providers.length} detail={`${available} 个可用`} />
        <Metric icon={<CheckCircle2 />} label="成功次数" value={providers.reduce((sum, provider) => sum + (provider.success_count || 0), 0)} detail="累计成功请求" />
        <Metric icon={<AlertTriangle />} label="失败次数" value={providers.reduce((sum, provider) => sum + (provider.failure_count || 0), 0)} detail="累计失败请求" />
        <Metric icon={<Activity />} label="连续失败" value={providers.reduce((sum, provider) => sum + (provider.consecutive_failures || 0), 0)} detail="达到阈值会降级" />
      </section>
      <section className="panel">
        <div className="panel-head"><h2>Provider 健康状态</h2><span>{providers.length} 个</span></div>
        <div className="provider-grid provider-grid-wide">
          {providers.map((provider) => (
            <article className={`provider-tile ${provider.available === false ? "provider-down" : ""}`} key={provider.provider}>
              <strong>{provider.provider}<span className={provider.available === false ? "level-badge level-error" : "level-badge level-info"}>{provider.available === false ? "不可用" : "可用"}</span></strong>
              <span>成功率 {provider.success_rate ?? 100}%</span>
              <span>成功 {provider.success_count || 0} · 失败 {provider.failure_count || 0}</span>
              <span>连续失败 {provider.consecutive_failures || 0}</span>
              <span>平均延迟 {provider.avg_latency_ms || 0} ms</span>
              <small>最近成功：{formatDate(provider.last_success_at || provider.last_success)}</small>
              <small>最近失败：{formatDate(provider.last_failure_at || provider.last_failure)}</small>
            </article>
          ))}
        </div>
        {!providers.length ? (
          <EmptyState
            title="暂无采集源健康数据"
            detail="完成一次同步后，系统会开始记录各采集源的成功率、连续失败和平均延迟。"
          />
        ) : null}
      </section>
    </section>
  );
}

function OperationsPage({
  health,
  stats,
  dashboard,
  providers,
  logs,
  auditLogs,
  backups,
  operation,
  operationHistory,
  activeOperationKey,
  busy,
  authenticated,
  onRefresh,
  onSyncAll,
  onCreateBackup,
  onDownloadBackup
}: {
  health: Health | null;
  stats: Stats | null;
  dashboard: DashboardData | null;
  providers: ProviderHealth[];
  logs: SyncLog[];
  auditLogs: AuditLog[];
  backups: BackupList | null;
  operation: OperationState | null;
  operationHistory: OperationState[];
  activeOperationKey: string;
  busy: boolean;
  authenticated: boolean;
  onRefresh: () => void;
  onSyncAll: () => void;
  onCreateBackup: () => void;
  onDownloadBackup: (name: string) => void;
}) {
  const scheduler = stats?.scheduler || health?.scheduler || {};
  const progress = dashboard?.sync.progress;
  const queueSize = dashboard?.sync.queue_size ?? progress?.queue_size ?? 0;
  const syncRunning = Boolean(progress?.running);
  const syncBlocked = syncRunning || queueSize > 0 || activeOperationKey === "sync-all";
  const availableProviders = providers.filter((provider) => provider.available !== false).length;
  const failedProviders = providers.filter((provider) => provider.available === false || (provider.consecutive_failures || 0) > 0);
  const latestBackup = backups?.items[0];
  return (
    <section className="detail-layout">
      <section className="metric-grid detail-metrics">
        <Metric icon={<Server />} label="服务状态" value={health?.ok ? 1 : 0} detail={health?.ok ? `在线 · v${health.version}` : "未连接"} />
        <Metric icon={<RefreshCcw />} label="同步队列" value={queueSize} detail={syncRunning ? `同步中 ${progress?.completed || 0}/${progress?.total || 0}` : "当前等待任务"} />
        <Metric icon={<CheckCircle2 />} label="采集源" value={availableProviders} detail={`${providers.length} 个已记录`} />
        <Metric icon={<FileUp />} label="备份数量" value={backups?.total || 0} detail={latestBackup ? `最新 ${formatDate(latestBackup.modified_at)}` : "暂无备份"} />
      </section>

      <section className="panel operations-hero">
        <div>
          <h2>运维快捷操作</h2>
          <p>这里聚合日常维护最常用的动作：刷新状态、触发同步、创建备份和下载最新备份。</p>
          {operation ? (
            <small className={`operation-inline operation-${operation.status}`}>
              {operation.status === "running" ? "当前操作" : "最近结果"}：{operation.title} · {operation.detail}
            </small>
          ) : null}
        </div>
        <div className="operations-actions">
          <button className="ghost-light-button" disabled={busy || !authenticated} onClick={onRefresh}>
            <RefreshCcw aria-hidden="true" />
            刷新状态
          </button>
          <button className="primary-button" disabled={busy || !authenticated || syncBlocked} onClick={onSyncAll}>
            <Play aria-hidden="true" />
            {syncBlocked ? "同步排队中" : "全部同步"}
          </button>
          <button className="ghost-light-button" disabled={busy || !authenticated} onClick={onCreateBackup}>
            <FileUp aria-hidden="true" />
            创建备份
          </button>
          <button className="ghost-light-button" disabled={busy || !authenticated || !latestBackup} onClick={() => latestBackup && onDownloadBackup(latestBackup.name)}>
            下载最新备份
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>最近任务结果</h2>
          <span>{operationHistory.length} 条</span>
        </div>
        <div className="task-timeline">
          {operationHistory.map((item, index) => (
            <article className={`task-card task-${item.status}`} key={`${item.timestamp}-${item.title}-${index}`}>
              <div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
              <small>{item.timestamp}{item.durationMs ? ` · ${formatDuration(item.durationMs)}` : ""}</small>
            </article>
          ))}
          {!operationHistory.length ? (
            <EmptyState
              title="暂无任务记录"
              detail="刷新、同步、导入、导出和备份操作完成后，会在这里留下最近结果。"
            />
          ) : null}
        </div>
      </section>

      <section className="operations-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>服务器与调度器</h2>
            <span>{scheduler.running ? "运行中" : "未运行"}</span>
          </div>
          <div className="ops-fact-list">
            <span>账号：{stats?.total_accounts || health?.accounts || 0} 个（启用 {stats?.active_accounts || health?.active_accounts || 0}）</span>
            <span>视频：{compactNumber(stats?.total_videos)} · 播放 {compactNumber(stats?.total_plays)}</span>
            <span>同步间隔：{scheduler.interval_minutes ? `${scheduler.interval_minutes} 分钟` : "-"}</span>
            <span>下次同步：{formatDate(scheduler.next_run)}</span>
            <span>上次同步：{formatDate(scheduler.last_run || stats?.last_sync_at)}</span>
            <span>上次摘要：{scheduler.last_summary || "-"}</span>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>同步状态</h2>
            <span>{syncRunning ? "正在同步" : "空闲"}</span>
          </div>
          <div className="ops-fact-list">
            <span>当前账号：{progress?.current_username ? `@${progress.current_username}` : "-"}</span>
            <span>进度：{progress?.completed || 0}/{progress?.total || 0}</span>
            <span>队列：{queueSize} 个</span>
            <span>同步中账号：{dashboard?.sync.syncing_ids.length || 0} 个</span>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>备份摘要</h2>
            <span>{formatBytes(backups?.total_size)}</span>
          </div>
          {latestBackup ? (
            <div className="ops-fact-list">
              <span>最新文件：{latestBackup.name}</span>
              <span>大小：{formatBytes(latestBackup.size)}</span>
              <span>更新时间：{formatDate(latestBackup.modified_at)}</span>
              <button className="text-button" disabled={busy || !authenticated} onClick={() => onDownloadBackup(latestBackup.name)}>下载最新备份</button>
            </div>
          ) : (
            <p className="empty-state">暂无备份。建议先创建一份手动备份。</p>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>采集源风险</h2>
            <span>{failedProviders.length ? `${failedProviders.length} 个需关注` : "正常"}</span>
          </div>
          <div className="stack-list">
            {(failedProviders.length ? failedProviders : providers.slice(0, 4)).map((provider) => (
              <article className="list-item" key={provider.provider}>
                <strong>{provider.provider}</strong>
                <span>成功率 {provider.success_rate ?? 100}% · 连续失败 {provider.consecutive_failures || 0}</span>
                <small>最近失败：{formatDate(provider.last_failure_at || provider.last_failure)}</small>
              </article>
            ))}
            {!providers.length ? (
              <EmptyState
                title="暂无采集源数据"
                detail="完成同步后，这里会优先展示失败或需要关注的 provider。"
              />
            ) : null}
          </div>
        </section>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>最近同步日志</h2>
          <span>{logs.length} 条</span>
        </div>
        <div className="table-wrap">
          <table className="compact-table">
            <thead><tr><th>时间</th><th>账号</th><th>状态</th><th>采集源</th><th>消息</th></tr></thead>
            <tbody>
              {logs.slice(0, 8).map((log) => (
                <tr key={log.id}>
                  <td>{formatDate(log.created_at)}</td>
                  <td>{log.username || "系统"}</td>
                  <td><span className={`level-badge level-${log.status === "success" ? "info" : log.status || "warning"}`}>{log.status}</span></td>
                  <td>{log.provider_used || "-"}</td>
                  <td>{log.message || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!logs.length ? (
          <EmptyState
            title="暂无同步日志"
            detail="触发同步后，这里会显示最近的同步状态、采集源和错误信息。"
          />
        ) : null}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>最近审计日志</h2>
          <span>{auditLogs.length} 条</span>
        </div>
        <div className="stack-list">
          {auditLogs.slice(0, 6).map((log) => (
            <article className="list-item" key={log.id}>
              <strong>{auditActionLabel(log.action)}</strong>
              <span>{log.detail || "-"}</span>
              <small>{formatDate(log.created_at)} · {log.actor || "system"}{log.account_username ? ` · @${log.account_username}` : ""}</small>
            </article>
          ))}
          {!auditLogs.length ? (
            <EmptyState
              title="暂无审计日志"
              detail="执行同步、导入、备份或告警处理后，这里会显示最近操作记录。"
            />
          ) : null}
        </div>
      </section>
    </section>
  );
}

function BackupsPage({
  backups,
  busy,
  authenticated,
  onCreate,
  onDownload
}: {
  backups: BackupList | null;
  busy: boolean;
  authenticated: boolean;
  onCreate: () => void;
  onDownload: (name: string) => void;
}) {
  const items = backups?.items || [];
  const latest = items[0];
  const totalMegabytes = Math.round((backups?.total_size || 0) / 1024 / 1024);
  return (
    <section className="detail-layout">
      <section className="metric-grid detail-metrics">
        <Metric icon={<FileUp />} label="备份数量" value={backups?.total || 0} detail="服务器当前可下载备份" />
        <Metric icon={<Server />} label="占用(MB)" value={totalMegabytes} detail={formatBytes(backups?.total_size)} />
        <Metric icon={<CheckCircle2 />} label="最新备份" value={latest ? 1 : 0} detail={latest ? formatDate(latest.modified_at) : "暂无备份"} />
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>数据库备份</h2>
            <span>只提供创建和下载，不提供恢复入口，避免误覆盖线上数据。</span>
          </div>
          <button className="primary-button" disabled={busy || !authenticated} onClick={onCreate}>
            <FileUp aria-hidden="true" />
            创建备份
          </button>
        </div>

        <div className="table-wrap">
          <table className="backup-table">
            <thead>
              <tr>
                <th>文件名</th>
                <th>大小</th>
                <th>创建时间</th>
                <th>更新时间</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((backup) => (
                <tr key={backup.name}>
                  <td>
                    <strong>{backup.name}</strong>
                    <small>{backup.download_url}</small>
                  </td>
                  <td>{formatBytes(backup.size)}</td>
                  <td>{formatDate(backup.created_at)}</td>
                  <td>{formatDate(backup.modified_at)}</td>
                  <td>
                    <button className="ghost-light-button" disabled={busy || !authenticated} onClick={() => onDownload(backup.name)}>
                      下载
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!items.length ? (
          <EmptyState
            title="暂无备份"
            detail="点击“创建备份”后会生成一个可下载的 SQLite 数据库快照；部署前建议先做一次手动备份。"
            action={<button className="ghost-light-button" disabled={busy || !authenticated} onClick={onCreate}>创建备份</button>}
          />
        ) : null}
      </section>
    </section>
  );
}

function EditableAccountTags({
  account,
  busy,
  onSave
}: {
  account: Account;
  busy: boolean;
  onSave: (payload: AccountUpdate) => void;
}) {
  const [draft, setDraft] = useState({
    group_name: account.group || account.group_name || "",
    phone: account.phone || "",
    employee: account.employee || "",
    note: account.note || ""
  });

  useEffect(() => {
    setDraft({
      group_name: account.group || account.group_name || "",
      phone: account.phone || "",
      employee: account.employee || "",
      note: account.note || ""
    });
  }, [account.id, account.group, account.group_name, account.phone, account.employee, account.note]);

  const saveIfChanged = () => {
    const next = {
      group_name: draft.group_name.trim(),
      phone: draft.phone.trim(),
      employee: draft.employee.trim(),
      note: draft.note.trim()
    };
    const current = {
      group_name: account.group || account.group_name || "",
      phone: account.phone || "",
      employee: account.employee || "",
      note: account.note || ""
    };
    const payload: AccountUpdate = {};
    if (next.group_name !== current.group_name) payload.group_name = next.group_name;
    if (next.phone !== current.phone) payload.phone = next.phone;
    if (next.employee !== current.employee) payload.employee = next.employee;
    if (next.note !== current.note) payload.note = next.note;
    if (Object.keys(payload).length) onSave(payload);
  };

  return (
    <div className="tag-edit-grid">
      <input disabled={busy} value={draft.group_name} onBlur={saveIfChanged} onChange={(event) => setDraft((current) => ({ ...current, group_name: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} placeholder="未分组" />
      <input disabled={busy} value={draft.phone} onBlur={saveIfChanged} onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} placeholder="手机" />
      <input disabled={busy} value={draft.employee} onBlur={saveIfChanged} onChange={(event) => setDraft((current) => ({ ...current, employee: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} placeholder="未分配" />
      <input disabled={busy} value={draft.note} onBlur={saveIfChanged} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} placeholder="备注" />
    </div>
  );
}

function AccountPage({ account, busy, onSync, onVideo, onCopyUsername, onCopyProfile, onCopyVideoLink, onShowLogs, onShowAudit, onShowAlerts, onVideoPage, onLogPage }: {
  account: AccountDetail;
  busy: boolean;
  onSync: () => void;
  onVideo: (id: number) => void;
  onCopyUsername: () => void;
  onCopyProfile: () => void;
  onCopyVideoLink: (video: Video) => void;
  onShowLogs: () => void;
  onShowAudit: () => void;
  onShowAlerts: () => void;
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
        <div>
          <h2>@{account.username}</h2>
          <p>{account.nickname || "未设置昵称"} · {account.group || "未分组"} · {account.employee || "未分配员工"}</p>
        </div>
      </div>
      <div className="profile-actions">
        <button className="primary-button" disabled={busy} onClick={onSync}><RefreshCcw aria-hidden="true" />同步账号</button>
        <a className="ghost-light-button" href={profileUrl(account.username)} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" />打开 TikTok</a>
        <button className="ghost-light-button" onClick={onCopyUsername}><Copy aria-hidden="true" />复制用户名</button>
        <button className="ghost-light-button" onClick={onCopyProfile}><Copy aria-hidden="true" />复制主页</button>
      </div>
    </section>
    <section className="panel quick-nav-panel">
      <div>
        <h2>快捷排查</h2>
        <p>从账号直接跳到相关记录，少绕路一点点，手感会好很多。</p>
      </div>
      <div className="quick-nav-actions">
        <button className="ghost-light-button" onClick={onShowLogs}><RefreshCcw aria-hidden="true" />同步日志</button>
        <button className="ghost-light-button" onClick={onShowAudit}><CheckCircle2 aria-hidden="true" />审计记录</button>
        <button className="ghost-light-button" onClick={onShowAlerts}><AlertTriangle aria-hidden="true" />告警中心</button>
      </div>
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
        {videos.map((video) => {
          const tikTokUrl = videoUrlForUsername(account.username, video.video_id);
          return (
            <tr key={video.id}>
              <td>
                <button className="link-button" onClick={() => onVideo(video.id)}>{video.title || "无标题视频"}</button>
                <div className="mini-action-row">
                  <button onClick={() => onVideo(video.id)}>详情</button>
                  {tikTokUrl ? <a href={tikTokUrl} target="_blank" rel="noreferrer">TikTok</a> : null}
                  <button disabled={!tikTokUrl} onClick={() => onCopyVideoLink(video)}>复制链接</button>
                </div>
              </td>
              <td>{compactNumber(video.play_count)}</td>
              <td>{compactNumber(video.like_count)}</td>
              <td>{compactNumber(video.comment_count)}</td>
              <td>{formatDate(video.published_at)}</td>
            </tr>
          );
        })}
      </tbody></table></div>
      {!videos.length ? (
        <EmptyState
          title="暂无视频记录"
          detail="点击“同步账号”后，系统会采集该账号的视频列表和播放数据。"
          action={<button className="ghost-light-button" disabled={busy} onClick={onSync}>同步账号</button>}
        />
      ) : null}
      <PageControls meta={account.videos_meta || EMPTY_PAGE_META} page={account.videos_meta?.page || 1} onPage={onVideoPage} />
    </section>
    <section className="panel">
      <div className="panel-head"><h2>最近同步记录</h2><span>{account.logs.length} 条</span></div>
      <div className="stack-list">
        {account.logs.map((log) => <article className="list-item" key={log.id}><strong>{log.status}</strong><span>{log.message || "同步完成"}</span><small>{formatDate(log.created_at)} · 更新 {log.videos_updated} 个视频</small></article>)}
        {!account.logs.length ? (
          <EmptyState
            title="暂无同步记录"
            detail="同步该账号后，这里会显示最近同步时间、更新视频数量和失败原因。"
          />
        ) : null}
      </div>
      <PageControls meta={account.logs_meta || EMPTY_PAGE_META} page={account.logs_meta?.page || 1} onPage={onLogPage} />
    </section>
  </section>;
}

function VideoPage({
  video,
  onAccount,
  onCopyLink,
  onCopyVideoId,
  onCopyAuthorProfile,
  onHistoryPage
}: {
  video: Video;
  onAccount: (id: number) => void;
  onCopyLink: () => void;
  onCopyVideoId: () => void;
  onCopyAuthorProfile: () => void;
  onHistoryPage: (page: number) => void;
}) {
  const tikTokUrl = videoUrl(video);
  return <section className="detail-layout">
    <section className="panel profile-panel">
      <div className="profile-heading">
        {video.cover_url ? <img className="video-cover" src={video.cover_url} alt="" /> : <VideoIcon aria-hidden="true" />}
        <div>
          <h2>{video.title || "无标题视频"}</h2>
          {video.account ? <button className="link-button" onClick={() => onAccount(video.account!.id)}>@{video.account.username}</button> : null}
          <p>{video.video_id ? `视频 ID：${video.video_id}` : "暂无 TikTok 视频 ID"}</p>
        </div>
      </div>
      <div className="profile-actions">
        {video.account ? <button className="ghost-light-button" onClick={() => onAccount(video.account!.id)}><UserRound aria-hidden="true" />账号详情</button> : null}
        {tikTokUrl ? <a className="ghost-light-button" href={tikTokUrl} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" />打开 TikTok</a> : null}
        <button className="ghost-light-button" disabled={!tikTokUrl} onClick={onCopyLink}><Copy aria-hidden="true" />复制链接</button>
        <button className="ghost-light-button" disabled={!video.video_id} onClick={onCopyVideoId}><Copy aria-hidden="true" />复制视频 ID</button>
        {video.account ? <button className="ghost-light-button" onClick={onCopyAuthorProfile}><Copy aria-hidden="true" />复制作者主页</button> : null}
      </div>
    </section>
    <section className="panel quick-nav-panel">
      <div>
        <h2>视频快捷操作</h2>
        <p>需要复盘单条视频时，可以直接复制 ID、打开原视频，或跳回作者账号看整体表现。</p>
      </div>
      <div className="quick-nav-actions">
        {video.account ? <button className="ghost-light-button" onClick={() => onAccount(video.account!.id)}><UserRound aria-hidden="true" />查看作者</button> : null}
        {tikTokUrl ? <a className="ghost-light-button" href={tikTokUrl} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" />打开原视频</a> : null}
        <button className="ghost-light-button" disabled={!tikTokUrl} onClick={onCopyLink}><Copy aria-hidden="true" />复制视频链接</button>
      </div>
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

function HelpPage({ onNavigate, authenticated }: { onNavigate: (view: View) => void; authenticated: boolean }) {
  const guideSections = [
    {
      title: "首次使用",
      icon: <Server aria-hidden="true" />,
      items: [
        "确认服务器地址是团队统一地址，例如 http://服务器IP:8099。",
        "登录后先点“刷新”，确认账号、告警和同步日志能正常读取。",
        "如果连接失败，先检查服务器地址、网络、防火墙和桌面端版本。"
      ],
      action: <button className="ghost-light-button" onClick={() => onNavigate("dashboard")}>回到总览</button>
    },
    {
      title: "日常检查顺序",
      icon: <Activity aria-hidden="true" />,
      items: [
        "先看总览的今日新发、今日增播和未读告警。",
        "再进入数据健康，处理未同步、无视频、同步失败或缺指标账号。",
        "最后按员工、品类或保存筛选导出 CSV 给团队复盘。"
      ],
      action: <button className="ghost-light-button" disabled={!authenticated} onClick={() => onNavigate("quality")}>打开数据健康</button>
    },
    {
      title: "添加与导入账号",
      icon: <FileUp aria-hidden="true" />,
      items: [
        "单个账号可在总览直接添加，支持用户名或 TikTok 主页链接。",
        "批量导入每行一个账号，也可以写：用户名、分组、手机、员工、备注。",
        "导入前会有确认框；如果勾选同步，导入后会加入同步队列。"
      ],
      action: <button className="ghost-light-button" disabled={!authenticated} onClick={() => onNavigate("import")}>批量导入</button>
    },
    {
      title: "同步与排查",
      icon: <RefreshCcw aria-hidden="true" />,
      items: [
        "全部同步适合低峰期触发；已有同步运行或排队时不要重复点击。",
        "单个账号详情里可以同步账号，也能直接查看同步日志和审计记录。",
        "同步失败时先看同步日志，再看采集源健康和运维中心的最近任务结果。"
      ],
      action: <button className="ghost-light-button" disabled={!authenticated} onClick={() => onNavigate("logs")}>查看同步日志</button>
    },
    {
      title: "导出与交接",
      icon: <Copy aria-hidden="true" />,
      items: [
        "导出账号 CSV 会带上当前筛选，适合按员工、品类或数据健康问题交接。",
        "导出视频 CSV 用于复盘视频表现；账号/视频详情页也能复制链接。",
        "批量修改前先确认筛选结果数量，避免误改不相关账号。"
      ],
      action: <button className="ghost-light-button" disabled={!authenticated} onClick={() => onNavigate("dashboard")}>去筛选账号</button>
    },
    {
      title: "备份与运维",
      icon: <CheckCircle2 aria-hidden="true" />,
      items: [
        "发布或大批量操作前，建议先在备份管理里创建一次数据库备份。",
        "运维中心可以查看同步队列、采集源风险、最近任务结果和最新备份。",
        "恢复数据库不在桌面端直接开放，避免误覆盖线上数据。"
      ],
      action: <button className="ghost-light-button" disabled={!authenticated} onClick={() => onNavigate("operations")}>打开运维中心</button>
    }
  ];
  return (
    <section className="detail-layout">
      <section className="panel help-hero">
        <div>
          <h2>团队使用指南</h2>
          <p>把最常见的操作路径放在这里：新人照着走，老手也能少翻文档。</p>
        </div>
        <div className="help-hero-actions">
          <button className="primary-button" onClick={() => onNavigate("dashboard")}>从总览开始</button>
          <button className="ghost-light-button" disabled={!authenticated} onClick={() => onNavigate("operations")}>查看运维中心</button>
        </div>
      </section>

      <section className="help-grid">
        {guideSections.map((section) => (
          <article className="panel help-card" key={section.title}>
            <div className="help-card-head">
              <span>{section.icon}</span>
              <h2>{section.title}</h2>
            </div>
            <ol>
              {section.items.map((item) => <li key={item}>{item}</li>)}
            </ol>
            <div className="help-card-action">{section.action}</div>
          </article>
        ))}
      </section>

      <section className="panel help-checklist">
        <div className="panel-head">
          <h2>遇到问题先看这里</h2>
          <span>快速排查</span>
        </div>
        <div className="checklist-grid">
          <span>连接失败：检查服务器地址、端口 8099、防火墙、服务器容器状态。</span>
          <span>账号没数据：先同步账号，再看同步日志里的失败原因。</span>
          <span>导出找不到：文件会交给系统下载目录，注意浏览器/系统下载提示。</span>
          <span>页面数据旧：点击右上角刷新，或到运维中心看同步队列是否仍在跑。</span>
        </div>
      </section>
    </section>
  );
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
