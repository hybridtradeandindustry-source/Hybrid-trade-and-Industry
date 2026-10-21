"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, CheckCheck, ExternalLink, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntityFormDialog } from "@/components/crud/entity-form-dialog";
import { RowActions } from "@/components/crud/row-actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAdmin, useNotifications } from "@/hooks/use-api";
import { useAuth } from "@/providers/auth-provider";
import { getNotificationHref } from "@/lib/notifications/notification-links";
import { cn, formatDateTime } from "@/lib/utils";
import type { Notification, NotificationType } from "@/types";

const NOTIFICATION_TYPES: NotificationType[] = [
  "task",
  "approval",
  "ai_alert",
  "system",
  "missing_data",
];

const TYPE_VARIANTS: Record<
  NotificationType,
  "default" | "secondary" | "destructive" | "outline" | "warning"
> = {
  task: "default",
  approval: "secondary",
  ai_alert: "destructive",
  system: "outline",
  missing_data: "warning",
};

type NotifyForm = {
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
};

type AdminUser = {
  id: string;
  full_name: string;
  roleName: string;
};

export default function NotificationsPage() {
  const router = useRouter();
  const { user, hasPermission } = useAuth();
  const canManage = hasPermission("admin", "manage");

  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);

  const { notifications, unreadCount, isLoading, markReadMutation } = useNotifications({
    type: typeFilter,
    unreadOnly,
  });
  const { usersQuery } = useAdmin();
  const users = (usersQuery.data ?? []) as AdminUser[];

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<Notification | null>(null);
  const [form, setForm] = useState<NotifyForm>({
    user_id: "",
    type: "system",
    title: "",
    message: "",
  });

  const filteredCount = notifications.length;
  const totalUnread = unreadCount;

  const typeCounts = useMemo(() => {
    const counts: Partial<Record<NotificationType, number>> = {};
    for (const n of notifications) {
      counts[n.type] = (counts[n.type] ?? 0) + 1;
    }
    return counts;
  }, [notifications]);

  const openNotification = (notif: Notification) => {
    if (!notif.is_read) {
      markReadMutation.mutate({ action: "mark_read", id: notif.id });
    }
    const href = getNotificationHref(notif);
    if (href && href !== "/dashboard/notifications") {
      router.push(href);
    }
  };

  const handleMarkRead = (notif: Notification) => {
    if (notif.is_read) return;
    markReadMutation.mutate(
      { action: "mark_read", id: notif.id },
      {
        onSuccess: () => toast.success("Marked as read"),
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Failed to mark as read"),
      }
    );
  };

  const handleMarkAllRead = () => {
    markReadMutation.mutate(
      { action: "mark_all_read" },
      {
        onSuccess: () => toast.success("All notifications marked as read"),
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Failed to mark as read"),
      }
    );
  };

  const handleCreate = () => {
    if (!form.user_id || !form.title.trim() || !form.message.trim()) {
      toast.error("Recipient, title, and message are required");
      return;
    }

    markReadMutation.mutate(
      {
        action: "create",
        user_id: form.user_id,
        type: form.type,
        title: form.title.trim(),
        message: form.message.trim(),
      },
      {
        onSuccess: () => {
          toast.success("Notification sent");
          setCreateOpen(false);
          setForm({ user_id: "", type: "system", title: "", message: "" });
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Failed to send notification"),
      }
    );
  };

  const handleDelete = () => {
    if (!deleting) return;
    markReadMutation.mutate(
      { action: "delete", id: deleting.id },
      {
        onSuccess: () => {
          toast.success("Notification deleted");
          setDeleteOpen(false);
          setDeleting(null);
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Delete failed"),
      }
    );
  };

  const openCreate = () => {
    setForm({
      user_id: users[0]?.id ?? user?.id ?? "",
      type: "system",
      title: "",
      message: "",
    });
    setCreateOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Notifications"
        description="System alerts, approvals, AI insights, and operational notifications across your organization."
        actions={
          <div className="flex flex-wrap gap-2">
            {totalUnread > 0 && (
              <Button
                variant="outline"
                onClick={handleMarkAllRead}
                disabled={markReadMutation.isPending}
                className="gap-2"
              >
                <CheckCheck className="size-4" />
                Mark All Read
                <Badge variant="secondary" className="ml-1">
                  {totalUnread}
                </Badge>
              </Button>
            )}
            {canManage && (
              <Button onClick={openCreate} className="gap-2">
                <Plus className="size-4" />
                Send Notification
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor="type-filter" className="text-sm text-muted-foreground">
            Type
          </Label>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger id="type-filter" className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {NOTIFICATION_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {type.replace(/_/g, " ")}
                  {typeCounts[type] ? ` (${typeCounts[type]})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="unread-only"
            checked={unreadOnly}
            onCheckedChange={setUnreadOnly}
          />
          <Label htmlFor="unread-only" className="text-sm">
            Unread only
            {totalUnread > 0 ? ` (${totalUnread})` : ""}
          </Label>
        </div>
      </div>

      <Card className="border-border/60 bg-card/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="size-5" />
            {unreadOnly ? "Unread Notifications" : "All Notifications"}
          </CardTitle>
          <CardDescription>
            {filteredCount} shown · {totalUnread} unread total
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            data={notifications}
            getRowKey={(row) => row.id}
            emptyMessage={
              unreadOnly
                ? "No unread notifications — you're all caught up."
                : "No notifications yet."
            }
            onRowClick={openNotification}
            columns={[
              {
                id: "status",
                header: "",
                headerClassName: "w-8",
                cell: (row) => (
                  <div
                    className={cn(
                      "size-2 rounded-full",
                      row.is_read ? "bg-muted-foreground/30" : "bg-primary"
                    )}
                  />
                ),
              },
              {
                id: "title",
                header: "Title",
                cell: (row) => (
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p
                        className={cn(
                          "font-medium",
                          !row.is_read && "text-foreground"
                        )}
                      >
                        {row.title}
                      </p>
                      {!row.is_read ? (
                        <Badge variant="info" className="text-[10px]">
                          New
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {row.message}
                    </p>
                  </div>
                ),
              },
              {
                id: "type",
                header: "Type",
                cell: (row) => (
                  <Badge variant={TYPE_VARIANTS[row.type] ?? "outline"}>
                    {row.type.replace(/_/g, " ")}
                  </Badge>
                ),
              },
              {
                id: "created",
                header: "Created",
                cell: (row) => (
                  <span className="text-sm text-muted-foreground">
                    {formatDateTime(row.created_at)}
                  </span>
                ),
              },
              {
                id: "actions",
                header: "",
                headerClassName: "w-24",
                cell: (row) => (
                  <div
                    className="flex items-center justify-end gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {!row.is_read ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        title="Mark as read"
                        onClick={() => handleMarkRead(row)}
                      >
                        <Check className="size-4" />
                      </Button>
                    ) : null}
                    {getNotificationHref(row) &&
                    getNotificationHref(row) !== "/dashboard/notifications" ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        title="Open related page"
                        onClick={() => openNotification(row)}
                      >
                        <ExternalLink className="size-4" />
                      </Button>
                    ) : null}
                    <RowActions
                      onDelete={() => {
                        setDeleting(row);
                        setDeleteOpen(true);
                      }}
                    />
                  </div>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>

      <EntityFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Send Notification"
        description="Create and deliver a notification to a user."
        submitLabel="Send"
        isSubmitting={markReadMutation.isPending}
        onSubmit={handleCreate}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="notif-user">Recipient</Label>
            <Select
              value={form.user_id}
              onValueChange={(value) =>
                setForm((prev) => ({ ...prev, user_id: value }))
              }
            >
              <SelectTrigger id="notif-user">
                <SelectValue placeholder="Select user" />
              </SelectTrigger>
              <SelectContent>
                {users.length > 0 ? (
                  users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name} ({u.roleName})
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value={user?.id ?? "demo-user"}>
                    {user?.full_name ?? "Current User"}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notif-type">Type</Label>
            <Select
              value={form.type}
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  type: value as NotificationType,
                }))
              }
            >
              <SelectTrigger id="notif-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOTIFICATION_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notif-title">Title</Label>
            <Input
              id="notif-title"
              placeholder="Notification title"
              value={form.title}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, title: e.target.value }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notif-message">Message</Label>
            <Textarea
              id="notif-message"
              placeholder="Notification message"
              rows={3}
              value={form.message}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, message: e.target.value }))
              }
            />
          </div>
        </div>
      </EntityFormDialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Notification"
        description={`Delete "${deleting?.title}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={markReadMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}
