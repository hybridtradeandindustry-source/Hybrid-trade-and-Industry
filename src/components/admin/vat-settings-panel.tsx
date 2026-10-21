"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFinanceSettings } from "@/hooks/use-api";

export function VatSettingsPanel() {
  const { data: settings, isLoading, updateMutation } = useFinanceSettings();
  const [value, setValue] = useState("");

  useEffect(() => {
    if (settings) setValue(String(settings.vat_rate_percent));
  }, [settings]);

  const dirty = settings != null && value !== String(settings.vat_rate_percent);

  const handleSave = () => {
    const rate = Number(value);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      toast.error("Enter a valid rate between 0 and 100");
      return;
    }
    updateMutation.mutate(
      { vat_rate_percent: rate },
      {
        onSuccess: () => toast.success("VAT rate updated."),
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Failed to update VAT rate"),
      }
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">VAT</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Default VAT rate applied when an order is sold with VAT. Existing orders keep the rate
          that was in effect when they were created.
        </p>
      </div>
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Default Rate</CardTitle>
          <CardDescription className="text-xs">
            Added on top of the discounted subtotal when &quot;Sell with VAT&quot; is selected.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="vat-rate" className="text-xs">
              Rate (%)
            </Label>
            <Input
              id="vat-rate"
              type="number"
              min={0}
              max={100}
              step="0.1"
              value={value}
              disabled={isLoading}
              onChange={(e) => setValue(e.target.value)}
              className="h-8 w-32 text-sm font-mono"
            />
          </div>
          <Button size="sm" disabled={!dirty || updateMutation.isPending} onClick={handleSave}>
            <Save className="size-3.5" />
            Save
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
