"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Camera, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { CounterStepper } from "@/components/mobile/counter-stepper";
import { StepIndicator } from "@/components/mobile/step-indicator";
import { Button } from "@/components/ui/button";
import { useProduction } from "@/hooks/use-api";
import { useAuth } from "@/providers/auth-provider";
import { useOfflineStore } from "@/stores/app-store";
import { CHECKPOINT_LABELS, FACTORY_IDS, type BlockCheckpoint, type ProductionBatch } from "@/types";
import { cn } from "@/lib/utils";

const STEPS = ["Counts", "Photo"];

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ProductionCountPage() {
  const { user } = useAuth();
  const { addToQueue, isOnline } = useOfflineStore();
  const { data } = useProduction();
  const [step, setStep] = useState(1);
  const checkpoint: BlockCheckpoint = "after_curing";
  const [goodCount, setGoodCount] = useState(0);
  const [damagedCount, setDamagedCount] = useState(0);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const factoryId = user?.factory_id || FACTORY_IDS.block;
  const batches = (data?.batches ?? []) as ProductionBatch[];
  const counts = (data?.counts ?? []) as any[];
  const activeBatch = useMemo(
    () => batches.find((b) => b.factory_id === factoryId) ?? batches[0],
    [batches, factoryId]
  );

  useEffect(() => {
    if (!activeBatch) {
      setDamagedCount(0);
      return;
    }
    const good = Number(goodCount) || 0;
    const dryingCount = counts.find(
      (c) => c.batch_id === activeBatch.id && c.checkpoint === "after_drying"
    );
    const batchCount = counts.find(
      (c) => c.batch_id === activeBatch.id && c.checkpoint === "batch_count"
    );
    const startingQty = dryingCount
      ? (dryingCount.good_count ?? 0)
      : (batchCount ? (batchCount.good_count ?? 0) : (activeBatch.planned_quantity || 0));
    setDamagedCount(Math.max(0, startingQty - good));
  }, [goodCount, activeBatch, counts]);

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await fileToBase64(file);
    setPhotoPreview(base64);
  };

  const handleSubmit = async () => {
    if (!user || !activeBatch) return;
    setSubmitting(true);

    const payload = {
      factory_id: factoryId,
      batch_id: activeBatch.id,
      checkpoint,
      good_count: goodCount,
      damaged_count: damagedCount,
      photo_url: photoPreview ?? undefined,
    };

    try {
      addToQueue({ type: "production_count", payload });
      await new Promise((r) => setTimeout(r, 400));
      setSubmitted(true);
      toast.success(
        isOnline ? "Production count saved" : "Saved offline — will sync later"
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save count");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-6 text-center">
        <div className="flex size-20 items-center justify-center rounded-full bg-success/15 text-success">
          <CheckCircle2 className="size-10" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Count Recorded</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {goodCount} good · {damagedCount} damaged at{" "}
            {CHECKPOINT_LABELS[checkpoint]}
          </p>
        </div>
        <div className="flex w-full flex-col gap-3">
          <Button
            size="lg"
            className="h-14 text-base"
            onClick={() => window.location.assign("/mobile/production")}
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
          <h1 className="text-xl font-bold">Production Count</h1>
          <p className="text-sm text-muted-foreground">
            {activeBatch?.batch_number ?? "No active batch"}
          </p>
        </div>
      </div>

      <StepIndicator steps={STEPS} currentStep={step} />

      {step === 1 ? (
        <section className="space-y-4">
          <CounterStepper
            label="Good units"
            value={goodCount}
            onChange={setGoodCount}
            variant="success"
          />
          <div className="rounded-2xl border border-border bg-muted/30 p-5 flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Damaged Units (Calculated Automatically)
            </span>
            <span className="text-2xl font-bold font-mono text-destructive">
              {damagedCount}
            </span>
          </div>
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="h-14 flex-1 text-base"
              asChild
            >
              <Link href="/mobile">Cancel</Link>
            </Button>
            <Button className="h-14 flex-1 text-base" onClick={() => setStep(2)}>
              Continue
            </Button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="space-y-4">
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
                "flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed transition-colors",
                photoPreview
                  ? "border-primary/50 bg-primary/5"
                  : "border-border bg-card hover:border-primary/40"
              )}
            >
              {photoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoPreview}
                  alt="Production photo preview"
                  className="max-h-48 rounded-xl object-contain"
                />
              ) : (
                <>
                  <Camera className="size-12 text-muted-foreground" />
                  <span className="text-base font-medium">Tap to capture photo</span>
                  <span className="text-sm text-muted-foreground">Optional but recommended</span>
                </>
              )}
            </div>
          </label>

          <div className="rounded-2xl border border-border bg-card p-4 text-sm">
            <p className="font-medium">Summary</p>
            <dl className="mt-2 space-y-1 text-muted-foreground">
              <div className="flex justify-between">
                <dt>Checkpoint</dt>
                <dd className="font-medium text-foreground">
                  {CHECKPOINT_LABELS[checkpoint]}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Good / Damaged</dt>
                <dd className="font-medium text-foreground">
                  {goodCount} / {damagedCount}
                </dd>
              </div>
            </dl>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="h-14 flex-1 text-base"
              onClick={() => setStep(1)}
            >
              Back
            </Button>
            <Button
              className="h-14 flex-1 text-base"
              disabled={submitting || !activeBatch}
              onClick={handleSubmit}
            >
              {submitting ? "Saving…" : "Submit Count"}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
