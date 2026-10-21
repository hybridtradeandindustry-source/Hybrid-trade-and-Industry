import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPermissions } from "@/lib/api/demo-auth";
import type { AuthUser } from "@/providers/auth-provider";
import { ROLE_NAMES } from "@/lib/auth/role-permissions";
import type { Permission } from "@/types";

type ProfileRow = {
  id: string;
  organization_id: string;
  email: string;
  full_name: string;
  factory_id: string | null;
  user_roles?: Array<{
    role_id: string;
    roles: { slug: string; name: string } | null;
  }>;
};

async function loadPermissions(
  supabase: SupabaseClient,
  userId: string,
  roleSlug: string
): Promise<Permission[]> {
  const { data: rows } = await supabase
    .from("user_roles")
    .select("roles(slug, role_permissions(permissions(*)))")
    .eq("user_id", userId);

  const merged = new Map<string, Permission>();
  for (const row of rows ?? []) {
    const rolesData = row.roles as unknown as {
      slug?: string;
      role_permissions?: { permissions: Permission | null }[];
    } | null;
    const perms = rolesData?.role_permissions?.map((rp) => rp.permissions).filter(Boolean) as Permission[] | undefined;
    if (perms?.length) {
      for (const p of perms) {
        if (p.resource === "*" && p.action === "*") {
          return [{ id: "all", resource: "*", action: "*" }];
        }
        merged.set(`${p.resource}:${p.action}`, p);
      }
    }
  }

  if (merged.size) return Array.from(merged.values());
  return buildPermissions(roleSlug);
}

export async function loadAuthUserFromSupabase(
  supabase: SupabaseClient
): Promise<AuthUser | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*, user_roles(role_id, roles(slug, name))")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile) return null;

  const row = profile as ProfileRow;
  const roleSlug = row.user_roles?.[0]?.roles?.slug ?? "floor_employee";
  const permissions = await loadPermissions(supabase, user.id, roleSlug);

  return {
    id: user.id,
    email: row.email ?? user.email ?? "",
    full_name: row.full_name,
    role: roleSlug,
    roleName: row.user_roles?.[0]?.roles?.name ?? ROLE_NAMES[roleSlug] ?? roleSlug,
    factory_id: row.factory_id,
    organization_id: row.organization_id,
    permissions,
  };
}

export async function signInWithSupabase(
  supabase: SupabaseClient,
  email: string,
  password: string
): Promise<{ user?: AuthUser; error?: string }> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  const authUser = await loadAuthUserFromSupabase(supabase);
  if (!authUser) {
    await supabase.auth.signOut();
    return {
      error:
        "Signed in to Supabase, but no profile/role is linked. Run the admin bootstrap SQL in Supabase (see supabase/seed-admin.sql).",
    };
  }

  return { user: authUser };
}

export async function signOutFromSupabase(supabase: SupabaseClient) {
  await supabase.auth.signOut();
}
