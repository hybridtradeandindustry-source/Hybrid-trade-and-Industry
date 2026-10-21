import { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth-helpers";
import { jsonError, jsonOk } from "@/lib/api/response";
import {
  createNotificationRecord,
  deleteNotification,
  getNotifications,
  markNotificationRead,
  markNotificationsRead,
} from "@/lib/services";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser("notifications", "read");
  if ("error" in auth) return auth.error;

  const type = request.nextUrl.searchParams.get("type") ?? undefined;
  const unreadOnly = request.nextUrl.searchParams.get("unreadOnly") === "1";

  const result = await getNotifications(auth.user, {
    type,
    unreadOnly,
  });
  return jsonOk(result);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const action = body.action ?? "mark_all_read";

  try {
    if (action === "create") {
      const auth = await requireApiUser("admin", "manage");
      if ("error" in auth) return auth.error;
      const notification = await createNotificationRecord(
        {
          user_id: body.user_id,
          type: body.type,
          title: body.title,
          message: body.message,
          entity_type: body.entity_type,
          entity_id: body.entity_id,
        },
        auth.user
      );
      return jsonOk(notification);
    }

    if (action === "mark_read") {
      const auth = await requireApiUser("notifications", "read");
      if ("error" in auth) return auth.error;
      await markNotificationRead(body.id, auth.user);
      const result = await getNotifications(auth.user);
      return jsonOk(result);
    }

    if (action === "delete") {
      const auth = await requireApiUser("notifications", "read");
      if ("error" in auth) return auth.error;
      await deleteNotification(body.id, auth.user);
      return jsonOk({ deleted: true });
    }

    const auth = await requireApiUser("notifications", "read");
    if ("error" in auth) return auth.error;
    const result = await markNotificationsRead(auth.user);
    return jsonOk(result);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Notification action failed");
  }
}
