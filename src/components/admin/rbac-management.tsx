"use client";

import { useMemo, useState } from "react";
import { Plus, Shield, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { EntityFormDialog } from "@/components/crud/entity-form-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { RowActions } from "@/components/crud/row-actions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdmin } from "@/hooks/use-api";
import { cn } from "@/lib/utils";
import { permissionKey, permissionsToKeys, type PermissionDef } from "@/lib/admin/permissions-catalog";
import type { AdminRoleView, AdminUserView } from "@/lib/services/admin-rbac";
import { FACTORY_IDS } from "@/types";

import { resourceLabelClass } from "@/lib/theme/resource-colors";

export function RbacManagement() {
  const { rolesQuery, usersQuery, permissionsQuery, mutate } = useAdmin();

  const roles = (rolesQuery.data ?? []) as AdminRoleView[];
  const users = (usersQuery.data ?? []) as AdminUserView[];
  const catalog = (permissionsQuery.data ?? []) as PermissionDef[];

  const [userDialog, setUserDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUserView | null>(null);
  const [userForm, setUserForm] = useState({
    email: "",
    full_name: "",
    password: "",
    factory_id: "none",
    is_active: true,
    role_ids: [] as string[],
  });

  const [roleDialog, setRoleDialog] = useState(false);
  const [editingRole, setEditingRole] = useState<AdminRoleView | null>(null);
  const [roleForm, setRoleForm] = useState({
    name: "",
    slug: "",
    description: "",
    permission_keys: [] as string[],
  });

  const [deleteRole, setDeleteRole] = useState<AdminRoleView | null>(null);

  const groupedPermissions = useMemo(() => {
    const map = new Map<string, PermissionDef[]>();
    for (const p of catalog) {
      const list = map.get(p.resource) ?? [];
      list.push(p);
      map.set(p.resource, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [catalog]);

  const openCreateUser = () => {
    setEditingUser(null);
    setUserForm({
      email: "",
      full_name: "",
      password: "",
      factory_id: "none",
      is_active: true,
      role_ids: roles[0] ? [roles[0].id] : [],
    });
    setUserDialog(true);
  };

  const openEditUser = (user: AdminUserView) => {
    setEditingUser(user);
    setUserForm({
      email: user.email,
      full_name: user.full_name,
      password: "",
      factory_id: user.factory_id ?? "none",
      is_active: user.is_active,
      role_ids: user.role_ids,
    });
    setUserDialog(true);
  };

  const toggleUserRole = (roleId: string) => {
    setUserForm((f) => ({
      ...f,
      role_ids: f.role_ids.includes(roleId)
        ? f.role_ids.filter((id) => id !== roleId)
        : [...f.role_ids, roleId],
    }));
  };

  const submitUser = () => {
    if (!userForm.full_name.trim() || !userForm.email.trim()) {
      return toast.error("Name and email are required");
    }
    if (!editingUser && !userForm.password) return toast.error("Password is required for new users");
    if (!userForm.role_ids.length) return toast.error("Assign at least one role");

    mutate.mutate(
      {
        action: editingUser ? "update_user" : "create_user",
        ...(editingUser ? { id: editingUser.id } : {}),
        email: userForm.email.trim(),
        full_name: userForm.full_name.trim(),
        ...(userForm.password ? { password: userForm.password } : {}),
        factory_id: userForm.factory_id === "none" ? null : userForm.factory_id,
        is_active: userForm.is_active,
        role_ids: userForm.role_ids,
      },
      {
        onSuccess: () => {
          toast.success(editingUser ? "User updated" : "User created");
          setUserDialog(false);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
      }
    );
  };

  const openCreateRole = () => {
    setEditingRole(null);
    setRoleForm({ name: "", slug: "", description: "", permission_keys: [] });
    setRoleDialog(true);
  };

  const openEditRole = (role: AdminRoleView) => {
    setEditingRole(role);
    setRoleForm({
      name: role.name,
      slug: role.slug,
      description: role.description ?? "",
      permission_keys: permissionsToKeys(role.permissions),
    });
    setRoleDialog(true);
  };

  const togglePermission = (key: string) => {
    setRoleForm((f) => ({
      ...f,
      permission_keys: f.permission_keys.includes(key)
        ? f.permission_keys.filter((k) => k !== key)
        : [...f.permission_keys, key],
    }));
  };

  const submitRole = () => {
    if (!roleForm.name.trim()) return toast.error("Role name is required");
    mutate.mutate(
      {
        action: editingRole ? "update_role" : "create_role",
        ...(editingRole ? { id: editingRole.id } : {}),
        name: roleForm.name.trim(),
        slug: roleForm.slug.trim() || undefined,
        description: roleForm.description || undefined,
        permission_keys: roleForm.permission_keys,
      },
      {
        onSuccess: () => {
          toast.success(editingRole ? "Role updated" : "Role created");
          setRoleDialog(false);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
      }
    );
  };

  const confirmDeleteRole = () => {
    if (!deleteRole) return;
    mutate.mutate(
      { action: "delete_role", id: deleteRole.id },
      {
        onSuccess: () => {
          toast.success("Role deleted");
          setDeleteRole(null);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
      }
    );
  };

  const isLoading = rolesQuery.isLoading || usersQuery.isLoading;

  return (
    <Tabs defaultValue="users">
      <TabsList>
        <TabsTrigger value="users" className="gap-1.5">
          <Users className="size-3.5" />
          Users
        </TabsTrigger>
        <TabsTrigger value="roles" className="gap-1.5">
          <Shield className="size-3.5" />
          Roles & Permissions
        </TabsTrigger>
      </TabsList>

      <TabsContent value="users" className="mt-6">
        <Card className="border-border/60 bg-card/50">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>User Management</CardTitle>
              <CardDescription>Create users, assign roles, and control access</CardDescription>
            </div>
            <Button size="sm" onClick={openCreateUser}>
              <Plus className="size-4" />
              Add User
            </Button>
          </CardHeader>
          <CardContent>
            <DataTable
              data={users}
              getRowKey={(row) => row.id}
              emptyMessage={isLoading ? "Loading..." : "No users found"}
              columns={[
                {
                  id: "name",
                  header: "User",
                  cell: (row) => (
                    <div>
                      <p className="font-medium">{row.full_name}</p>
                      <p className="text-xs text-muted-foreground">{row.email}</p>
                    </div>
                  ),
                },
                {
                  id: "roles",
                  header: "Roles",
                  cell: (row) => (
                    <div className="flex flex-wrap gap-1">
                      {row.roles.map((r) => (
                        <Badge key={r.id} variant="outline" className="text-[10px]">
                          {r.name}
                        </Badge>
                      ))}
                    </div>
                  ),
                },
                {
                  id: "status",
                  header: "Status",
                  cell: (row) => (
                    <Badge variant={row.is_active ? "default" : "secondary"}>
                      {row.is_active ? "Active" : "Inactive"}
                    </Badge>
                  ),
                },
                {
                  id: "actions",
                  header: "",
                  cell: (row) => (
                    <RowActions
                      onEdit={() => openEditUser(row)}
                    />
                  ),
                },
              ]}
            />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="roles" className="mt-6 space-y-6">
        <div className="flex justify-end">
          <Button size="sm" onClick={openCreateRole}>
            <Plus className="size-4" />
            Create Role
          </Button>
        </div>

        {roles.map((role) => (
          <Card key={role.id} className="border-border/60 bg-card/50">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {role.name}
                    {role.is_system ? <Badge variant="secondary">System</Badge> : null}
                  </CardTitle>
                  <CardDescription className="font-mono text-xs">{role.slug}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEditRole(role)}>
                    Edit Access
                  </Button>
                  {!role.is_system ? (
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteRole(role)}>
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {role.permissions[0]?.resource === "*" ? (
                <p className="text-sm text-muted-foreground">Full unrestricted access</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {role.permissions.map((perm, i) => (
                    <div
                      key={`${perm.resource}-${perm.action}-${i}`}
                      className={cn(
                            "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs",
                            resourceLabelClass(perm.resource)
                      )}
                    >
                      <span className="font-medium capitalize">{perm.resource.replace(/_/g, " ")}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="capitalize">{perm.action.replace(/_/g, " ")}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </TabsContent>

      <EntityFormDialog
        open={userDialog}
        onOpenChange={setUserDialog}
        title={editingUser ? "Edit User" : "Create User"}
        description="Assign one or more roles to control module access"
        contentClassName="sm:max-w-lg"
        submitLabel={editingUser ? "Save Changes" : "Create User"}
        isSubmitting={mutate.isPending}
        onSubmit={submitUser}
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-2">
            <Label>Full name</Label>
            <Input value={userForm.full_name} onChange={(e) => setUserForm((f) => ({ ...f, full_name: e.target.value }))} />
          </div>
          <div className="col-span-2 space-y-2">
            <Label>Email</Label>
            <Input type="email" value={userForm.email} onChange={(e) => setUserForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div className="col-span-2 space-y-2">
            <Label>{editingUser ? "New password (optional)" : "Password"}</Label>
            <Input type="password" value={userForm.password} onChange={(e) => setUserForm((f) => ({ ...f, password: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Factory</Label>
            <Select value={userForm.factory_id} onValueChange={(v) => setUserForm((f) => ({ ...f, factory_id: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">All / HQ</SelectItem>
                <SelectItem value={FACTORY_IDS.block}>Block Factory</SelectItem>
                <SelectItem value={FACTORY_IDS.recycling}>Plastic Recycling</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={userForm.is_active} onChange={(e) => setUserForm((f) => ({ ...f, is_active: e.target.checked }))} />
              Active account
            </label>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Roles</Label>
          <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-border/60 p-3">
            {roles.map((role) => (
              <label key={role.id} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={userForm.role_ids.includes(role.id)}
                  onChange={() => toggleUserRole(role.id)}
                />
                <span>{role.name}</span>
                <span className="text-xs text-muted-foreground">({role.slug})</span>
              </label>
            ))}
          </div>
        </div>
      </EntityFormDialog>

      <EntityFormDialog
        open={roleDialog}
        onOpenChange={setRoleDialog}
        title={editingRole ? `Edit Role — ${editingRole.name}` : "Create Role"}
        description="Select every permission this role should grant"
        contentClassName="sm:max-w-2xl"
        submitLabel={editingRole ? "Save Permissions" : "Create Role"}
        isSubmitting={mutate.isPending}
        onSubmit={submitRole}
      >
        {!editingRole ? (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Role name</Label>
              <Input value={roleForm.name} onChange={(e) => setRoleForm((f) => ({ ...f, name: e.target.value }))} placeholder="Custom Analyst" />
            </div>
            <div className="space-y-2">
              <Label>Slug (optional)</Label>
              <Input value={roleForm.slug} onChange={(e) => setRoleForm((f) => ({ ...f, slug: e.target.value }))} placeholder="custom_analyst" className="font-mono" />
            </div>
          </div>
        ) : null}
        <div className="space-y-2">
          <Label>Description</Label>
          <Input value={roleForm.description} onChange={(e) => setRoleForm((f) => ({ ...f, description: e.target.value }))} />
        </div>
        <div className="max-h-80 space-y-4 overflow-y-auto rounded-xl border border-border/60 p-4">
          {groupedPermissions.map(([resource, perms]) => (
            <div key={resource}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {resource.replace(/_/g, " ")}
              </p>
              <div className="flex flex-wrap gap-2">
                {perms.map((p) => {
                  const key = permissionKey(p.resource, p.action);
                  const checked = roleForm.permission_keys.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => togglePermission(key)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs capitalize transition",
                        checked ? "border-primary bg-primary/15 text-primary" : "border-border/60 text-muted-foreground hover:border-primary/40"
                      )}
                    >
                      {p.action.replace(/_/g, " ")}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </EntityFormDialog>

      <ConfirmDialog
        open={!!deleteRole}
        onOpenChange={(o) => !o && setDeleteRole(null)}
        title="Delete role"
        description={`Delete "${deleteRole?.name}"? Users must be unassigned first.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={mutate.isPending}
        onConfirm={confirmDeleteRole}
      />
    </Tabs>
  );
}
