import { APP_CONFIG } from "@/lib/config";
import { ROLE_PERMISSIONS } from "@/lib/auth/role-permissions";
import type { Permission } from "@/types";

export interface DemoAuthUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  roleName?: string;
  factory_id: string | null;
  permissions: Permission[];
}

export interface ApiUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  organization_id: string;
  factory_id: string | null;
  permissions: Permission[];
}

export function buildPermissions(role: string): Permission[] {
  if (role === "ceo") return [{ id: "all", resource: "*", action: "*" }];
  const perms = ROLE_PERMISSIONS[role] ?? [];
  return perms.map((p, i) => ({
    id: `perm-${i}`,
    resource: p.resource,
    action: p.action,
  }));
}

export function authUserToApiUser(user: DemoAuthUser): ApiUser {
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    organization_id: APP_CONFIG.orgId,
    factory_id: user.factory_id,
    permissions: user.permissions,
  };
}

export function parseDemoApiUser(raw: string): ApiUser | null {
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as ApiUser;
    return {
      ...parsed,
      organization_id: parsed.organization_id ?? APP_CONFIG.orgId,
      permissions: parsed.permissions ?? buildPermissions(parsed.role),
    };
  } catch {
    return null;
  }
}

export function syncDemoAuthCookies(user: DemoAuthUser) {
  if (typeof document === "undefined") return;
  const apiUser = authUserToApiUser(user);
  document.cookie = "elecnova-demo-auth=1; path=/; max-age=86400; SameSite=Lax";
  document.cookie = `elecnova-demo-user=${encodeURIComponent(JSON.stringify(apiUser))}; path=/; max-age=86400; SameSite=Lax`;
}

export function clearDemoAuthCookies() {
  if (typeof document === "undefined") return;
  document.cookie = "elecnova-demo-auth=; path=/; max-age=0";
  document.cookie = "elecnova-demo-user=; path=/; max-age=0";
}

export function demoAuthHeaders(user: DemoAuthUser): Record<string, string> {
  const apiUser = authUserToApiUser(user);
  return {
    "X-Demo-Auth": "1",
    "X-Demo-User": encodeURIComponent(JSON.stringify(apiUser)),
  };
}

export function userHasPermission(
  user: ApiUser,
  resource: string,
  action: string
): boolean {
  if (user.role === "ceo") return true;
  return user.permissions.some(
    (p) =>
      (p.resource === resource && p.action === action) ||
      (p.resource === "*" && p.action === "*")
  );
}
