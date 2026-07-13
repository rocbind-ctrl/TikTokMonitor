import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

export type ApiClient = ReturnType<typeof createApiClient>;

export interface Health {
  ok: boolean;
  version: string;
  scheduler: SchedulerInfo;
  accounts: number;
  active_accounts: number;
  unread_alerts: number;
}

export interface Stats {
  version: string;
  total_accounts: number;
  active_accounts: number;
  total_videos: number;
  total_plays: number;
  unread_alerts: number;
  last_sync_at: string | null;
  scheduler: SchedulerInfo;
}

export interface SchedulerInfo {
  running?: boolean;
  interval_minutes?: number;
  next_run?: string | null;
  last_run?: string | null;
  last_summary?: string;
}

export interface Account {
  id: number;
  username: string;
  nickname?: string;
  avatar_url?: string;
  group?: string;
  group_name?: string;
  phone?: string;
  employee?: string;
  note?: string;
  is_active: boolean;
  followers: number;
  follower_count?: number;
  videos: number;
  synced_videos?: number;
  tiktok_video_count?: number;
  total_plays: number;
  engagement_rate: number;
  last_sync: string | null;
  growth?: AccountGrowth;
  today_post_count?: number;
  today_new_plays?: number;
  posted_today?: boolean;
  today_latest_video?: Video | null;
  today_videos?: Video[];
}

export interface AccountGrowth {
  follower_delta: number;
  likes_delta: number;
  plays_delta: number;
  plays_increase?: number;
  today_plays_increase?: number;
  hours: number;
  baseline_hours?: number;
  has_history?: boolean;
}

export interface VideoHistory {
  id: number;
  play_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  recorded_at: string;
}

export interface Video {
  id: number;
  account_id: number;
  video_id: string;
  title: string;
  cover_url?: string;
  play_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  published_at: string | null;
  last_sync_at?: string | null;
  account?: Pick<Account, "id" | "username" | "nickname">;
  history?: VideoHistory[];
  history_meta?: PageMeta;
}

export interface Alert {
  id: number;
  level: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  account_id: number | null;
  video_id: number | null;
  created_at: string;
}

export interface SyncLog {
  id: number;
  account_id: number | null;
  username: string | null;
  status: string;
  message: string;
  videos_updated: number;
  duration_seconds: number;
  provider_used?: string;
  retry_count?: number;
  created_at: string;
}

export interface AccountDetail extends Account {
  video_items: Video[];
  logs: SyncLog[];
  videos_meta?: PageMeta;
  logs_meta?: PageMeta;
  growth?: AccountGrowth;
  trend?: {
    labels: string[];
    followers: number[];
    plays: number[];
  };
}

export interface PageMeta {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
  filters?: AccountFilters;
  filter_totals?: DashboardTotals;
  sort_options?: Record<string, string>;
  options?: DashboardOptions;
}

export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}

export interface Settings {
  monitor?: Record<string, unknown>;
  sync?: Record<string, unknown>;
  tiktok?: Record<string, unknown>;
  alerts?: Record<string, unknown>;
  intelligence?: Record<string, unknown>;
  notifications?: Record<string, unknown>;
}

export interface ProviderHealth {
  provider: string;
  success_count?: number;
  failure_count?: number;
  success_rate?: number;
  consecutive_failures?: number;
  avg_latency_ms?: number;
  available?: boolean;
  last_success?: string | null;
  last_failure?: string | null;
  last_success_at?: string | null;
  last_failure_at?: string | null;
}

export interface DashboardToday {
  total_videos: number;
  total_plays: number;
  posted_accounts: number;
  not_posted_accounts: number;
  date_label: string;
  tz_label: string;
  plays_increase?: number;
}

export interface DashboardTotals {
  account_count: number;
  total_plays: number;
  plays_24h: number;
  plays_today: number;
  today_new_plays: number;
  today_videos: number;
  posted_accounts: number;
  not_posted_accounts: number;
}

export interface EmployeeReportRow {
  employee: string;
  account_count: number;
  today_count: number;
  posted_today: number;
  daily_counts: number[];
  daily_plays: number[];
  today_new_plays: number;
  today_plays_gain: number;
  total_period: number;
  total_plays_period: number;
}

