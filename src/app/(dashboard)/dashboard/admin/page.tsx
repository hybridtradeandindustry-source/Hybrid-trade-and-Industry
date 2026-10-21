"use client";

import { useState } from "react";
import { Bell, Database, Package, Shield } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntityFormDialog } from "@/components/crud/entity-form-dialog";
import { InventorySettingsPanel } from "@/components/admin/inventory-settings";
import { WithholdingTaxSettingsPanel } from "@/components/admin/withholding-tax-settings-panel";
import { VatSettingsPanel } from "@/components/admin/vat-settings-panel";
import { RbacManagement } from "@/components/admin/rbac-management";
import { useAdmin, useNotifications } from "@/hooks/use-api";
import { useAuth } from "@/providers/auth-provider";
import type { NotificationType } from "@/types";
import type { AdminUserView } from "@/lib/services/admin-rbac";

const NOTIFICATION_TYPES: NotificationType[] = [
  "task",
  "approval",
  "ai_alert",
  "system",
  "missing_data",
];

type NotifyForm = {
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
};

export default function AdminPage() {
  const { hasPermission } = useAuth();
  const canManageAdmin = hasPermission("admin", "manage");
  const canManageCatalog =
    canManageAdmin || hasPermission("inventory", "configure");
  const defaultTab = canManageAdmin ? "access" : "inventory-setup";

  const { usersQuery } = useAdmin();
  const { markReadMutation: notificationMutation } = useNotifications();
  const users = (usersQuery.data ?? []) as AdminUserView[];

  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyUser, setNotifyUser] = useState<AdminUserView | null>(null);
  const [notifyForm, setNotifyForm] = useState<NotifyForm>({
    user_id: "",
    type: "system",
    title: "",
    message: "",
  });

  const openNotifyGeneral = () => {
    setNotifyUser(null);
    setNotifyForm({
      user_id: users[0]?.id ?? "",
      type: "system",
      title: "",
      message: "",
    });
    setNotifyOpen(true);
  };

  const handleSendNotification = () => {
    if (!notifyForm.user_id || !notifyForm.title.trim() || !notifyForm.message.trim()) {
      toast.error("Recipient, title, and message are required");
      return;
    }
    notificationMutation.mutate(
      {
        action: "create",
        user_id: notifyForm.user_id,
        type: notifyForm.type,
        title: notifyForm.title.trim(),
        message: notifyForm.message.trim(),
      },
      {
        onSuccess: () => {
          toast.success("Notification sent");
          setNotifyOpen(false);
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Failed to send notification"),
      }
    );
  };

  if (!canManageAdmin && !canManageCatalog) {
    return (
      <div className="space-y-8">
        <PageHeader
          title="Administration"
          description="Role-based access control and user management."
        />
        <Card className="border-border/60 bg-card/50">
          <CardContent className="py-12 text-center text-muted-foreground">
            You need admin or inventory catalog permissions to access this area.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (canManageAdmin && usersQuery.isLoading) {
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
        title="Administration"
        description="Manage users, roles, permissions, and catalog configuration."
        actions={
          canManageAdmin ? (
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="gap-1">
                <Shield className="size-3.5" />
                RBAC Active
              </Badge>
              <Button onClick={openNotifyGeneral} className="gap-2">
                <Bell className="size-4" />
                Send Notification
              </Button>
            </div>
          ) : undefined
        }
      />

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          {canManageAdmin ? (
            <TabsTrigger value="access" className="gap-1.5">
              <Shield className="size-3.5" />
              Users & Roles
            </TabsTrigger>
          ) : null}
        {canManageCatalog ? (
          <TabsTrigger value="inventory-setup" className="gap-1.5">
            <Package className="size-3.5" />
            Inventory Catalog
          </TabsTrigger>
        ) : null}
          {canManageAdmin ? (
            <TabsTrigger value="system" className="gap-1.5">
              <Database className="size-3.5" />
              System
            </TabsTrigger>
          ) : null}
        </TabsList>

        {canManageAdmin ? (
          <TabsContent value="access" className="mt-6">
            <RbacManagement />
          </TabsContent>
        ) : null}

        {canManageCatalog ? (
          <TabsContent value="inventory-setup" className="mt-6">
            <InventorySettingsPanel embedded />
          </TabsContent>
        ) : null}

        {canManageAdmin ? (
          <TabsContent value="system" className="mt-6 space-y-6">
            <VatSettingsPanel />
            <WithholdingTaxSettingsPanel />
            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground">
                Data is stored in Supabase. Reset and re-seed with yield-based opening stock using{" "}
                <code className="text-xs">npx supabase db reset</code>, then link admin users via{" "}
                <code className="text-xs">supabase/seed-admin.sql</code>.
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}
      </Tabs>

      {canManageAdmin ? (
      <EntityFormDialog
        open={notifyOpen}
        onOpenChange={setNotifyOpen}
        title="Send Notification"
        description="Send a notification to a system user"
        submitLabel="Send"
        isSubmitting={notificationMutation.isPending}
        onSubmit={handleSendNotification}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="notify-user">Recipient</Label>
            <Select
              value={notifyForm.user_id}
              onValueChange={(value) => setNotifyForm((prev) => ({ ...prev, user_id: value }))}
            >
              <SelectTrigger id="notify-user">
                <SelectValue placeholder="Select user" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name} ({u.roleName})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notify-type">Type</Label>
            <Select
              value={notifyForm.type}
              onValueChange={(value) =>
                setNotifyForm((prev) => ({ ...prev, type: value as NotificationType }))
              }
            >
              <SelectTrigger id="notify-type">
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
            <Label htmlFor="notify-title">Title</Label>
            <Input
              id="notify-title"
              value={notifyForm.title}
              onChange={(e) => setNotifyForm((prev) => ({ ...prev, title: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notify-message">Message</Label>
            <Textarea
              id="notify-message"
              rows={3}
              value={notifyForm.message}
              onChange={(e) => setNotifyForm((prev) => ({ ...prev, message: e.target.value }))}
            />
          </div>
        </div>
      </EntityFormDialog>
      ) : null}
    </div>
  );
}
