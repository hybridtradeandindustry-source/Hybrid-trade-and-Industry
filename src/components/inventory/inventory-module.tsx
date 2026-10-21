"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  ClipboardList,
  Download,
  LayoutGrid,
  Package,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EntityFormDialog } from "@/components/crud/entity-form-dialog";
import { RowActions } from "@/components/crud/row-actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useInventory, useProductionSettings } from "@/hooks/use-api";
import { useAuth } from "@/providers/auth-provider";
import { useAppStore } from "@/stores/app-store";
import {
  exportInventoryCsv,
  filterInventoryItems,
  getAvailableQuantity,
  getReorderRecommendation,
  getStockHealth,
  needsReorder,
  scopeToFactoryId,
} from "@/lib/inventory/inventory-utils";
import {
  getActiveItemTypes,
  resolveCategoryName,
  resolveItemTypeName,
} from "@/lib/inventory/inventory-config";
import { InventorySetupLink } from "@/components/admin/inventory-settings";
import { InventoryItemFormDialog } from "@/components/inventory/inventory-item-form-dialog";
import { InventoryItemDetail } from "@/components/inventory/inventory-item-detail";
import { getTypeVisual } from "@/lib/inventory/catalog-visuals";
import { BlockStockOverview } from "@/components/block-factory/block-stock-overview";
import { buildBlockStockView, isBlockStockSku } from "@/lib/block-factory/stock-snapshot";
import { cn, formatCurrency, formatDateTime, formatNumber, formatPolicheLoads } from "@/lib/utils";
import {
  FACTORY_IDS,
  type InventoryConfig,
  type InventoryItem,
  type InventoryMetrics,
  type InventoryMovement,
  type StockCount,
  type ViewScope,
} from "@/types";
import type { InventoryIntelligence } from "@/types/inventory-enterprise";

const MOVEMENT_TYPES = [
  { value: "receipt", label: "Receipt (In)" },
  { value: "issue", label: "Issue (Out)" },
  { value: "adjustment", label: "Adjustment" },
  { value: "transfer", label: "Transfer" },
  { value: "production_in", label: "Production In" },
  { value: "production_out", label: "Production Out" },
  { value: "damage_return", label: "Damage Return" },
  { value: "sale", label: "Sale / Shipment" },
];

import {
  CHART_COLORS,
  CHART_GRID_STROKE,
  CHART_TICK_FILL,
  HEALTH_CHART_COLORS,
} from "@/lib/theme/chart-theme";

const HEALTH_COLORS = HEALTH_CHART_COLORS;

function resolveDefaultFactoryId(viewScope: ViewScope): string {
  if (viewScope === "block") return FACTORY_IDS.block;
  if (viewScope === "recycling") return FACTORY_IDS.recycling;
  return FACTORY_IDS.block;
}

function factoryLabel(id: string) {
  return id === FACTORY_IDS.block ? "Block Factory" : "Plastic Recycling";
}

