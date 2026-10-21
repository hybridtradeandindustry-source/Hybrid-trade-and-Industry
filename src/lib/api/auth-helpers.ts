import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireSupabase } from "@/lib/config";
import {
  buildPermissions,
  parseDemoApiUser,
  type ApiUser,
  userHasPermission,
} from "@/lib/api/demo-auth";

export type { ApiUser } from "@/lib/api/demo-auth";
export { userHasPermission } from "@/lib/api/demo-auth";

async function getDemoApiUser(): Promise<ApiUser | null> {
  const cookieStore = await cookies();
  const demoAuth = cookieStore.get("elecnova-demo-auth")?.value;
  const demoUser = cookieStore.get("elecnova-demo-user")?.value;
  if (demoAuth === "1" && demoUser) {
    const parsed = parseDemoApiUser(demoUser);
    if (parsed) return parsed;
  }

  const headerStore = await headers();
  const headerAuth = headerStore.get("x-demo-auth");
  const headerUser = headerStore.get("x-demo-user");
  if (headerAuth === "1" && headerUser) {
    const parsed = parseDemoApiUser(headerUser);
    if (parsed) return parsed;
  }

  const demoRole = headerStore.get("x-demo-role");
  const demoUserId = headerStore.get("x-demo-user-id");
  if (demoRole && demoUserId) {
    return {
      id: demoUserId,
      email: headerStore.get("x-demo-email") ?? "",
      full_name: headerStore.get("x-demo-name") ?? demoRole,
      role: demoRole,
      organization_id: "11111111-1111-1111-1111-111111111111",
      factory_id: headerStore.get("x-demo-factory-id") || null,
      permissions: buildPermissions(demoRole),
    };
  }

  return null;
}

async function getSupabaseApiUser(): Promise<ApiUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*, user_roles(role_id, roles(slug))")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  const roleSlug =
    (profile.user_roles as { roles: { slug: string } }[] | undefined)?.[0]
      ?.roles?.slug ?? "floor_employee";

  const { data: rolePerms } = await supabase
    .from("user_roles")
    .select("roles(role_permissions(permissions(*)))")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  let permissions = buildPermissions(roleSlug);
  const rolesData = rolePerms?.roles as unknown as {
    role_permissions?: { permissions: import("@/types").Permission }[];
  } | undefined;
  const dbPerms = rolesData?.role_permissions?.map((rp) => rp.permissions);
  if (dbPerms?.length) permissions = dbPerms;

  return {
    id: user.id,
    email: profile.email,
    full_name: profile.full_name,
    role: roleSlug,
    organization_id: profile.organization_id,
    factory_id: profile.factory_id,
    permissions,
  };
}

export async function getApiUser(): Promise<ApiUser | null> {
  requireSupabase();
  return getSupabaseApiUser();
}

export async function requireApiUser(
  resource?: string,
  action?: string
): Promise<{ user: ApiUser } | { error: Response }> {
  const user = await getApiUser();
  if (!user) {
    const { jsonUnauthorized } = await import("./response");
    return { error: jsonUnauthorized() };
  }
  if (resource && action && !userHasPermission(user, resource, action)) {
    const { jsonForbidden } = await import("./response");
    return { error: jsonForbidden() };
  }
  return { user };
}

function hasAnyPermission(user: ApiUser, checks: Array<[string, string]>): boolean {
  return checks.some(([resource, action]) => userHasPermission(user, resource, action));
}

/** Catalog structure edits — admin.manage or inventory.configure */
export async function requireCatalogManage(): Promise<{ user: ApiUser } | { error: Response }> {
  const user = await getApiUser();
  if (!user) {
    const { jsonUnauthorized } = await import("./response");
    return { error: jsonUnauthorized() };
  }
  if (!hasAnyPermission(user, [["admin", "manage"], ["inventory", "configure"]])) {
    const { jsonForbidden } = await import("./response");
    return { error: jsonForbidden() };
  }
  return { user };
}

/** Catalog change approvals — admin.manage or inventory.approve_catalog */
export async function requireCatalogApproval(): Promise<{ user: ApiUser } | { error: Response }> {
  const user = await getApiUser();
  if (!user) {
    const { jsonUnauthorized } = await import("./response");
    return { error: jsonUnauthorized() };
  }
  if (!hasAnyPermission(user, [["admin", "manage"], ["inventory", "approve_catalog"]])) {
    const { jsonForbidden } = await import("./response");
    return { error: jsonForbidden() };
  }
  return { user };
}

/** Finance configuration edits (e.g. withholding tax rate) — admin.manage or finance.verify */
export async function requireFinanceManage(): Promise<{ user: ApiUser } | { error: Response }> {
  const user = await getApiUser();
  if (!user) {
    const { jsonUnauthorized } = await import("./response");
    return { error: jsonUnauthorized() };
  }
  if (!hasAnyPermission(user, [["admin", "manage"], ["finance", "verify"]])) {
    const { jsonForbidden } = await import("./response");
    return { error: jsonForbidden() };
  }
  return { user };
}

export function verifySageSyncAuth(request: Request): boolean {
  const apiKey = request.headers.get("X-Sage-Sync-Key");
  const secret = request.headers.get("X-Sage-Sync-Secret");
  const expectedKey = process.env.SAGE50_SYNC_API_KEY;
  const expectedSecret = process.env.SAGE50_SYNC_SECRET;
  if (!expectedKey || !expectedSecret) return false;
  return apiKey === expectedKey && secret === expectedSecret;
}
