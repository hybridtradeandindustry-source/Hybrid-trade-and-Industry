"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Loader2,
  MapPin,
  Navigation,
} from "lucide-react";
import { toast } from "sonner";
import { SignaturePad } from "@/components/mobile/signature-pad";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOrders } from "@/hooks/use-api";
import { useAuth } from "@/providers/auth-provider";
import { useOfflineStore } from "@/stores/app-store";
import { ORDER_STATUS_LABELS, type Order, type OrderStatus } from "@/types";
import { cn, formatCurrency } from "@/lib/utils";

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const DELIVERABLE_STATUSES: OrderStatus[] = ["ordered"];

export default function DeliveryConfirmPage() {
  const { user } = useAuth();
  const { addToQueue, isOnline } = useOfflineStore();
  const { data, deliverMutation } = useOrders();
  const [orderId, setOrderId] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const orders = useMemo(
    () =>
      ((data ?? []) as Order[]).filter((o) => DELIVERABLE_STATUSES.includes(o.status)),
    [data]
  );

  const selectedOrder = orders.find((o) => o.id === orderId);

  useEffect(() => {
    if (!orderId && orders.length > 0) {
      const openOrder = orders.find((o) => o.status === "ordered");
      setOrderId(openOrder?.id ?? orders[0].id);
    }
  }, [orderId, orders]);

  const captureGps = () => {
    if (!navigator.geolocation) {
      setGpsError("GPS not available on this device");
      return;
    }
    setGpsLoading(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setGpsLoading(false);
        toast.success("Location captured");
      },
      () => {
        setGpsError("Could not get location — enable GPS permissions");
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await fileToBase64(file);
    setPhotoPreview(base64);
  };

  const canSubmit = orderId && photoPreview && signature && gps;

  const handleSubmit = async () => {
    if (!selectedOrder || !user || !photoPreview || !signature || !gps) return;
    setSubmitting(true);

    const payload = {
      order_id: selectedOrder.id,
      photo_url: photoPreview,
      signature_url: signature,
      gps_latitude: gps.lat,
      gps_longitude: gps.lng,
    };

    try {
      if (isOnline) {
        await deliverMutation.mutateAsync(payload);
        toast.success("Delivery confirmed");
      } else {
        addToQueue({ type: "delivery", payload });
        toast.success("Saved offline — will sync later");
      }
      setSubmitted(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to confirm delivery");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted && selectedOrder) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-6 text-center">
        <div className="flex size-20 items-center justify-center rounded-full bg-success/15 text-success">
          <CheckCircle2 className="size-10" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Delivery Confirmed</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {selectedOrder.order_number} — {selectedOrder.customer?.name}
          </p>
        </div>
        <div className="flex w-full flex-col gap-3">
          <Button
            size="lg"
            className="h-14 text-base"
            onClick={() => window.location.assign("/mobile/delivery")}
          >
            Confirm Another
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
          <h1 className="text-xl font-bold">Confirm Delivery</h1>
          <p className="text-sm text-muted-foreground">Proof of delivery capture</p>
        </div>
      </div>

      <section className="space-y-3">
        <label className="text-sm font-medium text-muted-foreground">
          Select order
        </label>
        <Select value={orderId} onValueChange={setOrderId}>
          <SelectTrigger className="h-14 rounded-xl text-base">
            <SelectValue placeholder="Choose delivery order" />
          </SelectTrigger>
          <SelectContent>
            {orders.map((order) => (
              <SelectItem key={order.id} value={order.id} className="py-3">
                <span className="font-medium">{order.order_number}</span>
                <span className="text-muted-foreground">
                  {" "}
                  — {order.customer?.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedOrder ? (
          <div className="rounded-2xl border border-border bg-card p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <span className="font-medium">
                {ORDER_STATUS_LABELS[selectedOrder.status]}
              </span>
            </div>
            <div className="mt-2 flex justify-between">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-medium">
                {formatCurrency(selectedOrder.total_amount)}
              </span>
            </div>
            {selectedOrder.delivery_date ? (
              <div className="mt-2 flex justify-between">
                <span className="text-muted-foreground">Due</span>
                <span className="font-medium">{selectedOrder.delivery_date}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section>
        <label className="mb-3 block text-sm font-medium text-muted-foreground">
          Delivery photo
        </label>
        <label className="block cursor-pointer">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={handlePhotoChange}
          />
          <div
            className={cn(
              "flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed transition-colors",
              photoPreview
                ? "border-primary/50 bg-primary/5 p-2"
                : "border-border bg-card hover:border-primary/40"
            )}
          >
            {photoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoPreview}
                alt="Delivery photo"
                className="max-h-40 rounded-xl object-contain"
              />
            ) : (
              <>
                <Camera className="size-10 text-muted-foreground" />
                <span className="font-medium">Tap to take photo</span>
              </>
            )}
          </div>
        </label>
      </section>

      <SignaturePad onChange={setSignature} />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">GPS location</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 gap-2"
            onClick={captureGps}
            disabled={gpsLoading}
          >
            {gpsLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Navigation className="size-4" />
            )}
            {gps ? "Recapture" : "Capture GPS"}
          </Button>
        </div>
        <div
          className={cn(
            "flex min-h-[72px] items-center gap-3 rounded-2xl border px-4",
            gps ? "border-success/30 bg-success/10" : "border-border bg-card"
          )}
        >
          <MapPin
            className={cn("size-5 shrink-0", gps ? "text-success" : "text-muted-foreground")}
          />
          {gps ? (
            <div className="text-sm">
              <p className="font-medium text-success">Location captured</p>
              <p className="tabular-nums text-muted-foreground">
                {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {gpsError ?? "Tap Capture GPS to record delivery location"}
            </p>
          )}
        </div>
      </section>

      <Button
        className="h-14 w-full text-base"
        disabled={!canSubmit || submitting}
        onClick={handleSubmit}
      >
        {submitting ? "Confirming…" : "Confirm Delivery"}
      </Button>

      {!canSubmit ? (
        <p className="text-center text-xs text-muted-foreground">
          Photo, signature, and GPS are required
        </p>
      ) : null}
    </div>
  );
}
