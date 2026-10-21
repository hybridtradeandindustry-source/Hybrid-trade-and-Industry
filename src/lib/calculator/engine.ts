import { BLOCK_YIELDS, calculateMaterialConsumption, roundPolicheLoads, type BlockSizeCm } from "@/lib/block-factory/yields";

export type BlockOutputUnit = "pieces" | "plates" | "pallets" | "cement_bags" | "poliche_loads";

export const BLOCK_OUTPUT_UNIT_OPTIONS: { value: BlockOutputUnit; label: string }[] = [
  { value: "pieces", label: "Blocks (pieces)" },
  { value: "plates", label: "Plates" },
  { value: "pallets", label: "Pallets" },
  { value: "cement_bags", label: "Cement bags" },
  { value: "poliche_loads", label: "Poliche loads" },
];

function piecesPerUnit(unit: BlockOutputUnit, blockSizeCm: BlockSizeCm): number {
  const spec = BLOCK_YIELDS[blockSizeCm];
  switch (unit) {
    case "pieces":
      return 1;
    case "plates":
      return spec.blocksPerPlate;
    case "pallets":
      return spec.platesPerBag * spec.blocksPerPlate;
    case "cement_bags":
      return spec.blocksPerCementBag;
    case "poliche_loads":
      return spec.blocksPerPolicheLoad;
  }
}

/** Converts between any two block-output units (pieces/plates/pallets/cement bags/poliche loads) for a given block size — the same ratios the production and capacity modules use. */
export function convertBlockOutput(
  value: number,
  fromUnit: BlockOutputUnit,
  toUnit: BlockOutputUnit,
  blockSizeCm: BlockSizeCm
): number {
  if (fromUnit === toUnit) return value;
  const pieces = value * piecesPerUnit(fromUnit, blockSizeCm);
  return pieces / piecesPerUnit(toUnit, blockSizeCm);
}

export type CementWeightUnit = "kg" | "bags";

/** Cement bag weight is fixed regardless of block size — uses the org's configured cement_kg_per_bag setting. */
export function convertCementWeight(
  value: number,
  fromUnit: CementWeightUnit,
  toUnit: CementWeightUnit,
  kgPerBag: number
): number {
  if (fromUnit === toUnit) return value;
  if (fromUnit === "kg" && toUnit === "bags") return kgPerBag > 0 ? value / kgPerBag : 0;
  return value * kgPerBag;
}

const TOKEN_RE = /\s*(\d+(?:\.\d+)?|[+\-*/()%])/g;

function tokenize(expr: string): string[] {
  const tokens: string[] = [];
  let match: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  let lastIndex = 0;
  while ((match = TOKEN_RE.exec(expr)) !== null) {
    if (match.index !== lastIndex) throw new Error("invalid character");
    tokens.push(match[1]);
    lastIndex = TOKEN_RE.lastIndex;
  }
  if (lastIndex !== expr.length) throw new Error("invalid character");
  return tokens;
}

/**
 * Minimal recursive-descent parser for +, -, *, /, %, parentheses, and unary minus —
 * deliberately not eval()/Function() since this runs on arbitrary user input.
 */
class ExpressionParser {
  private tokens: string[];
  private pos = 0;

  constructor(tokens: string[]) {
    this.tokens = tokens;
  }

  private peek(): string | undefined {
    return this.tokens[this.pos];
  }

  private next(): string {
    const t = this.tokens[this.pos];
    if (t === undefined) throw new Error("unexpected end of expression");
    this.pos += 1;
    return t;
  }

  parse(): number {
    const value = this.parseAddSub();
    if (this.pos !== this.tokens.length) throw new Error("unexpected trailing tokens");
    return value;
  }

  private parseAddSub(): number {
    let value = this.parseMulDiv();
    while (this.peek() === "+" || this.peek() === "-") {
      const op = this.next();
      const rhs = this.parseMulDiv();
      value = op === "+" ? value + rhs : value - rhs;
    }
    return value;
  }

  private parseMulDiv(): number {
    let value = this.parseUnary();
    while (this.peek() === "*" || this.peek() === "/" || this.peek() === "%") {
      const op = this.next();
      const rhs = this.parseUnary();
      if (op === "*") value *= rhs;
      else if (op === "/") value /= rhs;
      else value %= rhs;
    }
    return value;
  }

