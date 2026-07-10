export type ApiClient = ReturnType<typeof createApiClient>;

export interface Health {
  ok: boolean;
  version: string;
  scheduler: unknown;
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
  scheduler: unknown;
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
  total_plays: number;
  engagement_rate: number;
  last_sync: string | null;
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
  created_at: string;
}

export interface ProviderHealth {
  provider: string;
  success_count?: number;
  failure_count?: number;
  consecutive_failures?: number;
  avg_latency_ms?: number;
  last_success_at?: string | null;
  last_failure_at?: string | null;
}

export interface SessionState {
  authenticated: boolean;
  auth_enabled: boolean;
  api_key_enabled: boolean;
}

export function createApiClient(baseUrl: string) {
  const normalizedBase = baseUrl.replace(/\/+$/, "");

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${normalizedBase}${path}`, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(init.headers || {})
      },
      ...init
    });

    if (!response.ok) {
      let message = `${response.status} ${response.statusText}`;
      try {
        const body = await response.json();
        message = body.message || body.detail || body.error || message;
      } catch {
        // Keep the HTTP status message.
      }
      throw new Error(message);
    }

    return response.json() as Promise<T>;
  }

  return {
    session: () => request<SessionState>("/api/auth/session", { method: "GET" }),
    login: (password: string) =>
      request<{ authenticated: boolean }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ password })
      }),
    logout: () => request<{ authenticated: boolean }>("/api/auth/logout", { method: "POST" }),
    health: () => request<Health>("/api/health", { method: "GET" }),
    stats: () => request<Stats>("/api/stats", { method: "GET" }),
    accounts: () => request<Account[]>("/api/accounts", { method: "GET" }),
    alerts: () => request<Alert[]>("/api/alerts?limit=30", { method: "GET" }),
    logs: () => request<SyncLog[]>("/api/sync/logs?limit=30", { method: "GET" }),
    providers: () => request<ProviderHealth[]>("/api/providers/health", { method: "GET" }),
    syncAll: () => request<{ status: string; message: string }>("/api/sync/all", { method: "POST" }),
    syncAccount: (accountId: number) =>
      request<{ status: string; message: string }>(`/api/accounts/${accountId}/sync`, {
        method: "POST"
      }),
    markAlertRead: (alertId: number) =>
      request<{ status: string }>(`/api/alerts/${alertId}/read`, { method: "POST" }),
    markAllAlertsRead: () =>
      request<{ status: string; updated: number }>("/api/alerts/read-all", { method: "POST" }),
    addAccount: (username: string, groupName = "") =>
      request<{ status: string; message: string; account: Account }>("/api/accounts", {
        method: "POST",
        body: JSON.stringify({ username, group_name: groupName })
      })
  };
}
