import { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth-helpers";
import { jsonError, jsonOk } from "@/lib/api/response";
import {
  createAdminRole,
  createAdminUser,
  deleteAdminRole,
  getAdminRolesList,
  getAdminUsersList,
  getPermissionsCatalog,
  updateAdminRole,
  updateAdminUser,
} from "@/lib/services/admin-rbac";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser("admin", "manage");
  if ("error" in auth) return auth.error;

  const type = request.nextUrl.searchParams.get("type") ?? "roles";

  try {
    if (type === "users") return jsonOk(await getAdminUsersList());
    if (type === "permissions") return jsonOk(await getPermissionsCatalog());
    return jsonOk(await getAdminRolesList());
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Failed to load admin data");
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser("admin", "manage");
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const action = body.action as string;

    if (action === "create_user") {
      return jsonOk(await createAdminUser(body, auth.user));
    }
    if (action === "update_user") {
      const { id, ...data } = body;
      return jsonOk(await updateAdminUser(id, data, auth.user));
    }
    if (action === "create_role") {
      return jsonOk(await createAdminRole(body, auth.user));
    }
    if (action === "update_role") {
      const { id, ...data } = body;
      return jsonOk(await updateAdminRole(id, data, auth.user));
    }
    if (action === "delete_role") {
      return jsonOk(await deleteAdminRole(body.id, auth.user));
    }

    return jsonError(`Unknown action: ${action}`);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Admin action failed");
  }
}
