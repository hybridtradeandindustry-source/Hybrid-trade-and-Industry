"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { CounterStepper } from "@/components/mobile/counter-stepper";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import type { InventoryItem } from "@/types";

type MovementType = "receipt" | "issue";

export default function InventoryMovementPage() {
  const { user } = useAuth();
  const { addToQueue, isOnline } = useOfflineStore();
  const { data, movementMutation } = useInventory();
  const [itemId, setItemId] = useState("");
  const [movementType, setMovementType] = useState<MovementType>("receipt");
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const items = useMemo(() => {
    const allItems = (data?.items ?? []) as InventoryItem[];
    if (!user?.factory_id) return allItems;
    return allItems.filter((i) => i.factory_id === user.factory_id);
  }, [data?.items, user?.factory_id]);

  const selectedItem = items.find((i) => i.id === itemId);

  const handleSubmit = async () => {
    if (!selectedItem || !user) return;
    setSubmitting(true);

    const payload = {
      factory_id: selectedItem.factory_id,
      item_id: selectedItem.id,
      quantity:
        movementType === "issue"
          ? -Math.abs(quantity)
          : Math.abs(quantity),
      movement_type: movementType,
    };

    try {
      if (isOnline) {
        await movementMutation.mutateAsync(payload);
        toast.success("Movement logged");
      } else {
        addToQueue({ type: "inventory_movement", payload });
        toast.success("Saved offline — will sync later");
      }
      setSubmitted(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to log movement");
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
          <h1 className="text-2xl font-bold">Movement Logged</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {movementType === "receipt" ? "Stock in" : "Stock out"}: {quantity}{" "}
            {selectedItem.unit} — {selectedItem.name}
          </p>
        </div>
        <div className="flex w-full flex-col gap-3">
          <Button
            size="lg"
            className="h-14 text-base"
            onClick={() => window.location.assign("/mobile/inventory-movement")}
          >
            Log Another
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
          <h1 className="text-xl font-bold">Inventory Movement</h1>
          <p className="text-sm text-muted-foreground">Record stock in or out</p>
        </div>
      </div>

      <section className="space-y-3">
        <label className="text-sm font-medium text-muted-foreground">Select item</label>
        <Select value={itemId} onValueChange={setItemId}>
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

      <section className="grid grid-cols-2 gap-3">
        {(
          [
            { type: "receipt" as const, label: "Stock In", icon: ArrowDownToLine },
            { type: "issue" as const, label: "Stock Out", icon: ArrowUpFromLine },
          ] as const
        ).map(({ type, label, icon: Icon }) => (
          <button
            key={type}
            type="button"
            onClick={() => setMovementType(type)}
            className={cn(
              "flex min-h-[80px] flex-col items-center justify-center gap-2 rounded-2xl border text-base font-semibold transition-all active:scale-[0.98]",
              movementType === type
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-card"
            )}
          >
            <Icon className="size-6" />
            {label}
          </button>
        ))}
      </section>

      {selectedItem ? (
        <>
          <CounterStepper
            label={`Quantity (${selectedItem.unit})`}
            value={quantity}
            onChange={setQuantity}
            min={1}
          />
          <Button
            className="h-14 w-full text-base"
            disabled={submitting}
            onClick={handleSubmit}
          >
            {submitting ? "Saving…" : "Log Movement"}
          </Button>
        </>
      ) : null}
    </div>
  );
}
