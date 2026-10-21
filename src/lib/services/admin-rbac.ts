import { v4 as uuidv4 } from "uuid";
import { APP_CONFIG, requireSupabase } from "@/lib/config";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  PERMISSION_CATALOG,
  parsePermissionKey,
  permissionKey,
  type PermissionDef,
} from "@/lib/admin/permissions-catalog";
import { ROLE_NAMES } from "@/lib/auth/role-permissions";
import type { ApiUser } from "@/lib/api/demo-auth";

export interface AdminPermissionView {
  id?: string;
  resource: string;
  action: string;
  description?: string | null;
}

export interface AdminRoleView {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  is_system: boolean;
  permissions: AdminPermissionView[];
}

export interface AdminUserView {
  id: string;
  email: string;
  full_name: string;
  factory_id: string | null;
  is_active: boolean;
  role_ids: string[];
  roles: Array<{ id: string; slug: string; name: string }>;
  role: string;
  roleName: string;
}

type SupabaseRoleRow = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  is_system?: boolean;
  role_permissions?: Array<{ permissions: AdminPermissionView | null }>;
};

function keysToPermissions(keys: string[]): AdminPermissionView[] {
  if (keys.includes("*:*")) return [{ resource: "*", action: "*" }];
  return keys.map((key) => {
    const { resource, action } = parsePermissionKey(key);
    const def = PERMISSION_CATALOG.find((p) => p.resource === resource && p.action === action);
    return { resource, action, description: def?.description ?? null };
  });
}

function normalizeSupabaseRole(row: SupabaseRoleRow): AdminRoleView {
  const perms =
    row.role_permissions
      ?.map((rp) => rp.permissions)
      .filter((p): p is AdminPermissionView => Boolean(p)) ?? [];
  if (row.slug === "ceo" && perms.length === 0) {
    return { ...row, is_system: row.is_system ?? true, permissions: [{ resource: "*", action: "*" }] };
  }
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    is_system: row.is_system ?? false,
    permissions: perms,
  };
}

export async function getPermissionsCatalog(): Promise<PermissionDef[]> {
  requireSupabase();
  const supabase = await createClient();
  const { data } = await supabase.from("permissions").select("*").order("resource").order("action");

  const dbByKey = new Map(
    (data ?? []).map((p) => [permissionKey(p.resource, p.action), p])
  );

  const merged: PermissionDef[] = PERMISSION_CATALOG.map((cat) => {
    const row = dbByKey.get(permissionKey(cat.resource, cat.action));
    return row
      ? { resource: row.resource, action: row.action, description: row.description ?? cat.description }
      : cat;
  });

  for (const row of data ?? []) {
    const key = permissionKey(row.resource, row.action);
    if (!PERMISSION_CATALOG.some((c) => permissionKey(c.resource, c.action) === key)) {
      merged.push({
        resource: row.resource,
        action: row.action,
        description: row.description ?? "",
      });
    }
  }

  return merged.sort(
    (a, b) => a.resource.localeCompare(b.resource) || a.action.localeCompare(b.action)
  );
}

export async function getAdminRolesList(): Promise<AdminRoleView[]> {
  

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("roles")
    .select("*, role_permissions(permissions(*))")
    .eq("organization_id", APP_CONFIG.orgId)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => normalizeSupabaseRole(row as SupabaseRoleRow));
}

export async function getAdminUsersList(): Promise<AdminUserView[]> {
  const roles = await getAdminRolesList();

  

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*, user_roles(role_id, roles(id, slug, name))")
    .eq("organization_id", APP_CONFIG.orgId)
    .order("full_name");
  if (error) throw new Error(error.message);

  return (data ?? []).map((p) => {
    const userRoles = (p.user_roles ?? []) as Array<{
      role_id: string;
      roles: { id: string; slug: string; name: string } | null;
    }>;
    const assigned = userRoles.map((ur) => ur.roles).filter(Boolean) as Array<{ id: string; slug: string; name: string }>;
    const primary = assigned[0];
    return {
      id: p.id,
      email: p.email,
      full_name: p.full_name,
      factory_id: p.factory_id,
      is_active: p.is_active,
      role_ids: userRoles.map((ur) => ur.role_id),
      roles: assigned,
      role: primary?.slug ?? "floor_employee",
      roleName: primary?.name ?? "User",
    };
  });
}

export async function createAdminUser(
  input: {
    email: string;
    full_name: string;
    password: string;
    factory_id?: string | null;
    role_ids: string[];
    is_active?: boolean;
  },
  actor: ApiUser
) {
  if (!input.email.trim() || !input.full_name.trim() || !input.password) {
    throw new Error("Email, name, and password are required");
  }
  if (!input.role_ids.length) throw new Error("Assign at least one role");

  

  const service = await createServiceClient();
  const { data: authUser, error: authError } = await service.auth.admin.createUser({
    email: input.email.trim(),
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.full_name.trim() },
  });
  if (authError || !authUser.user) throw new Error(authError?.message ?? "Failed to create auth user");

  const userId = authUser.user.id;
  const { error: profileError } = await service.from("profiles").insert({
    id: userId,
    organization_id: actor.organization_id,
    email: input.email.trim(),
    full_name: input.full_name.trim(),
    factory_id: input.factory_id ?? null,
    is_active: input.is_active ?? true,
  });
  if (profileError) {
    await service.auth.admin.deleteUser(userId);
    throw new Error(profileError.message);
  }

  const roleRows = input.role_ids.map((role_id) => ({
    user_id: userId,
    role_id,
    factory_id: input.factory_id ?? null,
  }));
  const { error: rolesError } = await service.from("user_roles").insert(roleRows);
  if (rolesError) throw new Error(rolesError.message);

  return getAdminUsersList().then((users) => users.find((u) => u.id === userId));
}

