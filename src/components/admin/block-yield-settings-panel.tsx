"use client";

import { useState } from "react";
import { RotateCcw, Save, Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { BLOCK_YIELDS, type BlockSizeCm } from "@/lib/block-factory/yields";
import { useBlockYieldSettings, type YieldOverrideMap } from "@/providers/block-yield-settings-provider";
import { useProductionSettings } from "@/hooks/use-api";

const BLOCK_SIZES: BlockSizeCm[] = [20, 15, 10, 24];

type SizeFormState = {
  blocksPerCementBag: string;
  platesPerBag: string;
  blocksPerPlate: string;
  blocksPerPolicheLoad: string;
};

function initFormState(
  yields: ReturnType<typeof useBlockYieldSettings>["yields"]
): Record<BlockSizeCm, SizeFormState> {
  const result = {} as Record<BlockSizeCm, SizeFormState>;
  for (const size of BLOCK_SIZES) {
    const y = yields[size];
    result[size] = {
      blocksPerCementBag: String(y.blocksPerCementBag),
      platesPerBag: String(y.platesPerBag),
      blocksPerPlate: String(y.blocksPerPlate),
      blocksPerPolicheLoad: String(y.blocksPerPolicheLoad),
    };
  }
  return result;
}

export function BlockYieldSettingsPanel() {
  const { yields, setOverrides, resetToDefaults } = useBlockYieldSettings();
  const { data: productionSettings } = useProductionSettings();
  const cementKgPerBag = productionSettings?.cement_kg_per_bag ?? 45;
  const [form, setForm] = useState<Record<BlockSizeCm, SizeFormState>>(() =>
    initFormState(yields)
  );
  const [dirty, setDirty] = useState(false);

  function updateField(size: BlockSizeCm, field: keyof SizeFormState, value: string) {
    setForm((f) => ({ ...f, [size]: { ...f[size], [field]: value } }));
    setDirty(true);
  }

  function handleSave() {
    const overrides: YieldOverrideMap = {};
    for (const size of BLOCK_SIZES) {
      const f = form[size];
      const bpc = Number(f.blocksPerCementBag);
      const ppb = Number(f.platesPerBag);
      const bpp = Number(f.blocksPerPlate);
      const bpl = Number(f.blocksPerPolicheLoad);

      if ([bpc, ppb, bpp, bpl].some((n) => isNaN(n) || n <= 0)) {
        toast.error(`Invalid values for ${size}cm block — all numbers must be positive.`);
        return;
      }

      const def = BLOCK_YIELDS[size];
      const isChanged =
        bpc !== def.blocksPerCementBag ||
        ppb !== def.platesPerBag ||
        bpp !== def.blocksPerPlate ||
        bpl !== def.blocksPerPolicheLoad;

      if (isChanged) {
        overrides[size] = {
          blocksPerCementBag: bpc,
          platesPerBag: ppb,
          blocksPerPlate: bpp,
          blocksPerPolicheLoad: bpl,
        };
      }
    }

    setOverrides(overrides);
    setDirty(false);
    toast.success("Block yield assumptions saved — calculations updated app-wide.");
  }

  function handleReset() {
    resetToDefaults();
    setForm(initFormState(
      // reinitialize with defaults
      Object.fromEntries(
        BLOCK_SIZES.map((s) => [s, BLOCK_YIELDS[s]])
      ) as typeof yields
    ));
    setDirty(false);
    toast.success("Reset to factory defaults.");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Block Yield Assumptions</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure how many blocks are produced per cement bag, poliche load, and plate for each block size.
            These numbers are used throughout the app to calculate material requirements, batch predictions, and capacity.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="size-3.5" />
            Reset Defaults
          </Button>
          <Button size="sm" disabled={!dirty} onClick={handleSave}>
            <Save className="size-3.5" />
            Save
          </Button>
        </div>
      </div>

      {/* Global constant */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-center gap-3 p-4">
          <Info className="size-4 text-primary shrink-0" />
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">Cement bag weight:</span>{" "}
            {cementKgPerBag} kg / bag — editable under Production Settings above.
          </p>
        </CardContent>
      </Card>

      {/* Per-size tables */}
      <div className="grid gap-5 md:grid-cols-2">
        {BLOCK_SIZES.map((size) => {
          const def = BLOCK_YIELDS[size];
          const f = form[size];

          // Live calculation preview
          const bpc = Number(f.blocksPerCementBag) || 0;
          const bpl = Number(f.blocksPerPolicheLoad) || 0;
          const kgPerBlock = bpc > 0 ? (cementKgPerBag / bpc).toFixed(2) : "—";

          return (
            <Card key={size} className="border-border/60">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{size}cm Block</CardTitle>
                  <span className="text-[10px] font-mono bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                    BLK-FG-{def.skuSuffix}
                  </span>
                </div>
                <CardDescription className="text-xs">
                  ~{kgPerBlock} kg cement/block · 1 poliche load = {f.blocksPerPolicheLoad} blocks
                </CardDescription>
              </CardHeader>
              <Separator />
              <CardContent className="pt-4 grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor={`bpc-${size}`} className="text-xs">
                    Blocks / cement bag
                  </Label>
                  <Input
                    id={`bpc-${size}`}
                    type="number"
                    min={1}
                    step={1}
                    value={f.blocksPerCementBag}
                    onChange={(e) => updateField(size, "blocksPerCementBag", e.target.value)}
                    className="h-8 text-sm font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Default: {def.blocksPerCementBag}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`bpl-${size}`} className="text-xs">
                    Blocks / poliche load
                  </Label>
                  <Input
                    id={`bpl-${size}`}
                    type="number"
                    min={1}
                    step={10}
                    value={f.blocksPerPolicheLoad}
                    onChange={(e) => updateField(size, "blocksPerPolicheLoad", e.target.value)}
                    className="h-8 text-sm font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Default: {def.blocksPerPolicheLoad}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`ppb-${size}`} className="text-xs">
                    Plates / bag
                  </Label>
                  <Input
                    id={`ppb-${size}`}
                    type="number"
                    min={1}
                    step={1}
                    value={f.platesPerBag}
                    onChange={(e) => updateField(size, "platesPerBag", e.target.value)}
                    className="h-8 text-sm font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Default: {def.platesPerBag}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`bpp-${size}`} className="text-xs">
                    Blocks / plate
                  </Label>
                  <Input
                    id={`bpp-${size}`}
                    type="number"
                    min={1}
                    step={1}
                    value={f.blocksPerPlate}
                    onChange={(e) => updateField(size, "blocksPerPlate", e.target.value)}
                    className="h-8 text-sm font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Default: {def.blocksPerPlate}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
