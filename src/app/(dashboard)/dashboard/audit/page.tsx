"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAudit } from "@/hooks/use-api";
import { formatDateTime } from "@/lib/utils";
import type { AuditLog } from "@/types";

const COMMON_ACTIONS = ["INSERT", "UPDATE", "DELETE", "EXPORT"];

export default function AuditPage() {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const deferredSearch = useDeferredValue(search);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useAudit(deferredSearch, actionFilter);

  const logs = useMemo(
    () => (data?.pages.flatMap((page) => page.logs) ?? []) as AuditLog[],
    [data]
  );

  const actions = useMemo(() => {
    const fromLogs = logs.map((log) => log.action);
    return [...new Set([...COMMON_ACTIONS, ...fromLogs])].sort();
  }, [logs]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void fetchNextPage();
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, logs.length]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Audit Log"
        description="Immutable record of all system changes. Scroll to load older entries."
      />

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search entity, action, user ID, or values..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            {actions.map((action) => (
              <SelectItem key={action} value={action}>
                {action}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        data={logs}
        loading={isLoading}
        getRowKey={(row) => row.id}
        columns={[
          {
            id: "time",
            header: "Timestamp",
            cell: (row) => (
              <span className="text-xs">{formatDateTime(row.created_at)}</span>
            ),
          },
          {
            id: "action",
            header: "Action",
            cell: (row) => (
              <Badge
                variant={
                  row.action === "INSERT"
                    ? "success"
                    : row.action === "DELETE"
                      ? "destructive"
                      : "info"
                }
              >
                {row.action}
              </Badge>
            ),
          },
          {
            id: "entity",
            header: "Entity",
            cell: (row) => (
              <span className="capitalize">{row.entity_type.replace(/_/g, " ")}</span>
            ),
          },
          {
            id: "entityId",
            header: "Entity ID",
            cell: (row) => (
              <span className="font-mono text-xs">{row.entity_id}</span>
            ),
          },
          {
            id: "user",
            header: "User",
            cell: (row) => row.user_id ?? "System",
          },
          {
            id: "details",
            header: "",
            cell: (row) => (
              <button
                type="button"
                className="text-sm text-primary hover:underline"
                onClick={() => setSelected(row)}
              >
                View changes
              </button>
            ),
          },
        ]}
      />

      <div ref={loadMoreRef} className="flex min-h-12 items-center justify-center">
        {isFetchingNextPage ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading more entries...
          </div>
        ) : hasNextPage ? (
          <Button variant="outline" size="sm" onClick={() => void fetchNextPage()}>
            Load more
          </Button>
        ) : logs.length > 0 ? (
          <p className="text-sm text-muted-foreground">End of audit log</p>
        ) : !isLoading ? (
          <p className="text-sm text-muted-foreground">No audit entries match your filters</p>
        ) : null}
      </div>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Audit Entry Details</DialogTitle>
            <DialogDescription>
              {selected && formatDateTime(selected.created_at)}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Action</p>
                  <p className="font-medium">{selected.action}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Entity</p>
                  <p className="font-medium capitalize">
                    {selected.entity_type.replace(/_/g, " ")}
                  </p>
                </div>
              </div>
              {selected.old_values && (
                <div>
                  <p className="mb-2 text-sm font-medium text-muted-foreground">Previous Values</p>
                  <pre className="overflow-auto rounded-lg border border-border/60 bg-muted/50 p-3 text-xs">
                    {JSON.stringify(selected.old_values, null, 2)}
                  </pre>
                </div>
              )}
              {selected.new_values && (
                <div>
                  <p className="mb-2 text-sm font-medium text-muted-foreground">New Values</p>
                  <pre className="overflow-auto rounded-lg border border-border/60 bg-muted/50 p-3 text-xs">
                    {JSON.stringify(selected.new_values, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
