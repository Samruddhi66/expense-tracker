let accessToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;

// When the app is installed (Android APK) there is no same-origin server, so the
// API host is configurable: build-time VITE_API_BASE_URL or a runtime override.
const envBase = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_API_BASE_URL ?? '')
  .trim()
  .replace(/\/+$/, '');
const API_BASE_KEY = 'et:apiBase';

export function getApiBase(): string {
  try {
    const stored = localStorage.getItem(API_BASE_KEY)?.trim().replace(/\/+$/, '');
    if (stored) return stored;
  } catch {
    /* storage unavailable */
  }
  return envBase;
}

export function setApiBase(base: string) {
  try {
    const clean = base.trim().replace(/\/+$/, '');
    if (clean) localStorage.setItem(API_BASE_KEY, clean);
    else localStorage.removeItem(API_BASE_KEY);
  } catch {
    /* storage unavailable */
  }
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: Record<string, string>;

  constructor(status: number, message: string, code = 'error', details?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

type Options = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  raw?: boolean;
};

async function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${getApiBase()}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
      .then(async (res) => {
        if (!res.ok) return false;
        const data = (await res.json()) as { accessToken: string };
        accessToken = data.accessToken;
        window.dispatchEvent(new CustomEvent('auth:refreshed', { detail: data }));
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function api<T = unknown>(path: string, options: Options = {}): Promise<T> {
  const doFetch = async () => {
    const headers: Record<string, string> = {};
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return fetch(`${getApiBase()}/api${path}`, {
      method: options.method ?? 'GET',
      headers,
      credentials: 'include',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  };

  let response = await doFetch();

  if (response.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/refresh')) {
    const refreshed = await refreshSession();
    if (refreshed) response = await doFetch();
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type') ?? '';
  if (!response.ok) {
    if (contentType.includes('application/json')) {
      const data = (await response.json()) as {
        error?: { message?: string; code?: string; details?: Record<string, string> };
      };
      throw new ApiError(
        response.status,
        data.error?.message ?? 'Something went wrong',
        data.error?.code ?? 'error',
        data.error?.details
      );
    }
    throw new ApiError(response.status, `Request failed (${response.status})`);
  }

  if (options.raw) return (await response.blob()) as T;
  if (contentType.includes('application/json')) return (await response.json()) as T;
  return (await response.text()) as T;
}

export async function downloadFile(path: string, filename: string) {
  const blob = await api<Blob>(path, { raw: true });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export { refreshSession };