export function InventoryModule() {
  const { hasPermission } = useAuth();
  const { viewScope } = useAppStore();
  const defaultFactoryId = resolveDefaultFactoryId(viewScope);
  const { data, isLoading, isFetching, mutate, refetch } = useInventory();

  const isBlockScope = viewScope === "block";

  // Always pull live Supabase balances when this page opens (e.g. after batch completion in Production).
  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    setActiveTab(viewScope === "block" ? "ledger" : "overview");
    setItemTypeFilter("all");
    setCategoryFilter("all");
    setHealthFilter("all");
  }, [viewScope]);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [itemTypeFilter, setItemTypeFilter] = useState("all");
  const [healthFilter, setHealthFilter] = useState("all");
  const [stockOnlyLedger, setStockOnlyLedger] = useState(true);
  const [activeTab, setActiveTab] = useState(() => (viewScope === "block" ? "ledger" : "overview"));
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<InventoryItem | null>(null);

  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [countDialogOpen, setCountDialogOpen] = useState(false);
  const [bulkCountOpen, setBulkCountOpen] = useState(false);
  const [reserveDialogOpen, setReserveDialogOpen] = useState(false);

  const [movementForm, setMovementForm] = useState({
    factory_id: defaultFactoryId,
    item_id: "",
    quantity: "",
    movement_type: "receipt",
    notes: "",
  });
  const [transferForm, setTransferForm] = useState({
    from_item_id: "",
    to_item_id: "",
    quantity: "",
    notes: "",
  });
  const [countForm, setCountForm] = useState({
    factory_id: defaultFactoryId,
    item_id: "",
    counted_quantity: "",
    notes: "",
  });
  const [bulkCounts, setBulkCounts] = useState<Record<string, string>>({});
  const [reserveForm, setReserveForm] = useState({ item_id: "", quantity: "", action: "reserve" as "reserve" | "release" });

  const items = (data?.items ?? []) as InventoryItem[];
  const config = (data?.config ?? { itemTypes: [], categories: [], units: [] }) as InventoryConfig;
  const movements = (data?.movements ?? []) as InventoryMovement[];
  const stockCounts = (data?.stockCounts ?? []) as StockCount[];
  const metrics = (data?.metrics ?? {}) as InventoryMetrics;
  const intelligence = ((data?.enterprise as { intelligence?: InventoryIntelligence } | undefined)
    ?.intelligence ?? {
    abcAnalysis: [],
    daysOfSupply: [],
    deadStock: [],
    smartReorder: [],
  }) as InventoryIntelligence;

  const movementSummary = useMemo(() => {
    const byType = movements.reduce<Record<string, number>>((acc, m) => {
      acc[m.movement_type] = (acc[m.movement_type] ?? 0) + 1;
      return acc;
    }, {});
    return Object.entries(byType)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }, [movements]);

  const canManage = hasPermission("inventory", "manage");
  const canCount = hasPermission("inventory", "count");

  const blockFactoryItems = useMemo(
    () => items.filter((i) => i.factory_id === FACTORY_IDS.block && i.is_active),
    [items]
  );

  const { data: productionSettings } = useProductionSettings();
  const blockStockView = useMemo(
    () => buildBlockStockView(blockFactoryItems, movements, productionSettings?.cement_kg_per_bag),
    [blockFactoryItems, movements, productionSettings?.cement_kg_per_bag]
  );

  const blockStockLedgerItems = useMemo(
    () => blockFactoryItems.filter((i) => isBlockStockSku(i.sku)),
    [blockFactoryItems]
  );

  const scopedFactoryId = scopeToFactoryId(viewScope);

  const scopedItems = useMemo(
    () =>
      items.filter(
        (i) => i.is_active && (!scopedFactoryId || i.factory_id === scopedFactoryId)
      ),
    [items, scopedFactoryId]
  );

  const liveReorderAlerts = useMemo(
    () => scopedItems.filter((i) => needsReorder(i)),
    [scopedItems]
  );

  const catalogItemTypes = useMemo(
    () => getActiveItemTypes(config, scopedFactoryId),
    [config, scopedFactoryId]
  );

  const itemTypeStats = useMemo(() => {
    const stats = new Map<
      string,
      { count: number; reorderCount: number; units: number; value: number; unitsLabel: string }
    >();
    for (const type of catalogItemTypes) {
      const typeItems = scopedItems.filter((i) => i.item_type_id === type.id);
      const byUnit = typeItems.reduce<Record<string, number>>((acc, item) => {
        acc[item.unit] = (acc[item.unit] ?? 0) + Math.max(0, item.quantity);
        return acc;
      }, {});
      stats.set(type.id, {
        count: typeItems.length,
        reorderCount: typeItems.filter((i) => needsReorder(i)).length,
        units: typeItems.reduce((sum, i) => sum + Math.max(0, i.quantity), 0),
        value: typeItems.reduce(
          (sum, i) => sum + Math.max(0, i.quantity) * (i.unit_cost ?? 0),
          0
        ),
        unitsLabel:
          Object.entries(byUnit)
            .map(([unit, qty]) => `${formatNumber(qty)} ${unit}`)
            .join(" · ") || "0",
      });
    }
    return stats;
  }, [catalogItemTypes, scopedItems]);

  const analyticsTypeRows = useMemo(
    () =>
      catalogItemTypes.map((type) => ({
        type,
        ...(itemTypeStats.get(type.id) ?? {
          count: 0,
          reorderCount: 0,
          units: 0,
          value: 0,
          unitsLabel: "0",
        }),
      })),
    [catalogItemTypes, itemTypeStats]
  );

  const scopedStockValue = useMemo(
    () =>
      scopedItems.reduce(
        (sum, i) => sum + Math.max(0, i.quantity) * (i.unit_cost ?? 0),
        0
      ),
    [scopedItems]
  );

  const productionMovementCount = useMemo(
    () =>
      movements.filter(
        (m) =>
          (!scopedFactoryId || m.factory_id === scopedFactoryId) &&
          (m.source_module === "production" ||
            m.reason === "production_consumption" ||
            m.reason === "wip_intake" ||
            m.reason === "curing_complete" ||
            m.reason === "finished_goods")
      ).length,
    [movements, scopedFactoryId]
  );

  const scopedItemIds = useMemo(() => new Set(scopedItems.map((i) => i.id)), [scopedItems]);

  const scopedAbcAnalysis = useMemo(
    () => intelligence.abcAnalysis.filter((row) => scopedItemIds.has(row.item_id)),
    [intelligence.abcAnalysis, scopedItemIds]
  );

  const scopedDaysOfSupply = useMemo(
    () => intelligence.daysOfSupply.filter((row) => scopedItemIds.has(row.item_id)),
    [intelligence.daysOfSupply, scopedItemIds]
  );

  const filteredItems = useMemo(
    () => {
      const list = filterInventoryItems(items, {
        search,
        category: categoryFilter,
        itemType: itemTypeFilter,
        health: healthFilter,
        factoryId: scopedFactoryId,
      });
      if (isBlockScope && stockOnlyLedger && itemTypeFilter === "all") {
        return list.filter((i) => isBlockStockSku(i.sku));
      }
      return list;
    },
    [items, search, categoryFilter, itemTypeFilter, healthFilter, scopedFactoryId, isBlockScope, stockOnlyLedger]
  );

  const overviewItems = useMemo(() => {
    if (itemTypeFilter !== "all" || healthFilter !== "all" || search) {
      return filteredItems;
    }
    if (isBlockScope) {
      return stockOnlyLedger ? blockStockLedgerItems : scopedItems;
    }
    return scopedItems;
  }, [
    blockStockLedgerItems,
    filteredItems,
    healthFilter,
    isBlockScope,
    itemTypeFilter,
    scopedItems,
    search,
    stockOnlyLedger,
  ]);

  const handleItemTypeFilter = (typeId: string) => {
    setItemTypeFilter(typeId);
    setCategoryFilter("all");
    setActiveTab("ledger");
  };

  const handleReorderAlertClick = (item: InventoryItem) => {
    setItemTypeFilter(item.item_type_id ?? "all");
    setCategoryFilter("all");
    setSearch(item.sku);
    setActiveTab("ledger");
    setSelectedItem(item);
  };

  const healthChartData = useMemo(
    () =>
      (["critical", "low", "ok", "overstock"] as const).map((h) => ({
        name: h,
        count: scopedItems.filter((i) => getStockHealth(i) === h).length,
      })),
    [scopedItems]
  );

  const categoryChartData = useMemo(
    () =>
      Object.entries(metrics.byItemType ?? {}).map(([typeId, stats], index) => ({
        name: stats.label ?? resolveItemTypeName(config, typeId),
        value: stats.units ?? 0,
        fill: [HEALTH_COLORS.low, HEALTH_COLORS.overstock, HEALTH_COLORS.ok, HEALTH_COLORS.critical][index % 4],
      })),
    [metrics, config]
  );

  const factoryCompareData = useMemo(
    () => [
      { name: "Block", units: metrics.blockFactory?.units ?? 0, value: metrics.blockFactory?.value ?? 0 },
      { name: "Recycling", units: metrics.recyclingFactory?.units ?? 0, value: metrics.recyclingFactory?.value ?? 0 },
    ],
    [metrics]
  );

  const handleExport = () => {
    const csv = exportInventoryCsv(filteredItems, config);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory-${viewScope}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Inventory exported");
  };

  const openCreateItem = () => {
    setEditingItem(null);
    setItemDialogOpen(true);
  };

  const openEditItem = (item: InventoryItem) => {
    setEditingItem(item);
    setItemDialogOpen(true);
  };

  const handleGenerateSku = async (input: {
    factory_id: string;
    item_type_id: string;
    category_id: string;
  }) => {
    const res = await mutate.mutateAsync({
      action: "generate_sku",
      ...input,
    });
    return (res as { sku?: string })?.sku ?? null;
  };

  const handleItemFormSubmit = (payload: Record<string, unknown>, editingId?: string) => {
    if (!canManage) {
      toast.error("Permission denied");
      return;
    }
    mutate.mutate(
      editingId ? { action: "update_item", id: editingId, ...payload } : { action: "create_item", ...payload },
      {
        onSuccess: () => {
          toast.success(editingId ? "Item updated" : "Item added");
          setItemDialogOpen(false);
          setEditingItem(null);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
      }
    );
  };

  const submitMovement = () => {
    if (!canManage) return;
    const qty = Number(movementForm.quantity);
    const signedQty =
      movementForm.movement_type === "issue" ||
      movementForm.movement_type === "sale" ||
      movementForm.movement_type === "production_out"
        ? -Math.abs(qty)
        : Math.abs(qty);
    mutate.mutate(
      {
        action: "movement",
        type: "movement",
        factory_id: movementForm.factory_id,
        item_id: movementForm.item_id,
        quantity: signedQty,
        movement_type: movementForm.movement_type,
        notes: movementForm.notes || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Movement recorded");
          setMovementDialogOpen(false);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
      }
    );
  };

  const submitTransfer = () => {
    mutate.mutate(
      { action: "transfer", ...transferForm, quantity: Number(transferForm.quantity) },
      {
        onSuccess: () => {
          toast.success("Stock transferred");
          setTransferDialogOpen(false);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
      }
    );
  };

  const submitCount = () => {
    mutate.mutate(
      {
        factory_id: countForm.factory_id,
        item_id: countForm.item_id,
        counted_quantity: Number(countForm.counted_quantity),
        notes: countForm.notes || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Stock count submitted");
          setCountDialogOpen(false);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
      }
    );
  };

  const submitBulkCount = () => {
    const counts = Object.entries(bulkCounts)
      .filter(([, v]) => v !== "")
      .map(([item_id, counted_quantity]) => ({ item_id, counted_quantity: Number(counted_quantity) }));
    if (!counts.length) return toast.error("Enter at least one count");
    mutate.mutate(
      { action: "bulk_count", counts },
      {
        onSuccess: () => {
          toast.success(`${counts.length} counts submitted`);
          setBulkCountOpen(false);
          setBulkCounts({});
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
      }
    );
  };

  const submitReserve = () => {
    mutate.mutate(
      {
        action: "reserve",
        item_id: reserveForm.item_id,
        quantity: Number(reserveForm.quantity),
        reserve_action: reserveForm.action,
      },
      {
        onSuccess: () => {
          toast.success(reserveForm.action === "reserve" ? "Stock reserved" : "Reservation released");
          setReserveDialogOpen(false);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
      }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory Management"
        description={
          isBlockScope
            ? "Block factory stock — cement, poliche, blocks in drying/curing, and finished goods by type."
            : "Enterprise stock control for Block Factory and Plastic Recycling — ledger, movements, counts, and analytics."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="size-4" />
              Export CSV
            </Button>
            <InventorySetupLink />
            {canManage && (
              <Button variant="outline" size="sm" onClick={openCreateItem}>
                <Plus className="size-4" />
                Add SKU
              </Button>
            )}
            {canCount && (
              <Button variant="outline" size="sm" onClick={() => setBulkCountOpen(true)}>
                <ClipboardList className="size-4" />
                Cycle Count
              </Button>
            )}
          </div>
        }
      />

      {isBlockScope ? (
        <BlockStockOverview stock={blockStockView} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <MetricCard title="Total SKUs" value={metrics.totalSkus ?? items.length} icon={<Package className="size-4" />} info="Number of distinct inventory item SKUs tracked." />
          <MetricCard
            title="Finished Goods"
            value={formatNumber(metrics.finishedGoodsUnits ?? metrics.totalUnits ?? 0)}
            info="Total units of finished goods currently on hand."
          />
          <MetricCard title="Stock Value" value={formatCurrency(metrics.totalValue ?? 0)} info="Total value of all inventory currently on hand, at recorded unit cost." />
          <MetricCard
            title="Low / Critical"
            value={`${metrics.lowStockCount ?? 0} / ${metrics.outOfStockCount ?? 0}`}
            className={(metrics.lowStockCount ?? 0) > 0 ? "border-warning/30" : undefined}
            info="Items below their reorder threshold (low), and items with zero stock (critical)."
          />
          <MetricCard title="Pending Counts" value={metrics.pendingCounts ?? 0} info="Stock counts submitted and awaiting verification." />
        </div>
      )}

      {(metrics.negativeStockCount ?? 0) > 0 && (
        <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
          <AlertTriangle className="size-4" />
          <AlertTitle>Negative raw material stock</AlertTitle>
          <AlertDescription>
            {metrics.negativeStockCount} SKU(s) are below zero because production consumed materials without enough
            opening stock. Post a receipt movement for the affected raw materials to correct balances.
          </AlertDescription>
        </Alert>
      )}

      {liveReorderAlerts.length > 0 && (
        <Alert variant="warning" className="border-warning/30 bg-warning/5">
          <AlertTriangle className="size-4" />
          <AlertTitle>Reorder Required ({liveReorderAlerts.length})</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 space-y-2">
              {liveReorderAlerts.slice(0, 6).map((item) => {
                const recommendation = getReorderRecommendation(item);
                if (!recommendation) return null;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => handleReorderAlertClick(item)}
                      className="flex w-full flex-wrap items-start justify-between gap-2 rounded-md border border-warning/20 bg-background/60 px-3 py-2 text-left text-sm transition-colors hover:bg-background"
                    >
                      <span>
                        <span className="font-medium">{item.name}</span>
                        <span className="ml-2 font-mono text-xs text-muted-foreground">{item.sku}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          · {formatNumber(item.quantity)} {item.unit} on hand
                        </span>
                      </span>
                      <span className="text-xs text-warning">{recommendation}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {liveReorderAlerts.length > 6 && (
              <p className="mt-2 text-xs text-muted-foreground">
                +{liveReorderAlerts.length - 6} more — open Analytics or filter by item type
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      {catalogItemTypes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {catalogItemTypes.map((type) => {
            const visual = getTypeVisual(type);
            const Icon = visual.icon;
            const stats = itemTypeStats.get(type.id);
            const isActive = itemTypeFilter === type.id;
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => handleItemTypeFilter(isActive ? "all" : type.id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-all",
                  isActive
                    ? "border-primary bg-primary/10 text-primary shadow-sm"
                    : "border-border/60 bg-card/50 hover:border-primary/30"
                )}
              >
                <span className={cn("flex size-5 items-center justify-center rounded-full", visual.iconBg, visual.iconColor)}>
                  <Icon className="size-3" />
                </span>
                <span className="font-medium">{type.name}</span>
                <span className="text-muted-foreground">({stats?.count ?? 0})</span>
                {(stats?.reorderCount ?? 0) > 0 && (
                  <Badge variant="destructive" className="h-4 px-1.5 text-[9px]">
                    {stats?.reorderCount} low
                  </Badge>
                )}
              </button>
            );
          })}
          {itemTypeFilter !== "all" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 rounded-full text-xs"
              onClick={() => {
                setItemTypeFilter("all");
                setCategoryFilter("all");
              }}
            >
              Clear filter
            </Button>
          )}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="flex h-auto flex-wrap gap-1 bg-muted/50 p-1">
          <TabsTrigger value="overview" className="gap-2">
            <LayoutGrid className="size-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="ledger" className="gap-2">
            <Package className="size-4" />
            Stock Ledger
          </TabsTrigger>
          {/* Movements tab hidden for now — data still loads for stock calculations */}
          {/*
          <TabsTrigger value="movements" className="gap-2">
            <ArrowLeftRight className="size-4" />
            Movements
          </TabsTrigger>
          */}
          <TabsTrigger value="counts" className="gap-2">
            <ClipboardList className="size-4" />
            Physical Counts
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2">
            <BarChart3 className="size-4" />
            Analytics
          </TabsTrigger>
          {/* Enterprise tab — re-enable when BOM/locations/lots are needed */}
          {/*
          <TabsTrigger value="enterprise" className="gap-2">
            <Shield className="size-4" />
            Enterprise
          </TabsTrigger>
          */}
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {isBlockScope ? (
            <Card className="border-border/60 bg-card/50">
              <CardHeader>
                <CardTitle>Live Stock Balances</CardTitle>
                <CardDescription>
                  Current on-hand quantities from Supabase — updates when you open this page or click Refresh
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DataTable
                  data={overviewItems}
                  getRowKey={(i) => i.id}
                  emptyMessage="No stock items found"
                  onRowClick={(row) => setSelectedItem(row)}
                  columns={[
                    {
                      id: "sku",
                      header: "SKU",
                      cell: (i) => <span className="font-mono text-xs">{i.sku}</span>,
                    },
                    { id: "name", header: "Item", cell: (i) => i.name },
                    {
                      id: "qty",
                      header: "On Hand",
                      cell: (i) => (
                        <span className="font-semibold">
                          {formatNumber(i.quantity)} {i.unit}
                        </span>
                      ),
                    },
                    {
                      id: "health",
                      header: "Status",
                      cell: (i) => {
                        const h = getStockHealth(i);
                        return (
                          <StatusBadge
                            status={
                              h === "critical"
                                ? "cancelled"
                                : h === "low"
                                  ? "on_hold"
                                  : "active"
                            }
                            label={h}
                          />
                        );
                      },
                    },
                  ]}
                />
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-6 lg:grid-cols-2">
            <Card className="border-border/60 bg-card/50">
              <CardHeader>
                <CardTitle>Factory Comparison</CardTitle>
                <CardDescription>Units and value by factory</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={factoryCompareData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                      <XAxis dataKey="name" tick={{ fill: CHART_TICK_FILL, fontSize: 12 }} />
                      <YAxis tick={{ fill: CHART_TICK_FILL, fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="units" name="Units" fill={CHART_COLORS.c1} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                  <div className="rounded-lg border border-border/60 p-3">
                    <p className="text-muted-foreground">Block Factory</p>
                    <p className="text-lg font-semibold">{formatNumber(metrics.blockFactory?.units ?? 0)} units</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(metrics.blockFactory?.value ?? 0)}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 p-3">
                    <p className="text-muted-foreground">Plastic Recycling</p>
                    <p className="text-lg font-semibold">{formatNumber(metrics.recyclingFactory?.units ?? 0)} units</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(metrics.recyclingFactory?.value ?? 0)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-card/50">
              <CardHeader>
                <CardTitle>Stock by Item Type</CardTitle>
                <CardDescription>Distribution from admin-defined catalog</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={categoryChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                        {categoryChartData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle>Recent Movements</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                data={movements.slice(0, 8)}
                getRowKey={(r) => r.id}
                columns={[
                  { id: "time", header: "When", cell: (r) => formatDateTime(r.created_at) },
                  { id: "item", header: "Item", cell: (r) => r.item?.name ?? r.item_id },
                  { id: "type", header: "Type", cell: (r) => <Badge variant="outline" className="capitalize">{String(r.movement_type).replace(/_/g, " ")}</Badge> },
                  { id: "qty", header: "Qty", cell: (r) => <span className={cn(r.quantity < 0 && "text-destructive")}>{r.quantity > 0 ? "+" : ""}{formatNumber(r.quantity)}</span> },
                  { id: "bal", header: "Balance", cell: (r) => r.balance_after != null ? formatNumber(r.balance_after) : "—" },
                ]}
              />
            </CardContent>
          </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="ledger" className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3 sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search SKU, name, supplier, location..." value={search} onChange={(e) => setSearch(e.target.value)} className="border-border/40 bg-background pl-9" />
              </div>
            <Select value={itemTypeFilter} onValueChange={setItemTypeFilter}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Item Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {getActiveItemTypes(config, scopeToFactoryId(viewScope)).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {config.categories.filter((c) => c.is_active).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={healthFilter} onValueChange={setHealthFilter}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Health" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Health</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="low">Low Stock</SelectItem>
                <SelectItem value="ok">Healthy</SelectItem>
                <SelectItem value="overstock">Overstock</SelectItem>
              </SelectContent>
            </Select>
            {isBlockScope && (
              <Button
                type="button"
                variant={stockOnlyLedger ? "default" : "outline"}
                size="sm"
                className="shrink-0"
                onClick={() => setStockOnlyLedger((v) => !v)}
              >
                {stockOnlyLedger ? "Stock items only" : "All SKUs"}
              </Button>
            )}
          </div>
          </div>

          <Card className="border-border/60 bg-card/50">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle>Stock Ledger</CardTitle>
                <CardDescription>
                  {itemTypeFilter !== "all"
                    ? `Showing ${resolveItemTypeName(config, itemTypeFilter)} — ${filteredItems.length} SKU(s)`
                    : `${filteredItems.length} SKU(s) · live on-hand from Supabase`}
                </CardDescription>
              </div>
              {itemTypeFilter !== "all" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setItemTypeFilter("all");
                    setCategoryFilter("all");
                    setSearch("");
                  }}
                >
                  Clear filter
                </Button>
              )}
            </CardHeader>
            <CardContent className="pt-0">
              <DataTable
                data={filteredItems}
                getRowKey={(r) => r.id}
                onRowClick={(row) => setSelectedItem(row)}
                columns={[
                  { id: "sku", header: "SKU", cell: (r) => <span className="font-mono text-xs">{r.sku}</span> },
                  { id: "name", header: "Item", cell: (r) => <button type="button" className="text-left font-medium hover:text-primary" onClick={() => setSelectedItem(r)}>{r.name}</button> },
                  { id: "factory", header: "Factory", cell: (r) => <span className="text-xs">{factoryLabel(r.factory_id)}</span> },
                  { id: "type", header: "Type", cell: (r) => {
                    const type = config.itemTypes.find((t) => t.id === r.item_type_id);
                    const visual = getTypeVisual(type ?? { slug: "" });
                    const Icon = visual.icon;
                    return (
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <span className={cn("flex size-5 items-center justify-center rounded-md", visual.iconBg, visual.iconColor)}>
                          <Icon className="size-3" />
                        </span>
                        {resolveItemTypeName(config, r.item_type_id)}
                      </span>
                    );
                  }},
                  { id: "cat", header: "Category", cell: (r) => <Badge variant="outline" className="text-[10px]">{resolveCategoryName(config, r.category_id)}</Badge> },
                  { id: "qty", header: "On Hand", cell: (r) => `${formatNumber(r.quantity)} ${r.unit}` },
                  { id: "avail", header: "Available", cell: (r) => formatNumber(getAvailableQuantity(r)) },
                  // { id: "reserved", header: "Reserved", cell: (r) => formatNumber(r.reserved_quantity ?? 0) },
                  { id: "value", header: "Value", cell: (r) => formatCurrency(r.quantity * (r.unit_cost ?? 0)) },
                  { id: "health", header: "Health", cell: (r) => {
                    const h = getStockHealth(r);
                    return <StatusBadge status={h === "critical" ? "cancelled" : h === "low" ? "on_hold" : h === "overstock" ? "processing" : "active"} label={h} />;
                  }},
                  { id: "loc", header: "Location", cell: (r) => r.location ?? "—" },
                  { id: "act", header: "", cell: (r) => canManage ? <RowActions onEdit={() => openEditItem(r)} onDelete={() => setDeleteItem(r)} extraActions={[{ label: "Reserve Stock", onClick: () => { setReserveForm({ item_id: r.id, quantity: "", action: "reserve" }); setReserveDialogOpen(true); } }]} /> : null },
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Movements tab hidden for now
        <TabsContent value="movements">
          <Card className="border-border/60 bg-card/50">
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Movement Ledger</CardTitle>
                <CardDescription>Complete audit trail of all stock transactions</CardDescription>
              </div>
              {canManage && <Button size="sm" onClick={() => setMovementDialogOpen(true)}>New Movement</Button>}
            </CardHeader>
            <CardContent>
              <DataTable
                data={movements}
                getRowKey={(r) => r.id}
                columns={[
                  { id: "date", header: "Date", cell: (r) => formatDateTime(r.created_at) },
                  { id: "factory", header: "Factory", cell: (r) => factoryLabel(r.factory_id) },
                  { id: "item", header: "Item", cell: (r) => r.item?.name ?? r.item_id },
                  { id: "sku", header: "SKU", cell: (r) => r.item?.sku ?? "—" },
                  { id: "type", header: "Type", cell: (r) => <Badge variant="outline" className="capitalize">{String(r.movement_type).replace(/_/g, " ")}</Badge> },
                  { id: "reason", header: "Reason", cell: (r) => <span className="text-xs capitalize text-muted-foreground">{r.reason?.replace(/_/g, " ") ?? "—"}</span> },
                  { id: "module", header: "Module", cell: (r) => <span className="text-xs capitalize text-muted-foreground">{r.source_module ?? "—"}</span> },
                  { id: "qty", header: "Quantity", cell: (r) => <span className={cn("font-medium", r.quantity < 0 && "text-destructive")}>{r.quantity > 0 ? "+" : ""}{formatNumber(r.quantity)}</span> },
                  { id: "bal", header: "Balance After", cell: (r) => r.balance_after != null ? formatNumber(r.balance_after) : "—" },
                  { id: "notes", header: "Notes", cell: (r) => <span className="max-w-[200px] truncate text-xs text-muted-foreground">{r.notes ?? "—"}</span> },
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>
        */}

        <TabsContent value="counts" className="space-y-4">
          <div className="rounded-xl border border-primary/15 bg-primary/5 p-4 text-sm leading-relaxed">
            <p className="font-semibold text-foreground">Cycle count &amp; expenses</p>
            <p className="mt-1.5 text-muted-foreground">
              When you approve a count, inventory adjusts to the counted quantity. If stock goes down (e.g. 7
              poliche → 0), the purchased cost is expensed to COGS — the material was bought even if production
              did not use it. If stock goes up (e.g. poliche -7 → 0), that expense is reduced. This applies to
              cement, poliche, and every inventory item using its unit cost.
            </p>
          </div>
          <div className="flex gap-2">
            {canCount && (
              <>
                <Button variant="outline" onClick={() => setCountDialogOpen(true)}>Single Item Count</Button>
                <Button onClick={() => setBulkCountOpen(true)}>Start Cycle Count</Button>
              </>
            )}
          </div>
          <Card className="border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle>Count History &amp; Reconciliation</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                data={stockCounts}
                getRowKey={(r) => r.id}
                columns={[
                  { id: "item", header: "Item", cell: (r) => r.item?.name ?? r.item_id },
                  { id: "sys", header: "System", cell: (r) => formatNumber(r.system_quantity) },
                  { id: "cnt", header: "Counted", cell: (r) => formatNumber(r.counted_quantity) },
                  { id: "var", header: "Variance", cell: (r) => <span className={cn(r.variance !== 0 && "text-destructive font-medium")}>{r.variance > 0 ? "+" : ""}{formatNumber(r.variance)}</span> },
                  {
                    id: "cogs",
                    header: "COGS on approve",
                    cell: (r) => {
                      const unitCost = Number(r.item?.unit_cost ?? 0);
                      if (unitCost <= 0 || r.variance === 0) return "—";
                      const impact = r.variance * unitCost;
                      return (
                        <span className={cn("text-xs font-medium", impact < 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400")}>
                          {impact < 0 ? "Expense " : "Reduce "}
                          {formatCurrency(Math.abs(impact))}
                        </span>
                      );
                    },
                  },
                  { id: "st", header: "Status", cell: (r) => <StatusBadge status={r.status === "pending_review" ? "pending" : "completed"} label={r.status.replace(/_/g, " ")} /> },
                  { id: "act", header: "", cell: (r) => canManage && r.status === "pending_review" ? (
                    <div className="flex gap-1 justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={mutate.isPending}
                        onClick={() =>
                          mutate.mutate(
                            { action: "review_stock_count", id: r.id, status: "approved" },
                            {
                              onSuccess: (data) => {
                                const result = data as { expensePosted?: boolean; expenseAmount?: number };
                                if (result?.expensePosted && result.expenseAmount) {
                                  const amt = Math.abs(result.expenseAmount);
                                  toast.success(
                                    result.expenseAmount < 0
                                      ? `Approved — ${formatCurrency(amt)} expensed to COGS`
                                      : `Approved — ${formatCurrency(amt)} COGS reversed`
                                  );
                                } else {
                                  toast.success("Count approved — inventory updated");
                                }
                              },
                            }
                          )
                        }
                      >
                        Approve
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive" disabled={mutate.isPending} onClick={() => mutate.mutate({ action: "review_stock_count", id: r.id, status: "rejected" }, { onSuccess: () => toast.success("Rejected") })}>Reject</Button>
                    </div>
                  ) : null },
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Finished Goods"
              value={
                isBlockScope
                  ? formatNumber(blockStockView.totalFinishedBlocks)
                  : formatNumber(
                      scopedItems
                        .filter((i) => resolveItemTypeName(config, i.item_type_id).toLowerCase().includes("finished"))
                        .reduce((s, i) => s + Math.max(0, i.quantity), 0)
                    )
              }
              info="Total finished goods units currently on hand and available for sale."
            />
            <MetricCard
              title={isBlockScope ? "Raw Materials" : "Raw Material (units)"}
              value={
                isBlockScope ? (
                  <div className="text-base leading-snug">
                    <span>{formatNumber(blockStockView.cement.onHand)} bags</span>
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                      {formatPolicheLoads(blockStockView.poliche.onHand)} poliche loads
                    </span>
                  </div>
                ) : (
                  formatNumber(
                    scopedItems
                      .filter((i) => resolveItemTypeName(config, i.item_type_id).toLowerCase().includes("raw"))
                      .reduce((s, i) => s + Math.max(0, i.quantity), 0)
                  )
                )
              }
              info="Raw materials currently on hand and available for production."
            />
            <MetricCard title="Production Movements" value={productionMovementCount} info="Number of inventory movements generated by production activity." />
            <MetricCard title="Stock Value" value={formatCurrency(scopedStockValue)} info="Total value of inventory in scope, at recorded unit cost." />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="border-border/60 bg-card/50">
              <CardHeader>
                <CardTitle>Inventory Valuation</CardTitle>
                <CardDescription>
                  Live stock by type — value, on-hand quantities, and SKU count
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {analyticsTypeRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No inventory items in this scope.</p>
                ) : (
                  analyticsTypeRows.map(({ type, count, value, unitsLabel, reorderCount }) => {
                    const visual = getTypeVisual(type);
                    const Icon = visual.icon;
                    return (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => handleItemTypeFilter(type.id)}
                        className="flex w-full items-center justify-between rounded-lg border border-border/40 p-3 text-left transition-colors hover:bg-muted/30"
                      >
                        <span className="flex items-center gap-2 text-sm">
                          <span
                            className={cn(
                              "flex size-7 items-center justify-center rounded-md",
                              visual.iconBg,
                              visual.iconColor
                            )}
                          >
                            <Icon className="size-3.5" />
                          </span>
                          <span>
                            <span className="font-medium">{type.name}</span>
                            {reorderCount > 0 && (
                              <Badge variant="destructive" className="ml-2 h-4 px-1.5 text-[9px]">
                                {reorderCount} low
                              </Badge>
                            )}
                          </span>
                        </span>
                        <div className="text-right">
                          <p className="font-semibold">{formatCurrency(value)}</p>
                          <p className="text-xs text-muted-foreground">
                            {unitsLabel} · {count} SKU{count === 1 ? "" : "s"}
                          </p>
                        </div>
                      </button>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-card/50">
              <CardHeader>
                <CardTitle>Stock Health</CardTitle>
                <CardDescription>SKU count by health band</CardDescription>
              </CardHeader>
              <CardContent>
                {healthChartData.every((d) => d.count === 0) ? (
                  <p className="text-sm text-muted-foreground">No items to analyse.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={healthChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                      <XAxis dataKey="name" tick={{ fill: CHART_TICK_FILL, fontSize: 12 }} />
                      <YAxis allowDecimals={false} tick={{ fill: CHART_TICK_FILL, fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {healthChartData.map((entry) => (
                          <Cell
                            key={entry.name}
                            fill={HEALTH_COLORS[entry.name as keyof typeof HEALTH_COLORS] ?? CHART_COLORS.c1}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {isBlockScope && (
            <Card className="border-border/60 bg-card/50">
              <CardHeader>
                <CardTitle>Block Factory Breakdown</CardTitle>
                <CardDescription>Live quantities and Birr value by production stage</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    {
                      label: "Cement",
                      qty: `${formatNumber(blockStockView.cement.onHand)} bags`,
                      item: blockStockLedgerItems.find((i) => i.sku.includes("CEM")),
                    },
                    {
                      label: "Poliche",
                      qty: `${formatPolicheLoads(blockStockView.poliche.onHand)} loads`,
                      item: blockStockLedgerItems.find((i) => i.sku.includes("POL")),
                    },
                    {
                      label: "Drying / Curing",
                      qty: `${formatNumber(blockStockView.wip.onHand)} blocks`,
                      item: blockStockLedgerItems.find((i) => i.sku.includes("WIP-001")),
                    },
                    {
                      label: "Ready to Ship",
                      qty: `${formatNumber(blockStockView.totalFinishedBlocks)} blocks`,
                      items: blockStockLedgerItems.filter((i) => i.sku.includes("FG-")),
                    },
                  ].map((row) => {
                    const rowValue = row.items
                      ? row.items.reduce(
                          (s, i) => s + Math.max(0, i.quantity) * (i.unit_cost ?? 0),
                          0
                        )
                      : row.item
                        ? Math.max(0, row.item.quantity) * (row.item.unit_cost ?? 0)
                        : 0;
                    return (
                      <div
                        key={row.label}
                        className="rounded-lg border border-border/40 bg-muted/10 p-3"
                      >
                        <p className="text-xs text-muted-foreground">{row.label}</p>
                        <p className="mt-1 font-semibold">{row.qty}</p>
                        <p className="text-xs text-muted-foreground">{formatCurrency(rowValue)}</p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="border-border/60 bg-card/50">
              <CardHeader>
                <CardTitle>ABC Analysis</CardTitle>
                <CardDescription>Items ranked by annual value proxy</CardDescription>
              </CardHeader>
              <CardContent>
                <DataTable
                  data={scopedAbcAnalysis.slice(0, 8)}
                  getRowKey={(row) => row.item_id}
                  emptyMessage="Log movements and set unit costs to populate ABC analysis."
                  columns={[
                    { id: "sku", header: "SKU", cell: (row) => row.sku },
                    { id: "class", header: "Class", cell: (row) => <Badge variant="outline">{row.abc_class}</Badge> },
                    {
                      id: "value",
                      header: "Value %",
                      cell: (row) => `${(row.pct_of_total ?? 0).toFixed(1)}%`,
                    },
                  ]}
                />
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-card/50">
              <CardHeader>
                <CardTitle>Days of Supply</CardTitle>
                <CardDescription>Estimated runway from recent usage (30 days)</CardDescription>
              </CardHeader>
              <CardContent>
                <DataTable
                  data={scopedDaysOfSupply.slice(0, 8)}
                  getRowKey={(row) => row.item_id}
                  emptyMessage="No outbound movements in the last 30 days."
                  columns={[
                    { id: "name", header: "Item", cell: (row) => row.name },
                    { id: "qty", header: "On Hand", cell: (row) => formatNumber(row.quantity) },
                    { id: "days", header: "Days Left", cell: (row) => formatNumber(row.days_of_supply) },
                  ]}
                />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="border-border/60 bg-card/50">
              <CardHeader>
                <CardTitle>Movement Activity</CardTitle>
                <CardDescription>Recent ledger entries by type</CardDescription>
              </CardHeader>
              <CardContent>
                {movementSummary.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No movements recorded yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={movementSummary}
                        dataKey="count"
                        nameKey="type"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {movementSummary.map((_, index) => (
                          <Cell
                            key={index}
                            fill={Object.values(CHART_COLORS)[index % Object.values(CHART_COLORS).length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-card/50">
              <CardHeader><CardTitle>Reorder Recommendations</CardTitle></CardHeader>
              <CardContent>
                {liveReorderAlerts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">All items within healthy stock levels.</p>
                ) : (
                  <ul className="space-y-2">
                    {liveReorderAlerts.map((i) => (
                      <li key={i.id}>
                        <button
                          type="button"
                          onClick={() => handleReorderAlertClick(i)}
                          className="flex w-full items-start justify-between gap-4 rounded-lg border border-border/40 p-3 text-left text-sm transition-colors hover:bg-muted/30"
                        >
                          <div>
                            <p className="font-medium">{i.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {i.sku} · {formatNumber(i.quantity)} {i.unit} on hand
                            </p>
                          </div>
                          <p className="text-right text-xs text-warning">{getReorderRecommendation(i)}</p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Enterprise tab — re-enable when BOM/locations/lots are needed
        <TabsContent value="enterprise">
          <InventoryEnterprisePanel />
        </TabsContent>
        */}
      </Tabs>

      <EntityFormDialog
        open={!!selectedItem}
        onOpenChange={(o) => !o && setSelectedItem(null)}
        title="SKU Details"
        description={selectedItem?.sku}
        submitLabel="Close"
        contentClassName="sm:max-w-xl"
        onSubmit={() => setSelectedItem(null)}
      >
        {selectedItem ? (
          <InventoryItemDetail item={selectedItem} config={config} movements={movements} />
        ) : null}
      </EntityFormDialog>

      <InventoryItemFormDialog
        open={itemDialogOpen}
        onOpenChange={(open) => {
          setItemDialogOpen(open);
          if (!open) setEditingItem(null);
        }}
        editingItem={editingItem}
        config={config}
        factoryId={defaultFactoryId}
        viewScope={viewScope}
        isSubmitting={mutate.isPending}
        onSubmit={handleItemFormSubmit}
        onGenerateSku={handleGenerateSku}
      />

      <EntityFormDialog open={movementDialogOpen} onOpenChange={setMovementDialogOpen} title="Record Movement" submitLabel="Post Movement" isSubmitting={mutate.isPending} onSubmit={submitMovement}>
        <div className="space-y-2"><Label>Item</Label>
          <Select value={movementForm.item_id} onValueChange={(v) => setMovementForm((f) => ({ ...f, item_id: v, factory_id: items.find((i) => i.id === v)?.factory_id ?? f.factory_id }))}>
            <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
            <SelectContent>{items.map((i) => <SelectItem key={i.id} value={i.id}>{i.name} ({i.sku})</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Type</Label>
            <Select value={movementForm.movement_type} onValueChange={(v) => setMovementForm((f) => ({ ...f, movement_type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MOVEMENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Quantity</Label><Input type="number" min={0} value={movementForm.quantity} onChange={(e) => setMovementForm((f) => ({ ...f, quantity: e.target.value }))} /></div>
        </div>
        <div className="space-y-2"><Label>Notes</Label><Textarea value={movementForm.notes} onChange={(e) => setMovementForm((f) => ({ ...f, notes: e.target.value }))} rows={2} /></div>
      </EntityFormDialog>

      <EntityFormDialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen} title="Transfer Stock" submitLabel="Transfer" isSubmitting={mutate.isPending} onSubmit={submitTransfer}>
        <div className="space-y-2"><Label>From Item</Label>
          <Select value={transferForm.from_item_id} onValueChange={(v) => setTransferForm((f) => ({ ...f, from_item_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
            <SelectContent>{items.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2"><Label>To Item</Label>
          <Select value={transferForm.to_item_id} onValueChange={(v) => setTransferForm((f) => ({ ...f, to_item_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Destination" /></SelectTrigger>
            <SelectContent>{items.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2"><Label>Quantity</Label><Input type="number" min={1} value={transferForm.quantity} onChange={(e) => setTransferForm((f) => ({ ...f, quantity: e.target.value }))} /></div>
        <div className="space-y-2"><Label>Notes</Label><Textarea value={transferForm.notes} onChange={(e) => setTransferForm((f) => ({ ...f, notes: e.target.value }))} rows={2} /></div>
      </EntityFormDialog>

      <EntityFormDialog open={countDialogOpen} onOpenChange={setCountDialogOpen} title="Physical Count" submitLabel="Submit" isSubmitting={mutate.isPending} onSubmit={submitCount}>
        <div className="space-y-2"><Label>Item</Label>
          <Select value={countForm.item_id} onValueChange={(v) => setCountForm((f) => ({ ...f, item_id: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{items.map((i) => <SelectItem key={i.id} value={i.id}>{i.name} — system: {i.quantity}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2"><Label>Counted Quantity</Label><Input type="number" value={countForm.counted_quantity} onChange={(e) => setCountForm((f) => ({ ...f, counted_quantity: e.target.value }))} /></div>
      </EntityFormDialog>

      <EntityFormDialog open={bulkCountOpen} onOpenChange={setBulkCountOpen} title="Cycle Count Session" description="Enter counted quantities for multiple SKUs" submitLabel="Submit All Counts" isSubmitting={mutate.isPending} onSubmit={submitBulkCount}>
        <div className="max-h-80 space-y-3 overflow-y-auto">
          {items.map((i) => (
            <div key={i.id} className="flex items-center gap-3 rounded-lg border border-border/40 p-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{i.name}</p>
                <p className="text-xs text-muted-foreground">System: {formatNumber(i.quantity)} {i.unit}</p>
              </div>
              <Input type="number" className="w-24" placeholder="Count" value={bulkCounts[i.id] ?? ""} onChange={(e) => setBulkCounts((p) => ({ ...p, [i.id]: e.target.value }))} />
            </div>
          ))}
        </div>
      </EntityFormDialog>

      <EntityFormDialog open={reserveDialogOpen} onOpenChange={setReserveDialogOpen} title="Reserve / Release Stock" submitLabel="Confirm" isSubmitting={mutate.isPending} onSubmit={submitReserve}>
        <div className="space-y-2"><Label>Action</Label>
          <Select value={reserveForm.action} onValueChange={(v) => setReserveForm((f) => ({ ...f, action: v as "reserve" | "release" }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="reserve">Reserve (for orders)</SelectItem>
              <SelectItem value="release">Release reservation</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2"><Label>Quantity</Label><Input type="number" min={1} value={reserveForm.quantity} onChange={(e) => setReserveForm((f) => ({ ...f, quantity: e.target.value }))} /></div>
      </EntityFormDialog>

      <ConfirmDialog open={!!deleteItem} onOpenChange={(o) => !o && setDeleteItem(null)} title="Deactivate SKU" description={`Deactivate ${deleteItem?.name}?`} confirmLabel="Deactivate" variant="destructive" loading={mutate.isPending} onConfirm={() => {
        if (!deleteItem) return;
        mutate.mutate({ action: "delete_item", id: deleteItem.id }, { onSuccess: () => { toast.success("Item deactivated"); setDeleteItem(null); } });
      }} />
    </div>
  );
}
