"use client";

import { useMemo, useState } from "react";
import { Calculator, X, Delete, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useFinanceSettings, useInventory, useProductionSettings } from "@/hooks/use-api";
import { BLOCK_FACTORY_SKUS } from "@/lib/block-factory/inventory-sync";
import { BLOCK_SIZE_OPTIONS, CEMENT_KG_PER_BAG, type BlockSizeCm } from "@/lib/block-factory/yields";
import {
  BLOCK_OUTPUT_UNIT_OPTIONS,
  computeMaterialsCapacity,
  computeRecyclingYield,
  computeWasteCost,
  convertBlockOutput,
  convertCementWeight,
  evaluateExpression,
  type BlockOutputUnit,
  type CementWeightUnit,
} from "@/lib/calculator/engine";
import { applyOrderDiscount, computeWithholdingAmount, orderCreditAmount, type InventoryItem } from "@/types";

type HistoryEntry = { expr: string; result: string };

/** Trims to a readable number of decimals without forcing trailing zeros (unlike formatNumber). */
function formatResult(value: number, maxDecimals = 4): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: maxDecimals }).format(value);
}

function formatBirr(value: number): string {
  return `${formatResult(value, 2)} Birr`;
}

const KEYPAD_ROWS = [
  ["7", "8", "9", "/"],
  ["4", "5", "6", "*"],
  ["1", "2", "3", "-"],
  ["0", ".", "%", "+"],
];

function useCementAndPolicheItems() {
  const { data } = useInventory();
  const items = ((data as { items?: InventoryItem[] } | undefined)?.items ?? []) as InventoryItem[];
  return {
    cement: items.find((i) => i.sku === BLOCK_FACTORY_SKUS.cement) ?? null,
    poliche: items.find((i) => i.sku === BLOCK_FACTORY_SKUS.poliche) ?? null,
  };
}

function ResultBox({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold">
        {value}
        {unit ? ` ${unit}` : ""}
      </p>
    </div>
  );
}