  private parseUnary(): number {
    if (this.peek() === "-") {
      this.next();
      return -this.parseUnary();
    }
    if (this.peek() === "+") {
      this.next();
      return this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    const token = this.next();
    if (token === "(") {
      const value = this.parseAddSub();
      if (this.next() !== ")") throw new Error("expected closing parenthesis");
      return value;
    }
    const num = Number(token);
    if (Number.isNaN(num)) throw new Error("expected number");
    return num;
  }
}

export type WasteCostResult = {
  standardCementBags: number;
  standardPolicheLoads: number;
  cementWasteBags: number;
  policheWasteLoads: number;
  wasteCost: number;
};

/**
 * Same math production-daily-log.ts uses when a daily log is saved — lets a user preview
 * the waste cost for a day before actually logging it. Standard usage is derived from
 * pieces actually produced; waste is whatever was used beyond that.
 */
export function computeWasteCost(
  blockSizeCm: BlockSizeCm,
  piecesProduced: number,
  actualCementBags: number,
  actualPolicheLoads: number,
  cementUnitCost: number,
  policheUnitCost: number,
  cementKgPerBag: number
): WasteCostResult {
  const standard = calculateMaterialConsumption(blockSizeCm, Math.max(0, piecesProduced), BLOCK_YIELDS, cementKgPerBag);
  const cementWasteBags = Math.max(0, actualCementBags - standard.cementBags);
  const policheWasteLoads = roundPolicheLoads(Math.max(0, actualPolicheLoads - standard.policheLoads));
  return {
    standardCementBags: standard.cementBags,
    standardPolicheLoads: standard.policheLoads,
    cementWasteBags,
    policheWasteLoads,
    wasteCost: cementWasteBags * cementUnitCost + policheWasteLoads * policheUnitCost,
  };
}

export type MaterialsCapacityResult = {
  maxPiecesFromCement: number;
  maxPiecesFromPoliche: number;
  maxPieces: number;
  limitingFactor: "cement" | "poliche" | "none";
};

/** How many pieces the stock on hand can feasibly produce, before any waste allowance — whichever material runs out first sets the ceiling. */
export function computeMaterialsCapacity(
  blockSizeCm: BlockSizeCm,
  cementBagsOnHand: number,
  policheLoadsOnHand: number
): MaterialsCapacityResult {
  const spec = BLOCK_YIELDS[blockSizeCm];
  const maxPiecesFromCement = Math.max(0, cementBagsOnHand) * spec.blocksPerCementBag;
  const maxPiecesFromPoliche = Math.max(0, policheLoadsOnHand) * spec.blocksPerPolicheLoad;
  const maxPieces = Math.min(maxPiecesFromCement, maxPiecesFromPoliche);
  const limitingFactor =
    maxPieces <= 0
      ? "none"
      : maxPiecesFromCement <= maxPiecesFromPoliche
        ? "cement"
        : "poliche";
  return { maxPiecesFromCement, maxPiecesFromPoliche, maxPieces, limitingFactor };
}

export type RecyclingYieldResult = {
  wasteKg: number;
  yieldRate: number;
  wasteRate: number;
};

/** Plastic Recycling yield/waste for a batch — same ratio the recycling stats use (output vs. material received). */
export function computeRecyclingYield(materialReceivedKg: number, processedOutputKg: number): RecyclingYieldResult {
  const received = Math.max(0, materialReceivedKg);
  const output = Math.max(0, processedOutputKg);
  const wasteKg = Math.max(0, received - output);
  return {
    wasteKg,
    yieldRate: received > 0 ? output / received : 0,
    wasteRate: received > 0 ? wasteKg / received : 0,
  };
}

/** Evaluates a plain arithmetic expression (no unit awareness). Returns null on invalid input. */
export function evaluateExpression(input: string): number | null {
  const expr = input.replace(/,/g, "").trim();
  if (!expr) return null;
  try {
    const tokens = tokenize(expr);
    if (tokens.length === 0) return null;
    const result = new ExpressionParser(tokens).parse();
    return Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}
