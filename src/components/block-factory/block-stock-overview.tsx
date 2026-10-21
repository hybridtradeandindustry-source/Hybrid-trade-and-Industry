"use client";

import { AlertTriangle, Boxes, Factory, Package, Recycle } from "lucide-react";
import { MetricCard } from "@/components/ui/metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatNumber, formatPolicheLoads } from "@/lib/utils";
import { BLOCK_YIELDS, type BlockSizeCm } from "@/lib/block-factory/yields";
import type { BlockStockView } from "@/lib/block-factory/stock-snapshot";

function StockAmount({
  onHand,
  used,
  received,
  unit,
}: {
  onHand: number;
  used: number;
  received?: number;
  unit: string;
}) {
  return (
    <div className="space-y-1 text-sm">
      <p>
        <span className="text-muted-foreground">In stock: </span>
        <span className="font-semibold">
          {formatNumber(onHand)} {unit}
        </span>
      </p>
      <p className="text-muted-foreground">
        Used: {formatNumber(used)} {unit}
        {received != null && received > 0 ? ` · Received: ${formatNumber(received)} ${unit}` : ""}
      </p>
    </div>
  );
}

export function BlockStockOverview({ stock }: { stock: BlockStockView }) {
  const sizes = [20, 15, 10, 24] as BlockSizeCm[];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Cement"
          value={`${formatNumber(stock.cement.onHand)} bags`}
          icon={<Package className="size-4" />}
          className={stock.cement.lowStock ? "border-amber-500/30" : undefined}
          info="Cement bags currently on hand, available for production."
        />
        <MetricCard
          title="Poliche"
          value={`${formatPolicheLoads(stock.poliche.onHand)} loads`}
          icon={<Recycle className="size-4" />}
          className={stock.poliche.lowStock ? "border-amber-500/30" : undefined}
          info="Poliche loads currently on hand, available for production."
        />
        <MetricCard
          title="Ready to Ship"
          value={formatNumber(stock.totalFinishedBlocks)}
          icon={<Boxes className="size-4" />}
          info="Finished blocks across all sizes currently in stock and ready to ship."
        />
        <MetricCard
          title="Drying / Curing"
          value={`${formatNumber(stock.wip.onHand)} blocks`}
          icon={<Factory className="size-4" />}
          info="Blocks still in the drying/curing stage, not yet ready to ship."
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Raw Materials</CardTitle>
            <CardDescription>What you have on hand and what production has used</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border border-border/60 bg-muted/10 p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="font-medium">Cement</p>
                {stock.cement.lowStock && (
                  <Badge variant="destructive" className="gap-1 text-[10px]">
                    <AlertTriangle className="size-3" />
                    Low stock
                  </Badge>
                )}
              </div>
              <StockAmount
                onHand={stock.cement.onHand}
                used={stock.cement.used}
                received={stock.cement.received}
                unit="bags"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {formatNumber(stock.cement.kg)} kg in storage
              </p>
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/10 p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="font-medium">Poliche</p>
                {stock.poliche.lowStock && (
                  <Badge variant="destructive" className="gap-1 text-[10px]">
                    <AlertTriangle className="size-3" />
                    Low stock
                  </Badge>
                )}
              </div>
              <StockAmount
                onHand={stock.poliche.onHand}
                used={stock.poliche.used}
                received={stock.poliche.received}
                unit="loads"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Production Pipeline</CardTitle>
            <CardDescription>Blocks not yet ready for sale</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border/60 bg-muted/10 p-4">
              <p className="font-medium">{stock.wip.label}</p>
              <StockAmount
                onHand={stock.wip.onHand}
                used={stock.wip.used}
                received={stock.wip.received}
                unit="blocks"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Blocks currently drying or curing before finished-goods intake
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/10 p-4">
              <p className="font-medium">{stock.waste.label}</p>
              <p className="text-sm">
                <span className="text-muted-foreground">In stock: </span>
                <span className="font-semibold">{formatNumber(stock.waste.onHand)} blocks</span>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Ready to Ship — by Block Type</CardTitle>
          <CardDescription>
            Finished blocks available for customer orders. Updates when a batch is set to Completed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {sizes.map((size) => {
              const row = stock.finishedBySize[size];
              return (
                <div
                  key={size}
                  className="rounded-lg border border-border/60 bg-muted/10 p-4"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{BLOCK_YIELDS[size].label} block</p>
                    {row.lowStock && (
                      <Badge variant="secondary" className="text-[10px]">
                        Low
                      </Badge>
                    )}
                  </div>
                  <p className="text-2xl font-bold">{formatNumber(row.onHand)}</p>
                  <p className="text-xs text-muted-foreground">ready to ship</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Produced: {formatNumber(row.produced)} · Sold: {formatNumber(row.sold)}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {stock.spareParts.items > 0 && (
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Spare Parts</CardTitle>
            <CardDescription>Maintenance and machine parts</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-6 text-sm">
            <div>
              <p className="text-muted-foreground">SKUs</p>
              <p className="text-lg font-semibold">{stock.spareParts.items}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Total units</p>
              <p className="text-lg font-semibold">{formatNumber(stock.spareParts.totalUnits)}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