function UnitSwapRow({
  fromLabel,
  toLabel,
  fromValue,
  toValue,
  onFromChange,
  onToChange,
  onSwap,
  options,
}: {
  fromLabel: string;
  toLabel: string;
  fromValue: string;
  toValue: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onSwap: () => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex items-end gap-2">
      <div className="flex-1 space-y-1.5">
        <Label className="text-xs">{fromLabel}</Label>
        <Select value={fromValue} onValueChange={onFromChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button variant="ghost" size="icon" className="mb-0.5 shrink-0" onClick={onSwap} aria-label="Swap units">
        <ArrowLeftRight className="size-4" />
      </Button>
      <div className="flex-1 space-y-1.5">
        <Label className="text-xs">{toLabel}</Label>
        <Select value={toValue} onValueChange={onToChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function BlockSizeSelect({ value, onChange }: { value: BlockSizeCm; onChange: (v: BlockSizeCm) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Block size</Label>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v) as BlockSizeCm)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {BLOCK_SIZE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={String(o.value)}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CalculatorTab() {
  const [expr, setExpr] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const liveResult = useMemo(() => evaluateExpression(expr), [expr]);

  const commit = () => {
    const value = evaluateExpression(expr);
    if (value === null || !expr.trim()) return;
    setHistory((h) => [{ expr, result: formatResult(value) }, ...h].slice(0, 20));
    setExpr(String(value));
  };

  const press = (key: string) => setExpr((e) => e + key);
  const clear = () => setExpr("");
  const backspace = () => setExpr((e) => e.slice(0, -1));

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
        <Input
          value={expr}
          onChange={(e) => setExpr(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && commit()}
          placeholder="e.g. 50000 / 1120"
          className="border-none bg-transparent text-right text-lg font-mono shadow-none focus-visible:ring-0"
        />
        <p className="px-3 pb-1 text-right text-xs text-muted-foreground">
          {liveResult !== null ? `= ${formatResult(liveResult)}` : " "}
        </p>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        <Button variant="outline" size="sm" onClick={clear} className="text-destructive">
          C
        </Button>
        <Button variant="outline" size="sm" onClick={backspace}>
          <Delete className="size-3.5" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => press("(")}>
          (
        </Button>
        <Button variant="outline" size="sm" onClick={() => press(")")}>
          )
        </Button>
        {KEYPAD_ROWS.map((row) =>
          row.map((key) => (
            <Button key={key} variant="outline" size="sm" onClick={() => press(key)}>
              {key}
            </Button>
          ))
        )}
        <Button size="sm" className="col-span-4" onClick={commit}>
          =
        </Button>
      </div>

      {history.length > 0 && (
        <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-border/60 p-2 text-xs">
          {history.map((h, i) => (
            <button
              key={i}
              onClick={() => setExpr(h.result)}
              className="flex w-full items-center justify-between rounded px-1.5 py-1 text-left hover:bg-muted/60"
            >
              <span className="text-muted-foreground">{h.expr}</span>
              <span className="font-medium">{h.result}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CementTab() {
  const { data } = useProductionSettings();
  const kgPerBag = Number((data as { cement_kg_per_bag?: number } | undefined)?.cement_kg_per_bag ?? CEMENT_KG_PER_BAG);

  const [amount, setAmount] = useState("");
  const [fromUnit, setFromUnit] = useState<CementWeightUnit>("kg");
  const [toUnit, setToUnit] = useState<CementWeightUnit>("bags");

  const parsed = Number(amount.replace(/,/g, ""));
  const result =
    amount.trim() && Number.isFinite(parsed) ? convertCementWeight(parsed, fromUnit, toUnit, kgPerBag) : null;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Using this org&apos;s cement bag weight: {formatResult(kgPerBag)} kg per bag.
      </p>

      <div className="space-y-1.5">
        <Label className="text-xs">Amount</Label>
        <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
      </div>

      <UnitSwapRow
        fromLabel="From"
        toLabel="To"
        fromValue={fromUnit}
        toValue={toUnit}
        onFromChange={(v) => setFromUnit(v as CementWeightUnit)}
        onToChange={(v) => setToUnit(v as CementWeightUnit)}
        onSwap={() => {
          setFromUnit(toUnit);
          setToUnit(fromUnit);
        }}
        options={[
          { value: "kg", label: "Kilograms (kg)" },
          { value: "bags", label: "Bags" },
        ]}
      />

      <ResultBox
        label="Result"
        value={result !== null ? formatResult(result) : "—"}
        unit={toUnit === "kg" ? "kg" : "bags"}
      />
    </div>
  );
}

function BlocksTab() {
  const [amount, setAmount] = useState("");
  const [blockSize, setBlockSize] = useState<BlockSizeCm>(20);
  const [fromUnit, setFromUnit] = useState<BlockOutputUnit>("pieces");
  const [toUnit, setToUnit] = useState<BlockOutputUnit>("cement_bags");

  const parsed = Number(amount.replace(/,/g, ""));
  const result =
    amount.trim() && Number.isFinite(parsed) ? convertBlockOutput(parsed, fromUnit, toUnit, blockSize) : null;

  return (
    <div className="space-y-3">
      <BlockSizeSelect value={blockSize} onChange={setBlockSize} />

      <div className="space-y-1.5">
        <Label className="text-xs">Amount</Label>
        <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
      </div>

      <UnitSwapRow
        fromLabel="From"
        toLabel="To"
        fromValue={fromUnit}
        toValue={toUnit}
        onFromChange={(v) => setFromUnit(v as BlockOutputUnit)}
        onToChange={(v) => setToUnit(v as BlockOutputUnit)}
        onSwap={() => {
          setFromUnit(toUnit);
          setToUnit(fromUnit);
        }}
        options={BLOCK_OUTPUT_UNIT_OPTIONS}
      />

      <ResultBox
        label="Result"
        value={result !== null ? formatResult(result, 2) : "—"}
        unit={BLOCK_OUTPUT_UNIT_OPTIONS.find((o) => o.value === toUnit)?.label}
      />
    </div>
  );
}

function WasteCostTab() {
  const { data: settingsData } = useProductionSettings();
  const kgPerBag = Number(
    (settingsData as { cement_kg_per_bag?: number } | undefined)?.cement_kg_per_bag ?? CEMENT_KG_PER_BAG
  );
  const { cement, poliche } = useCementAndPolicheItems();

  const [blockSize, setBlockSize] = useState<BlockSizeCm>(20);
  const [pieces, setPieces] = useState("");
  const [cementUsed, setCementUsed] = useState("");
  const [policheUsed, setPolicheUsed] = useState("");

  const result = useMemo(() => {
    const piecesN = Number(pieces);
    if (!pieces.trim() || !Number.isFinite(piecesN)) return null;
    return computeWasteCost(
      blockSize,
      piecesN,
      Number(cementUsed) || 0,
      Number(policheUsed) || 0,
      Number(cement?.unit_cost ?? 0),
      Number(poliche?.unit_cost ?? 0),
      kgPerBag
    );
  }, [blockSize, pieces, cementUsed, policheUsed, cement, poliche, kgPerBag]);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Previews the same waste calculation a daily production log uses — enter what you actually used to see the
        cost before logging it.
      </p>

      <BlockSizeSelect value={blockSize} onChange={setBlockSize} />

      <div className="space-y-1.5">
        <Label className="text-xs">Pieces produced</Label>
        <Input type="number" min={0} value={pieces} onChange={(e) => setPieces(e.target.value)} placeholder="0" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Cement bags used</Label>
          <Input
            type="number"
            min={0}
            value={cementUsed}
            onChange={(e) => setCementUsed(e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Poliche loads used</Label>
          <Input
            type="number"
            min={0}
            value={policheUsed}
            onChange={(e) => setPolicheUsed(e.target.value)}
            placeholder="0"
          />
        </div>
      </div>

      {result && (
        <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Standard usage</span>
            <span>
              {formatResult(result.standardCementBags)} bags · {formatResult(result.standardPolicheLoads)} loads
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Waste</span>
            <span>
              {formatResult(result.cementWasteBags)} bags · {formatResult(result.policheWasteLoads)} loads
            </span>
          </div>
          <div className="flex justify-between border-t border-border/60 pt-2 text-sm font-semibold">
            <span>Waste cost</span>
            <span>{formatBirr(result.wasteCost)}</span>
          </div>
        </div>
      )}
      {!cement && !poliche && (
        <p className="text-[11px] text-muted-foreground">
          Cement/poliche unit costs weren&apos;t found in inventory — waste cost will show as 0 Birr until those
          items exist.
        </p>
      )}
    </div>
  );
}

function CapacityTab() {
  const { cement, poliche } = useCementAndPolicheItems();
  const [blockSize, setBlockSize] = useState<BlockSizeCm>(20);
  const [cementBags, setCementBags] = useState("");
  const [policheLoads, setPolicheLoads] = useState("");
  const [useLiveStock, setUseLiveStock] = useState(true);

  const effectiveCement = useLiveStock ? Number(cement?.quantity ?? 0) : Number(cementBags) || 0;
  const effectivePoliche = useLiveStock ? Number(poliche?.quantity ?? 0) : Number(policheLoads) || 0;

  const result = computeMaterialsCapacity(blockSize, effectiveCement, effectivePoliche);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        How many pieces the material on hand can produce, before any waste allowance — whichever material runs out
        first sets the limit.
      </p>

      <BlockSizeSelect value={blockSize} onChange={setBlockSize} />

      <div className="flex items-center justify-between rounded-lg border border-border/60 p-2">
        <span className="text-xs">Use live stock on hand</span>
        <Button variant={useLiveStock ? "default" : "outline"} size="sm" onClick={() => setUseLiveStock((v) => !v)}>
          {useLiveStock ? "On" : "Off"}
        </Button>
      </div>

      {useLiveStock ? (
        <p className="text-xs text-muted-foreground">
          Cement: {formatResult(Number(cement?.quantity ?? 0))} bags · Poliche:{" "}
          {formatResult(Number(poliche?.quantity ?? 0))} loads
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Cement bags on hand</Label>
            <Input
              type="number"
              min={0}
              value={cementBags}
              onChange={(e) => setCementBags(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Poliche loads on hand</Label>
            <Input
              type="number"
              min={0}
              value={policheLoads}
              onChange={(e) => setPolicheLoads(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>
      )}

      <ResultBox label="Max pieces feasible" value={formatResult(result.maxPieces)} unit="pieces" />
      <p className="text-center text-[11px] text-muted-foreground">
        {result.limitingFactor === "none"
          ? "No material on hand."
          : `Limited by ${result.limitingFactor} (cement allows ${formatResult(result.maxPiecesFromCement)}, poliche allows ${formatResult(result.maxPiecesFromPoliche)}).`}
      </p>
    </div>
  );
}

function RecyclingTab() {
  const [received, setReceived] = useState("");
  const [output, setOutput] = useState("");

  const result = useMemo(() => {
    if (!received.trim()) return null;
    return computeRecyclingYield(Number(received) || 0, Number(output) || 0);
  }, [received, output]);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Plastic Recycling yield/waste for a batch — same ratio the recycling stats use.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Material received (kg)</Label>
          <Input
            type="number"
            min={0}
            value={received}
            onChange={(e) => setReceived(e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Processed output (kg)</Label>
          <Input type="number" min={0} value={output} onChange={(e) => setOutput(e.target.value)} placeholder="0" />
        </div>
      </div>

      {result && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border border-border/60 bg-muted/30 p-2">
            <p className="text-[10px] text-muted-foreground">Yield</p>
            <p className="text-sm font-bold">{formatResult(result.yieldRate * 100, 1)}%</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-2">
            <p className="text-[10px] text-muted-foreground">Waste rate</p>
            <p className="text-sm font-bold">{formatResult(result.wasteRate * 100, 1)}%</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-2">
            <p className="text-[10px] text-muted-foreground">Waste (kg)</p>
            <p className="text-sm font-bold">{formatResult(result.wasteKg)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function OrderCreditTab() {
  const { data } = useFinanceSettings();
  const defaultWithholdingRate = Number(
    (data as { withholding_tax_rate_percent?: number } | undefined)?.withholding_tax_rate_percent ?? 0
  );

  const [subtotal, setSubtotal] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [withholdingApplied, setWithholdingApplied] = useState(false);
  const [withholdingRate, setWithholdingRate] = useState(String(defaultWithholdingRate || ""));
  const [amountPaid, setAmountPaid] = useState("");
  const [storeCreditApplied, setStoreCreditApplied] = useState("");

  const result = useMemo(() => {
    const sub = Number(subtotal);
    if (!subtotal.trim() || !Number.isFinite(sub)) return null;
    const totalAfterDiscount = applyOrderDiscount(sub, Number(discountPercent) || 0);
    const withholdingAmount = computeWithholdingAmount(
      totalAfterDiscount,
      Number(withholdingRate) || 0,
      withholdingApplied
    );
    const credit = orderCreditAmount({
      total_amount: totalAfterDiscount,
      amount_paid: Number(amountPaid) || 0,
      withholding_amount: withholdingAmount,
      store_credit_applied: Number(storeCreditApplied) || 0,
    });
    return { totalAfterDiscount, withholdingAmount, credit };
  }, [subtotal, discountPercent, withholdingApplied, withholdingRate, amountPaid, storeCreditApplied]);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Same discount/withholding/credit math the Sales module uses — preview a sale before creating it.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Subtotal (Birr)</Label>
          <Input type="number" min={0} value={subtotal} onChange={(e) => setSubtotal(e.target.value)} placeholder="0" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Discount %</Label>
          <Input
            type="number"
            min={0}
            max={100}
            value={discountPercent}
            onChange={(e) => setDiscountPercent(e.target.value)}
            placeholder="0"
          />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border/60 p-2">
        <span className="text-xs">Apply withholding</span>
        <Button
          variant={withholdingApplied ? "default" : "outline"}
          size="sm"
          onClick={() => setWithholdingApplied((v) => !v)}
        >
          {withholdingApplied ? "On" : "Off"}
        </Button>
      </div>

      {withholdingApplied && (
        <div className="space-y-1.5">
          <Label className="text-xs">Withholding rate %</Label>
          <Input
            type="number"
            min={0}
            max={100}
            value={withholdingRate}
            onChange={(e) => setWithholdingRate(e.target.value)}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Amount paid</Label>
          <Input type="number" min={0} value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} placeholder="0" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Store credit applied</Label>
          <Input
            type="number"
            min={0}
            value={storeCreditApplied}
            onChange={(e) => setStoreCreditApplied(e.target.value)}
            placeholder="0"
          />
        </div>
      </div>

      {result && (
        <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total after discount</span>
            <span>{formatBirr(result.totalAfterDiscount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Withholding amount</span>
            <span>{formatBirr(result.withholdingAmount)}</span>
          </div>
          <div className="flex justify-between border-t border-border/60 pt-2 text-sm font-semibold">
            <span>Outstanding credit</span>
            <span>{formatBirr(result.credit)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

type SystemTool = "cement" | "blocks" | "waste_cost" | "capacity" | "recycling" | "order_credit";

const SYSTEM_TOOL_OPTIONS: { value: SystemTool; label: string }[] = [
  { value: "cement", label: "Cement: kg ↔ bags" },
  { value: "blocks", label: "Block output converter" },
  { value: "waste_cost", label: "Waste cost preview" },
  { value: "capacity", label: "Capacity estimate" },
  { value: "recycling", label: "Recycling yield/waste" },
  { value: "order_credit", label: "Sales discount/credit" },
];

function SystemToolsPanel() {
  const [tool, setTool] = useState<SystemTool>("cement");

  return (
    <div className="space-y-3">
      <Select value={tool} onValueChange={(v) => setTool(v as SystemTool)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SYSTEM_TOOL_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {tool === "cement" && <CementTab />}
      {tool === "blocks" && <BlocksTab />}
      {tool === "waste_cost" && <WasteCostTab />}
      {tool === "capacity" && <CapacityTab />}
      {tool === "recycling" && <RecyclingTab />}
      {tool === "order_credit" && <OrderCreditTab />}
    </div>
  );
}

export function SystemCalculator() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[360px] rounded-2xl border border-border/60 bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-border/60 p-3">
            <div className="flex items-center gap-2">
              <Calculator className="size-4 text-primary" />
              <p className="text-sm font-semibold">System Calculator</p>
            </div>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => setOpen(false)}>
              <X className="size-4" />
            </Button>
          </div>

          <div className="max-h-[70vh] overflow-y-auto p-3">
            <Tabs defaultValue="calc">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="calc" className="text-xs">
                  Calculator
                </TabsTrigger>
                <TabsTrigger value="system" className="text-xs">
                  System Tools
                </TabsTrigger>
              </TabsList>
              <TabsContent value="calc" className="mt-3">
                <CalculatorTab />
              </TabsContent>
              <TabsContent value="system" className="mt-3">
                <SystemToolsPanel />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}

      <Button
        onClick={() => setOpen((o) => !o)}
        size="icon"
        className="fixed bottom-6 right-6 z-50 size-14 rounded-full shadow-xl"
        aria-label="Open system calculator"
      >
        {open ? <X className="size-5" /> : <Calculator className="size-5" />}
      </Button>
    </>
  );
}