export async function updateAdminUser(
  id: string,
  input: {
    full_name?: string;
    email?: string;
    factory_id?: string | null;
    is_active?: boolean;
    role_ids?: string[];
    password?: string;
  },
  actor: ApiUser
) {
  

  const service = await createServiceClient();
  const profileUpdate: Record<string, unknown> = {};
  if (input.full_name !== undefined) profileUpdate.full_name = input.full_name.trim();
  if (input.email !== undefined) profileUpdate.email = input.email.trim();
  if (input.factory_id !== undefined) profileUpdate.factory_id = input.factory_id;
  if (input.is_active !== undefined) profileUpdate.is_active = input.is_active;

  if (Object.keys(profileUpdate).length) {
    const { error } = await service.from("profiles").update(profileUpdate).eq("id", id);
    if (error) throw new Error(error.message);
  }

  if (input.password) {
    const { error } = await service.auth.admin.updateUserById(id, { password: input.password });
    if (error) throw new Error(error.message);
  }

  if (input.email) {
    const { error } = await service.auth.admin.updateUserById(id, { email: input.email.trim() });
    if (error) throw new Error(error.message);
  }

  if (input.role_ids) {
    await service.from("user_roles").delete().eq("user_id", id);
    if (input.role_ids.length) {
      const { error } = await service.from("user_roles").insert(
        input.role_ids.map((role_id) => ({
          user_id: id,
          role_id,
          factory_id: input.factory_id ?? null,
        }))
      );
      if (error) throw new Error(error.message);
    }
  }

  return getAdminUsersList().then((users) => users.find((u) => u.id === id));
}

export async function createAdminRole(
  input: { name: string; slug?: string; description?: string; permission_keys: string[] },
  actor: ApiUser
) {
  const slug =
    input.slug?.trim() ||
    input.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");

  

  const supabase = await createServiceClient();
  const { data: role, error } = await supabase
    .from("roles")
    .insert({
      organization_id: actor.organization_id,
      name: input.name.trim(),
      slug,
      description: input.description ?? null,
      is_system: false,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  await setRolePermissionsByKeys(role.id, input.permission_keys, actor);
  return getAdminRolesList().then((roles) => roles.find((r) => r.id === role.id));
}

export async function updateAdminRole(
  id: string,
  input: { name?: string; description?: string; permission_keys?: string[] },
  actor: ApiUser
) {
  

  const supabase = await createServiceClient();
  const { data: existing } = await supabase.from("roles").select("is_system").eq("id", id).single();
  if (existing?.is_system && input.name) {
    throw new Error("System roles cannot be renamed");
  }

  if (input.name || input.description !== undefined) {
    const { error } = await supabase
      .from("roles")
      .update({
        ...(input.name ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
  }

  if (input.permission_keys) {
    await setRolePermissionsByKeys(id, input.permission_keys, actor);
  }

  return getAdminRolesList().then((roles) => roles.find((r) => r.id === id));
}

async function setRolePermissionsByKeys(roleId: string, keys: string[], actor: ApiUser) {
  const supabase = await createServiceClient();
  const catalog = await getPermissionsCatalog();

  await supabase.from("role_permissions").delete().eq("role_id", roleId);

  if (keys.includes("*:*")) {
    const { data: allPerms } = await supabase.from("permissions").select("id");
    if (allPerms?.length) {
      await supabase.from("role_permissions").insert(
        allPerms.map((p) => ({ role_id: roleId, permission_id: p.id }))
      );
    }
    return;
  }

  const permissionIds: string[] = [];
  for (const key of keys) {
    const { resource, action } = parsePermissionKey(key);
    const { data: perm } = await supabase
      .from("permissions")
      .select("id")
      .eq("resource", resource)
      .eq("action", action)
      .maybeSingle();
    if (perm?.id) permissionIds.push(perm.id);
    else {
      const def = catalog.find((p) => p.resource === resource && p.action === action);
      const { data: created } = await supabase
        .from("permissions")
        .insert({ resource, action, description: def?.description ?? null })
        .select("id")
        .single();
      if (created?.id) permissionIds.push(created.id);
    }
  }

  if (permissionIds.length) {
    const { error } = await supabase
      .from("role_permissions")
      .insert(permissionIds.map((permission_id) => ({ role_id: roleId, permission_id })));
    if (error) throw new Error(error.message);
  }

  void actor;
}

export async function deleteAdminRole(id: string, actor: ApiUser) {
  

  const supabase = await createServiceClient();
  const { data: role } = await supabase.from("roles").select("is_system, slug").eq("id", id).single();
  if (!role) throw new Error("Role not found");
  if (role.is_system) throw new Error("System roles cannot be deleted");

  const { count } = await supabase
    .from("user_roles")
    .select("*", { count: "exact", head: true })
    .eq("role_id", id);
  if (count && count > 0) throw new Error("Remove this role from all users before deleting");

  const { error } = await supabase.from("roles").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { deleted: true };
}