export interface EmployeeReport {
  date_labels: string[];
  rows: EmployeeReportRow[];
  days: number;
}

export interface GroupStat {
  group_name: string;
  account_count: number;
  total_plays: number;
  plays_24h: number;
  top_accounts: {
    id: number;
    username: string;
    nickname?: string;
    total_plays: number;
    plays_24h: number;
  }[];
}

export interface DashboardOptions {
  groups: string[];
  phones: string[];
  employees: string[];
  sort_options: Record<string, string>;
}

export interface SyncProgress {
  running?: boolean;
  total?: number;
  completed?: number;
  current_username?: string;
  queue_size?: number;
}

export interface DashboardData {
  today: DashboardToday;
  filter_totals: DashboardTotals;
  employee_report: EmployeeReport;
  group_stats: GroupStat[];
  options: DashboardOptions;
  sync: {
    progress: SyncProgress;
    queue_size: number;
    syncing_ids: number[];
  };
}

export interface InsightSummary {
  ranked_accounts: number;
  anomalies: number;
  gainers: number;
  unread_alerts: number;
  days: number;
}

export interface InsightTrend {
  labels: string[];
  plays: number[];
  followers: number[];
}

export interface InsightAccountRef {
  id: number;
  username: string;
  nickname?: string;
  avatar_url?: string;
  group?: string;
  employee?: string;
}

export interface InsightRanking {
  account: InsightAccountRef;
  health: {
    score: number;
    grade: string;
    color?: string;
    sync_rate?: number;
    freshness?: number;
    growth_score?: number;
    engagement?: number;
  };
  total_plays: number;
  follower_delta_24h: number;
  plays_delta_24h: number;
  engagement: number;
}

export interface InsightAnomaly {
  account: InsightAccountRef;
  type: string;
  level: string;
  title: string;
  message: string;
  z_score?: number;
}

export interface InsightGainer {
  video: Video;
  account: InsightAccountRef;
  play_delta: number;
  current_plays: number;
}

export interface InsightsData {
  summary: InsightSummary;
  trend: InsightTrend;
  rankings: InsightRanking[];
  anomalies: InsightAnomaly[];
  gainers: InsightGainer[];
  alerts: Alert[];
}

export interface AccountFilters {
  q?: string;
  group?: string;
  phone?: string;
  employee?: string;
  post_today?: string;
  status?: string;
  sort?: string;
}

export interface AccountUpdate {
  group_name?: string;
  group?: string;
  phone?: string;
  employee?: string;
  note?: string;
  is_active?: boolean;
}

export interface LogFilters {
  q?: string;
  status?: string;
  provider?: string;
  account_id?: number | string;
}

export interface SessionState {
  authenticated: boolean;
  auth_enabled: boolean;
  api_key_enabled: boolean;
}

export interface LoginResult {
  authenticated: boolean;
  session_token?: string;
}

export interface BackupItem {
  name: string;
  size: number;
  created_at: string;
  modified_at: string;
  download_url: string;
}

export interface BackupList {
  items: BackupItem[];
  total: number;
  total_size: number;
}

interface ApiEnvelope<T> {
  ok: boolean;
  data: T;
  error: { code?: string; message?: string } | null;
  meta?: PageMeta;
}

export class ApiError<T = unknown> extends Error {
  code?: string;
  status?: number;
  data?: T;

  constructor(message: string, options: { code?: string; status?: number; data?: T } = {}) {
    super(message);
    this.name = "ApiError";
    this.code = options.code;
    this.status = options.status;
    this.data = options.data;
  }
}

