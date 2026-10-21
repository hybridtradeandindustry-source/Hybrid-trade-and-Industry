"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useProductionSettings } from "@/hooks/use-api";

export function DailyTargetSettingsPanel() {
  const { data: settings, isLoading, updateMutation } = useProductionSettings();
  // Drafts start null (no local edit yet) — the displayed value falls back to the live
  // setting, so it always reflects the server without a useEffect syncing state from props.
  const [valueDraft, setValueDraft] = useState<string | null>(null);
  const [cementDraft, setCementDraft] = useState<string | null>(null);

  const value = valueDraft ?? (settings ? String(settings.default_daily_target_plates) : "");
  const cementKgPerBag = cementDraft ?? (settings ? String(settings.cement_kg_per_bag) : "");

  const dirty = settings != null && valueDraft != null && valueDraft !== String(settings.default_daily_target_plates);
  const cementDirty =
    settings != null && cementDraft != null && cementDraft !== String(settings.cement_kg_per_bag);

  const handleSave = () => {
    const target = Number(value);
    if (!Number.isFinite(target) || target <= 0) {
      toast.error("Enter a valid daily target greater than 0");
      return;
    }
    updateMutation.mutate(
      { default_daily_target_plates: target },
      {
        onSuccess: () => {
          toast.success("Default daily target updated.");
          setValueDraft(null);
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Failed to update daily target"),
      }
    );
  };

  const handleSaveCementKgPerBag = () => {
    const kgPerBag = Number(cementKgPerBag);
    if (!Number.isFinite(kgPerBag) || kgPerBag <= 0) {
      toast.error("Enter a valid kg-per-bag value greater than 0");
      return;
    }
    updateMutation.mutate(
      { cement_kg_per_bag: kgPerBag },
      {
        onSuccess: () => {
          toast.success("Cement kg per bag updated.");
          setCementDraft(null);
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Failed to update cement kg per bag"),
      }
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Production Settings</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Defaults used across daily logs, purchasing, and capacity predictions for the block factory.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Default Daily Target</CardTitle>
            <CardDescription className="text-xs">
              Used whenever a day&apos;s log doesn&apos;t set its own target.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="daily-target" className="text-xs">
                Plates / day
              </Label>
              <Input
                id="daily-target"
                type="number"
                min={1}
                step={1}
                value={value}
                disabled={isLoading}
                onChange={(e) => setValueDraft(e.target.value)}
                className="h-8 w-32 text-sm font-mono"
              />
            </div>
            <Button size="sm" disabled={!dirty || updateMutation.isPending} onClick={handleSave}>
              <Save className="size-3.5" />
              Save
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Cement Kg per Bag</CardTitle>
            <CardDescription className="text-xs">
              Used to convert between kg and bags in purchasing and daily logs.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cement-kg-per-bag" className="text-xs">
                Kg / bag
              </Label>
              <Input
                id="cement-kg-per-bag"
                type="number"
                min={0.01}
                step="0.01"
                value={cementKgPerBag}
                disabled={isLoading}
                onChange={(e) => setCementDraft(e.target.value)}
                className="h-8 w-32 text-sm font-mono"
              />
            </div>
            <Button
              size="sm"
              disabled={!cementDirty || updateMutation.isPending}
              onClick={handleSaveCementKgPerBag}
            >
              <Save className="size-3.5" />
              Save
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
