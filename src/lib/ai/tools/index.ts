import type { LlmToolDefinition } from "@/lib/ai/llm-client";

export const AI_TOOL_DEFINITIONS: LlmToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_inventory_summary",
      description: "Get current inventory stock and low-stock items — cement/poliche/finished blocks for Block Factory, or raw plastic waste/recycled pellets for Plastic Recycling. Automatically scoped to whichever factory is currently in view; the `scope` argument is only honored when the current view is company-wide/combined.",
      parameters: {
        type: "object",
        properties: {
          scope: {
            type: "string",
            enum: ["block", "recycling", "combined"],
            description: "Factory scope override, only used when the current view is combined.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_production_capacity",
      description:
        "Block Factory: how many blocks and pallets can be produced with current cement and poliche stock, per block size (10/15/20/24cm), including limiting factor and confidence. Plastic Recycling: today/week/month recycled output, yield and waste rate, plus current raw material and finished pellet stock. Automatically scoped to whichever factory is currently in view.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_production_intelligence",
      description:
        "Block Factory: learned material-waste rate (extra cement/poliche used beyond the standard formula — there's no piece-rejection tracking anymore, no drying/curing checkpoints), yield rate (how close daily output came to target), cement/poliche bags-per-1000-blocks, cycle days, and confidence, grouped by block size. Learned from ALL batches with logged daily production history (in progress or finished, not just completed ones). Plastic Recycling: real output/yield/waste and stock levels computed directly from production and inventory records (no batch-based learning model exists for recycling yet). Automatically scoped to whichever factory is currently in view.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "predict_waste",
      description:
        "Block Factory ONLY. Predicts expected material waste (extra cement/poliche beyond standard) and net finished pieces for a hypothetical production run, using the learned waste rate for that block size from real daily-log history. Use this whenever the user asks 'how much waste do we expect', 'how many pieces can we actually get from X', 'how much cement/poliche will we need for Y pieces', or similar planning questions — do not estimate this yourself from raw numbers, always call this tool.",
      parameters: {
        type: "object",
        properties: {
          block_size_cm: {
            type: "number",
            enum: [10, 15, 20, 24],
            description: "Block size in cm.",
          },
          planned_pieces: {
            type: "number",
            description: "How many pieces (blocks) the hypothetical run is planned for.",
          },
        },
        required: ["block_size_cm", "planned_pieces"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_batch_status",
      description: "Block Factory: list production batches (in progress by default, or include finished ones) with status, block size, real produced/sold/available pieces from daily production logs, and overdue flag. Plastic Recycling: no batch concept exists — returns recent daily production entries (material received/processed output/waste) instead. Automatically scoped to whichever factory is currently in view.",
      parameters: {
        type: "object",
        properties: {
          include_completed: {
            type: "boolean",
            description: "If true, include recent completed batches.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_finance_summary",
      description:
        "Finance summary for the period: revenue, collections, outstanding receivables, cash flow signals. Automatically scoped to whichever factory (Block Factory or Plastic Recycling) is currently in view, or combined/company-wide.",
      parameters: {
        type: "object",
        properties: {
          period: {
            type: "string",
            enum: ["today", "this_week", "this_month", "last_month", "this_year"],
            description: "Finance period. Defaults to this_month.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_customer_credit",
      description:
        "Customer credit details: balance, credit score (0-100), risk tier, limit, and recent payment activity. Pass customer_name or customer_id. Customers are shared across both factories, but each customer has three separate credit scores — Block Factory, Plastic Recycling, and Overall/Combined — and this tool automatically returns whichever one matches the factory currently in view.",
      parameters: {
        type: "object",
        properties: {
          customer_id: { type: "string" },
          customer_name: { type: "string", description: "Partial name match if id unknown." },
          limit: { type: "number", description: "Max customers to return when listing high risk. Default 10." },
          high_risk_only: { type: "boolean" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_open_orders",
      description: "Open (pending pickup) orders with customer, totals, the real remaining credit_amount owed (already accounts for withholding tax and store credit applied — never recompute this yourself as total_amount minus amount_paid), AI risk flags, and (for Plastic Recycling) the order's recycling workflow stage. Automatically scoped to whichever factory is currently in view; the `scope` argument is only honored when the current view is combined.",
      parameters: {
        type: "object",
        properties: {
          scope: {
            type: "string",
            enum: ["block", "recycling", "combined"],
          },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_supplier_credit",
      description: "Supplier accounts-payable balances and recent supplier payments. Suppliers are shared across both factories, but recent payments are scoped to the current factory's purchases when a specific factory is in view.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_reorder_alerts",
      description: "Low-stock / reorder SKUs from inventory. Automatically scoped to whichever factory is currently in view; the `scope` argument is only honored when the current view is combined.",
      parameters: {
        type: "object",
        properties: {
          scope: {
            type: "string",
            enum: ["block", "recycling", "combined"],
          },
        },
      },
    },
  },
];

export type AiToolName =
  | "get_inventory_summary"
  | "get_production_capacity"
  | "get_production_intelligence"
  | "predict_waste"
  | "get_batch_status"
  | "get_finance_summary"
  | "get_customer_credit"
  | "get_open_orders"
  | "get_supplier_credit"
  | "get_reorder_alerts";

/**
 * Each tool requires at least one of these resource permissions — deliberately
 * NOT falling back to the broad `ai:read`/`ai:chat` permissions that nearly
 * every role holds. `ai:read` only proves "can see AI briefings", not "can see
 * finance/sales/supplier data" — folding it in here would let any chat-enabled
 * role (e.g. a warehouse officer) read finance summaries just by asking the
 * assistant, even though they have no `finance:read` permission anywhere else
 * in the app. Tool access must always require the same resource permission the
 * equivalent dashboard page requires.
 */
export const TOOL_PERMISSIONS: Record<AiToolName, Array<[string, string]>> = {
  get_inventory_summary: [["inventory", "read"]],
  get_production_capacity: [["ai", "capacity"], ["production", "read"]],
  get_production_intelligence: [["production", "read"]],
  predict_waste: [["production", "read"]],
  get_batch_status: [["production", "read"]],
  get_finance_summary: [["finance", "read"]],
  get_customer_credit: [["ai", "credit_score"], ["sales", "read"], ["finance", "read"]],
  get_open_orders: [["sales", "read"]],
  get_supplier_credit: [["finance", "read"]],
  get_reorder_alerts: [["inventory", "read"]],
};

/** Plain-language description of what each tool exposes, for refusal messages and the system prompt. */
export const TOOL_DATA_DESCRIPTIONS: Record<AiToolName, string> = {
  get_inventory_summary: "inventory stock levels",
  get_production_capacity: "production capacity predictions",
  get_production_intelligence: "production yield/waste intelligence",
  predict_waste: "production waste predictions",
  get_batch_status: "production batch status",
  get_finance_summary: "financial reports (revenue, cash flow, receivables)",
  get_customer_credit: "customer credit and risk data",
  get_open_orders: "sales order details",
  get_supplier_credit: "supplier payables and payment data",
  get_reorder_alerts: "inventory reorder alerts",
};