export function createApiClient(baseUrl: string, sessionToken = "") {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const isBrowserDev =
    typeof window !== "undefined" &&
    window.location.hostname === "127.0.0.1" &&
    window.location.port === "1420";
  const requestFetch = isBrowserDev ? window.fetch.bind(window) : tauriFetch;

  async function requestEnvelope<T>(path: string, init: RequestInit = {}): Promise<{ data: T; meta?: PageMeta }> {
    const url = `${normalizedBase}${path}`;
    let response: Response;
    try {
      response = await requestFetch(url, {
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
          ...(init.headers || {})
        },
        ...init
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error || "未知错误");
      throw new Error(`连接失败：${url}。底层错误：${detail}`);
    }

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Keep the HTTP status message when the response body is not JSON.
    }

    if (!response.ok) {
      let message = `${response.status} ${response.statusText}`;
      let code: string | undefined;
      let errorData: unknown;
      if (body && typeof body === "object") {
        const errorBody = body as { message?: string; detail?: string; error?: string | { code?: string; message?: string }; data?: unknown };
        code = typeof errorBody.error === "object" ? errorBody.error?.code : undefined;
        errorData = errorBody.data;
        message =
          errorBody.message ||
          errorBody.detail ||
          (typeof errorBody.error === "string" ? errorBody.error : errorBody.error?.message) ||
          message;
      }
      throw new ApiError(message, { code, status: response.status, data: errorData });
    }

    if (path.startsWith("/api/v2/")) {
      const envelope = body as ApiEnvelope<T>;
      if (!envelope?.ok) {
        throw new ApiError(envelope?.error?.message || "请求失败", {
          code: envelope?.error?.code,
          data: envelope?.data
        });
      }
      return { data: envelope.data, meta: envelope.meta };
    }
    return { data: body as T };
  }

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    return (await requestEnvelope<T>(path, init)).data;
  }

  async function requestText(path: string, init: RequestInit = {}): Promise<string> {
    const url = `${normalizedBase}${path}`;
    let response: Response;
    try {
      response = await requestFetch(url, {
        credentials: "include",
        headers: {
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
          ...(init.headers || {})
        },
        ...init
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error || "未知错误");
      throw new Error(`连接失败：${url}。底层错误：${detail}`);
    }
    if (!response.ok) {
      throw new ApiError(`${response.status} ${response.statusText}`, { status: response.status });
    }
    return response.text();
  }

  async function requestBytes(path: string, init: RequestInit = {}): Promise<ArrayBuffer> {
    const url = `${normalizedBase}${path}`;
    let response: Response;
    try {
      response = await requestFetch(url, {
        credentials: "include",
        headers: {
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
          ...(init.headers || {})
        },
        ...init
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error || "未知错误");
      throw new Error(`连接失败：${url}。底层错误：${detail}`);
    }
    if (!response.ok) {
      throw new ApiError(`${response.status} ${response.statusText}`, { status: response.status });
    }
    return response.arrayBuffer();
  }

  async function requestPage<T>(path: string, init: RequestInit = {}): Promise<Paginated<T>> {
    const response = await requestEnvelope<T[]>(path, init);
    if (!response.meta) {
      throw new Error("分页元数据缺失");
    }
    return { items: response.data, meta: response.meta };
  }

  return {
    session: () => request<SessionState>("/api/v2/auth/session", { method: "GET" }),
    login: (password: string) =>
      request<LoginResult>("/api/v2/auth/login", {
        method: "POST",
        body: JSON.stringify({ password })
      }),
    logout: () => request<{ authenticated: boolean }>("/api/v2/auth/logout", { method: "POST" }),
    health: () => request<Health>("/api/v2/health", { method: "GET" }),
    stats: () => request<Stats>("/api/v2/stats", { method: "GET" }),
    dashboard: () => request<DashboardData>("/api/v2/dashboard", { method: "GET" }),
    insights: (days = 7, limit = 10) =>
      request<InsightsData>(`/api/v2/insights?days=${days}&limit=${limit}`, { method: "GET" }),
    exportAccountsCsv: (filters: AccountFilters = {}) => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      return requestText(`/api/v2/export/accounts.csv?${params.toString()}`, { method: "GET" });
    },
    exportVideosCsv: (accountId?: number) => {
      const suffix = accountId ? `?account_id=${accountId}` : "";
      return requestText(`/api/v2/export/videos.csv${suffix}`, { method: "GET" });
    },
    backups: () => request<BackupList>("/api/v2/backups", { method: "GET" }),
    createBackup: (keepDays = 30) =>
      request<BackupItem>(`/api/v2/backups?keep_days=${keepDays}`, { method: "POST" }),
    downloadBackup: (name: string) =>
      requestBytes(`/api/v2/backups/${encodeURIComponent(name)}`, { method: "GET" }),
    accounts: (page = 1, perPage = 50, filters: AccountFilters = {}) => {
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(perPage)
      });
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      return requestPage<Account>(`/api/v2/accounts?${params.toString()}`, { method: "GET" });
    },
    account: (accountId: number, videoPage = 1, logPage = 1) =>
      request<AccountDetail>(`/api/v2/accounts/${accountId}?video_page=${videoPage}&log_page=${logPage}`, { method: "GET" }),
    updateAccount: (accountId: number, payload: AccountUpdate) =>
      request<Account>(`/api/v2/accounts/${accountId}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      }),
    deleteAccount: (accountId: number) =>
      request<{ id: number; message: string }>(`/api/v2/accounts/${accountId}`, { method: "DELETE" }),
    bulkUpdateAccounts: (filters: AccountFilters, updates: AccountUpdate) =>
      request<{ updated: number; account_ids: number[] }>("/api/v2/accounts/bulk-tag", {
        method: "POST",
        body: JSON.stringify({ filters, updates })
      }),
    video: (videoId: number, historyPage = 1) =>
      request<Video>(`/api/v2/videos/${videoId}?history_page=${historyPage}`, { method: "GET" }),
    alerts: (page = 1, perPage = 30, unreadOnly = false, level = "") =>
      requestPage<Alert>(
        `/api/v2/alerts?page=${page}&per_page=${perPage}&unread_only=${unreadOnly}&level=${encodeURIComponent(level)}`,
        { method: "GET" }
      ),
    logs: (page = 1, perPage = 30, filters: LogFilters = {}) => {
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(perPage)
      });
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
      });
      return requestPage<SyncLog>(`/api/v2/sync/logs?${params.toString()}`, { method: "GET" });
    },
    providers: () => request<ProviderHealth[]>("/api/v2/providers/health", { method: "GET" }),
    syncAll: () => request<{ status: string; message: string }>("/api/v2/sync/all", { method: "POST" }),
    syncAccount: (accountId: number) =>
      request<{ status: string; message: string }>(`/api/v2/accounts/${accountId}/sync`, {
        method: "POST"
      }),
    markAlertRead: (alertId: number) =>
      request<{ id: number; is_read: boolean }>(`/api/v2/alerts/${alertId}/read`, { method: "POST" }),
    markAllAlertsRead: () =>
      request<{ updated: number }>("/api/v2/alerts/read-all", { method: "POST" }),
    markAlertsRead: (ids: number[]) =>
      request<{ updated: number; alert_ids: number[] }>("/api/v2/alerts/mark-read", {
        method: "POST",
        body: JSON.stringify({ ids })
      }),
    addAccount: (username: string, groupName = "") =>
      request<Account>("/api/v2/accounts", { method: "POST", body: JSON.stringify({ username, group_name: groupName }) })
        .then((account) => ({ status: "success", message: `@${account.username} 已添加`, account }))
        .catch(async (error) => {
          if (error instanceof ApiError && error.code === "account_exists") {
            const existing = error.data as Account | undefined;
            if (existing?.id) {
              return { status: "exists", message: `@${existing.username} 已存在，已打开账号详情`, account: existing };
            }
            const match = error.message.match(/^@?([^@\s]+)\s+is already monitored/i);
            const duplicateUsername = match?.[1] || username;
            const accounts = await requestPage<Account>(
              `/api/v2/accounts?page=1&per_page=200&q=${encodeURIComponent(duplicateUsername)}`,
              { method: "GET" }
            );
            const found = accounts.items.find((account) => account.username.toLowerCase() === duplicateUsername.toLowerCase());
            if (found) {
              return { status: "exists", message: `@${found.username} 已存在，已打开账号详情`, account: found };
            }
          }
          throw error;
        }),
    importAccounts: (payload: {
      raw: string;
      group_name?: string;
      phone?: string;
      employee?: string;
      sync?: boolean;
    }) =>
      request<{ added: number; updated: number; queued: number }>("/api/v2/import/accounts", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    settings: () => request<Settings>("/api/v2/settings", { method: "GET" }),
    updateSettings: (payload: Settings) =>
      request<Settings>("/api/v2/settings", { method: "PATCH", body: JSON.stringify(payload) }).then((settings) => ({ status: "success", settings }))
  };
}
