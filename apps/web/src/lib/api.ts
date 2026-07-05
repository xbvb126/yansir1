const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
const ACTIVE_USER_STORAGE_KEY = "radar.activeUserId";
const AUTH_TOKEN_STORAGE_KEY = "radar.authToken";

export function getActiveUserId() {
  return window.localStorage.getItem(ACTIVE_USER_STORAGE_KEY) || "";
}

export function setActiveUserId(userId: string) {
  if (userId) {
    window.localStorage.setItem(ACTIVE_USER_STORAGE_KEY, userId);
  } else {
    window.localStorage.removeItem(ACTIVE_USER_STORAGE_KEY);
  }
}

export function getAuthToken() {
  return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || "";
}

export function setAuthToken(token: string) {
  if (token) {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  } else {
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(apiUrl(path), {
    headers: apiHeaders()
  });
  if (!response.ok) {
    throw new Error(`GET ${path} failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method: "POST",
    headers: apiHeaders({ "content-type": "application/json" }),
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`POST ${path} failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method: "PATCH",
    headers: apiHeaders({ "content-type": "application/json" }),
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`PATCH ${path} failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method: "PUT",
    headers: apiHeaders({ "content-type": "application/json" }),
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`PUT ${path} failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

function apiHeaders(baseHeaders: Record<string, string> = {}) {
  const authToken = getAuthToken();
  if (authToken) {
    return {
      ...baseHeaders,
      authorization: `Bearer ${authToken}`
    };
  }

  const activeUserId = getActiveUserId();
  return activeUserId
    ? {
        ...baseHeaders,
        "x-radar-user-id": activeUserId
      }
    : baseHeaders;
}
