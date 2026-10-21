"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useInventory } from "@/hooks/use-api";
import { useAuth } from "@/providers/auth-provider";
import { useOfflineStore } from "@/stores/app-store";
import { cn, formatNumber } from "@/lib/utils";
import type { InventoryItem } from "@/types";

export default function StockCountPage() {
  const { user } = useAuth();
  const { addToQueue, isOnline } = useOfflineStore();
  const { data, stockCountMutation } = useInventory();
  const [itemId, setItemId] = useState<string>("");
  const [countedQty, setCountedQty] = useState(0);
  const [blindMode, setBlindMode] = useState(true);
  const [barcode, setBarcode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const items = useMemo(() => {
    const allItems = (data?.items ?? []) as InventoryItem[];
    if (!user?.factory_id) return allItems;
    return allItems.filter((i) => i.factory_id === user.factory_id);
  }, [data?.items, user?.factory_id]);

  const selectedItem = items.find((i) => i.id === itemId);
  const systemStock = selectedItem?.quantity ?? 0;
  const difference = countedQty - systemStock;

  const handleSubmit = async () => {
    if (!selectedItem || !user) return;
    setSubmitting(true);

    const payload = {
      action: blindMode ? "blind_count" : undefined,
      factory_id: selectedItem.factory_id,
      item_id: selectedItem.id,
      counted_quantity: countedQty,
      is_blind: blindMode,
      barcode_scanned: barcode || selectedItem.barcode || selectedItem.sku,
    };

    try {
      if (isOnline) {
        await stockCountMutation.mutateAsync(blindMode ? payload : { factory_id: payload.factory_id, item_id: payload.item_id, counted_quantity: payload.counted_quantity });
        toast.success("Stock count saved");
      } else {
        addToQueue({ type: "stock_count", payload });
        toast.success("Saved offline — will sync later");
      }
      setSubmitted(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save stock count");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted && selectedItem) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-6 text-center">
        <div className="flex size-20 items-center justify-center rounded-full bg-success/15 text-success">
          <CheckCircle2 className="size-10" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Count Submitted</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {selectedItem.name}: {countedQty} {selectedItem.unit}
            {difference !== 0 ? (
              <span
                className={cn(
                  " block font-medium",
                  difference > 0 ? "text-success" : "text-destructive"
                )}
              >
                {difference > 0 ? "+" : ""}
                {formatNumber(difference)} vs system
              </span>
            ) : (
              <span className=" block text-success">Matches system stock</span>
            )}
          </p>
        </div>
        <div className="flex w-full flex-col gap-3">
          <Button asChild size="lg" className="h-14 text-base">
            <Link href="/mobile/stock-count">Count Another</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-14 text-base">
            <Link href="/mobile">Back to Home</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="size-12 rounded-xl" asChild>
          <Link href="/mobile" aria-label="Back">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-bold">Stock Count</h1>
          <p className="text-sm text-muted-foreground">Count items on the floor</p>
        </div>
      </div>

      <section className="space-y-3">
        <label className="text-sm font-medium text-muted-foreground">Select item</label>
        <Select value={itemId} onValueChange={(v) => {
          setItemId(v);
          const item = items.find((i) => i.id === v);
          setCountedQty(item?.quantity ?? 0);
        }}>
          <SelectTrigger className="h-14 rounded-xl text-base">
            <SelectValue placeholder="Choose inventory item" />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.id} value={item.id} className="py-3 text-base">
                {item.name} ({item.sku})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card p-4">
        <div>
          <p className="text-sm font-medium">Blind count</p>
          <p className="text-xs text-muted-foreground">Hide system qty until after submit</p>
        </div>
        <Switch checked={blindMode} onCheckedChange={setBlindMode} />
      </div>

      {selectedItem ? (
        <>
          <section className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Barcode / SKU</label>
            <Input
              className="h-12 font-mono"
              placeholder={selectedItem.barcode ?? selectedItem.sku}
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
            />
          </section>

          {!blindMode && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                System stock
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {formatNumber(systemStock)}
                <span className="ml-1 text-sm font-normal text-muted-foreground">
                  {selectedItem.unit}
                </span>
              </p>
            </div>
            <div
              className={cn(
                "rounded-2xl border p-4",
                difference === 0
                  ? "border-border bg-card"
                  : difference > 0
                    ? "border-success/30 bg-success/10"
                    : "border-destructive/30 bg-destructive/10"
              )}
            >
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Difference
              </p>
              <p
                className={cn(
                  "mt-1 text-2xl font-bold tabular-nums",
                  difference > 0
                    ? "text-success"
                    : difference < 0
                      ? "text-destructive"
                      : ""
                )}
              >
                {difference > 0 ? "+" : ""}
                {formatNumber(difference)}
              </p>
            </div>
          </div>
          )}

          <section className="rounded-2xl border border-border bg-card p-4">
            <p className="mb-3 text-sm font-medium text-muted-foreground">
              Counted quantity
            </p>
            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-14 rounded-xl"
                onClick={() => setCountedQty((q) => Math.max(0, q - 1))}
                disabled={countedQty <= 0}
              >
                <Minus className="size-6" />
              </Button>
              <span className="text-4xl font-bold tabular-nums">{countedQty}</span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-14 rounded-xl"
                onClick={() => setCountedQty((q) => q + 1)}
              >
                <Plus className="size-6" />
              </Button>
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {selectedItem.unit}
            </p>
          </section>

          <Button
            className="h-14 w-full text-base"
            disabled={submitting}
            onClick={handleSubmit}
          >
            {submitting ? "Saving…" : "Submit Count"}
          </Button>
        </>
      ) : null}
    </div>
  );
}
