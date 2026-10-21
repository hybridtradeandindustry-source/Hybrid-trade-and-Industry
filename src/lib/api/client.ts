"use client";

import type { AuthUser } from "@/providers/auth-provider";

type FetchOptions = RequestInit & { params?: Record<string, string | undefined> };

async function parseResponse<T>(res: Response): Promise<T> {
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error ?? "Request failed");
  }
  return json.data as T;
}

export async function apiFetch<T>(
  path: string,
  options: FetchOptions = {}
): Promise<T> {
  const { params, headers, ...rest } = options;
  const url = new URL(path, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) url.searchParams.set(k, v);
    });
  }

  const res = await fetch(url.toString(), {
    ...rest,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });

  return parseResponse<T>(res);
}

export const api = {
  get: <T>(path: string, params?: Record<string, string | undefined>, _user?: AuthUser | null) =>
    apiFetch<T>(path, { method: "GET", params }),
  post: <T>(path: string, body?: unknown, _user?: AuthUser | null) =>
    apiFetch<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown, _user?: AuthUser | null) =>
    apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  delete: <T>(path: string, _user?: AuthUser | null) =>
    apiFetch<T>(path, { method: "DELETE" }),
};
