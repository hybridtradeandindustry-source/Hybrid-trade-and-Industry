"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Factory,
  Layers,
  Mail,
  MapPin,
  Phone,
  Wallet,
} from "lucide-react";
import { MetricCard } from "@/components/ui/metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  formatCustomerBatchLabel,
  type CustomerDetail,
  type EnrichedCustomerOrder,
  type EnrichedOrderItem,
} from "@/lib/services/customer-detail-types";
import { ORDER_STATUS_LABELS } from "@/types";

const PAYMENT_KIND_LABELS: Record<string, string> = {
  payment: "Customer paid you",
  refund: "You returned cash to customer",
  store_credit_issue: "Added to store credit wallet",
  store_credit_apply: "Paid from store credit wallet",
};

const PAYMENT_KIND_HELP: Record<string, string> = {
  payment: "Real money the customer paid — reduces what they owe you.",
  refund: "Cash you gave back, usually after cancelling a paid sale.",
  store_credit_issue: "Money kept as prepaid credit instead of a refund — goes into their wallet.",
  store_credit_apply: "Customer used wallet credit to pay part of a new sale — not new cash.",
};

const ACTIVITY_LABELS: Record<string, string> = {
  sale: "New sale",
  pickup: "Goods picked up",
  payment: "Money received",
  refund: "Cash refunded",
  store_credit: "Store credit wallet",
  cancellation: "Sale cancelled",
};

const ACTIVITY_COLORS: Record<string, string> = {
  sale: "bg-primary/10 text-primary border-primary/20",
  pickup: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  payment: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  refund: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  store_credit: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20",
  cancellation: "bg-destructive/10 text-destructive border-destructive/20",
};

function ExplainBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-primary/15 bg-primary/5 p-4 text-sm leading-relaxed">
      <p className="font-semibold text-foreground">{title}</p>
      <div className="mt-1.5 text-muted-foreground">{children}</div>
    </div>
  );
}

function buildAccountSummary(customer: CustomerDetail["customer"]) {
  const parts: string[] = [];
  const name = customer.name;

  if (customer.balance > 0) {
    parts.push(
      `${name} currently owes ${formatCurrency(customer.balance)} — money still due from sales they already picked up.`
    );
  } else {
    parts.push(`${name} has no outstanding balance. All picked-up sales are fully paid.`);
  }

  if ((customer.store_credit_balance ?? 0) > 0) {
    parts.push(
      `They have ${formatCurrency(customer.store_credit_balance ?? 0)} in store credit (prepaid wallet) ready to use on a future sale.`
    );
  }

  if (customer.open_order_count > 0) {
    parts.push(
      `${customer.open_order_count} sale${customer.open_order_count > 1 ? "s are" : " is"} still waiting for pickup` +
        (customer.pending_order_credit > 0
          ? `, with ${formatCurrency(customer.pending_order_credit)} not yet paid — this moves to their balance when they pick up.`
          : ".")
    );
  }

  if (customer.total_refunded > 0) {
    parts.push(`Total cash refunded so far: ${formatCurrency(customer.total_refunded)}.`);
  }

  return parts.join(" ");
}

function saleStatusExplanation(order: EnrichedCustomerOrder): string {
  if (order.status === "ordered") {
    return "Waiting for pickup — goods not collected yet. Unpaid amount is not on their balance until pickup.";
  }
  if (order.status === "picked") {
    return order.unpaid_credit > 0
      ? `Picked up — ${formatCurrency(order.unpaid_credit)} is still owed and shows on their balance.`
      : "Picked up and fully paid — nothing left to collect.";
  }
  if (order.status === "cancelled") {
    return "Cancelled — paid money may have been refunded, used to pay old debt, or kept as store credit. Check Store Credit Wallet and Full Ledger.";
  }
  return ORDER_STATUS_LABELS[order.status] ?? order.status;
}

function BatchBadges({
  batches,
  link = true,
}: {
  batches: Array<{ id: string; batch_number: string; name?: string | null; block_size_cm?: number | null }>;
  link?: boolean;
}) {
  if (!batches.length) {
    return (
      <span className="text-xs text-muted-foreground">
        No production batch recorded — blocks may have come from general stock.
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {batches.map((batch) => {
        const label = formatCustomerBatchLabel(batch);
        const content = (
          <Badge variant="outline" className="gap-1 text-[10px] font-normal">
            <Layers className="size-3" />
            {label}
            {batch.block_size_cm ? ` · ${batch.block_size_cm}cm` : ""}
          </Badge>
        );
        return link ? (
          <Link
            key={batch.id}
            href={`/dashboard/production/batches/${batch.id}`}
            className="hover:opacity-80"
          >
            {content}
          </Link>
        ) : (
          <span key={batch.id}>{content}</span>
        );
      })}
    </div>
  );
}

function SaleDetailCard({ order }: { order: EnrichedCustomerOrder }) {
  const [open, setOpen] = useState(false);
  const batches = useMemo(() => {
    const seen = new Map<string, (typeof order.production_batch)>();
    if (order.production_batch) seen.set(order.production_batch.id, order.production_batch);
    for (const line of order.items) {
      if (line.batch) seen.set(line.batch.id, line.batch);
    }
    for (const alloc of order.allocations) {
      if (alloc.batch) seen.set(alloc.batch.id, alloc.batch);
    }
    return [...seen.values()].filter(Boolean) as NonNullable<typeof order.production_batch>[];
  }, [order]);

  return (
    <div className="rounded-xl border border-border/60 bg-card/40">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 p-4 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold">{order.order_number}</span>
            <Badge variant="outline">{ORDER_STATUS_LABELS[order.status]}</Badge>
            {order.ai_risk_flag && (
              <Badge variant="destructive" className="gap-1 text-[10px]">
                <AlertTriangle className="size-3" />
                At risk
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {order.factory_label} · Created {formatDate(order.created_at)} ·{" "}
            {order.delivery_date ? `Expected pickup ${formatDate(order.delivery_date)}` : "No pickup date set"}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">{saleStatusExplanation(order)}</p>
          <div className="flex flex-wrap gap-3 text-xs">
            <span title="Full value of this sale">
              Sale total <strong>{formatCurrency(order.total_amount)}</strong>
            </span>
            <span title="Cash or bank paid at the time of sale">
              Cash paid <strong>{formatCurrency(order.amount_paid ?? 0)}</strong>
            </span>
            {(order.store_credit_applied ?? 0) > 0 && (
              <span title="Part of payment came from prepaid store credit, not new cash">
                From wallet <strong>{formatCurrency(order.store_credit_applied ?? 0)}</strong>
              </span>
            )}
            {order.unpaid_credit > 0 && (
              <span className="text-amber-700 dark:text-amber-400" title="Amount customer still owes on this sale">
                Still owed <strong>{formatCurrency(order.unpaid_credit)}</strong>
              </span>
            )}
          </div>
        </div>
        {open ? (
          <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="space-y-4 border-t border-border/60 px-4 pb-4 pt-3">
          <div>
            <p className="mb-1 text-sm font-medium text-foreground">What was sold</p>
            <p className="mb-3 text-xs text-muted-foreground">
              Each line shows the product, quantity, price, and which production batch the blocks came from.
            </p>
            <div className="space-y-2">
              {order.items.map((line: EnrichedOrderItem) => {
                const lineAllocations = order.allocations.filter(
                  (a) => a.order_item_id === line.id || (!a.order_item_id && a.batch_id === line.batch_id)
                );
                return (
                  <div
                    key={line.id}
                    className="rounded-lg border border-border/60 bg-muted/10 p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{line.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {line.quantity.toLocaleString()} pieces × {formatCurrency(line.unit_price)} each ={" "}
                          {formatCurrency(line.quantity * line.unit_price)}
                          {Number(line.quantity_fulfilled ?? 0) > 0 &&
                            ` · Already picked up: ${Number(line.quantity_fulfilled).toLocaleString()} pieces`}
                        </p>
                      </div>
                      {line.batch && (
                        <Link
                          href={`/dashboard/production/batches/${line.batch.id}`}
                          className="text-xs text-primary hover:underline"
                        >
                          Made in batch: {formatCustomerBatchLabel(line.batch)}
                        </Link>
                      )}
                    </div>
                    {lineAllocations.length > 0 && (
                      <div className="mt-2 border-t border-border/40 pt-2">
                        <p className="text-xs font-medium text-muted-foreground">
                          Which batch supplied these blocks at pickup
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          When the customer picked up, the system recorded exactly how many pieces came from each
                          production batch.
                        </p>
                        <ul className="mt-1 space-y-1 text-xs">
                          {lineAllocations.map((alloc) => (
                            <li key={alloc.id}>
                              {alloc.quantity.toLocaleString()} pieces came from{" "}
                              {alloc.batch ? (
                                <Link
                                  href={`/dashboard/production/batches/${alloc.batch.id}`}
                                  className="font-mono text-primary hover:underline"
                                >
                                  {formatCustomerBatchLabel(alloc.batch)}
                                </Link>
                              ) : (
                                "unknown batch"
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-foreground">All production batches for this sale</p>
            <p className="mb-2 text-xs text-muted-foreground">
              A batch is a group of blocks made together in the factory. Click any batch to see full production
              details.
            </p>
            <BatchBadges batches={batches} />
          </div>

          {(order.withholding_amount ?? 0) > 0 && (
            <p className="text-xs text-muted-foreground">
              Withholding tax held from this sale: {formatCurrency(order.withholding_amount ?? 0)}
              {order.withholding_applied ? " (set when the sale was created)" : ""}
            </p>
          )}
          {order.ai_risk_reason && (
            <p className="rounded-lg border border-destructive/20 bg-destructive/5 p-2 text-xs text-destructive">
              <strong>AI flagged this sale:</strong> {order.ai_risk_reason}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function CustomerDetailModule({ data }: { data: CustomerDetail }) {
  const { customer, payments, orders, storeCreditLedger, receivableLedger, timeline, batchesInvolved } =
    data;

  const totalStoreCreditIssued = storeCreditLedger
    .filter((e) => e.kind === "store_credit_issue")
    .reduce((s, e) => s + e.amount, 0);
  const totalStoreCreditSpent = storeCreditLedger
    .filter((e) => e.kind === "store_credit_apply")
    .reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-6">
      <ExplainBox title="Account summary in plain language">
        <p>{buildAccountSummary(customer)}</p>
        <p className="mt-2">
          Use the tabs below to see the full story: every sale, where blocks came from, how store credit was
          created, and every payment.
        </p>
      </ExplainBox>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Sales"
          value={customer.order_count}
          info="How many sales this customer has placed (cancelled sales are not counted in totals)."
        />
        <MetricCard
          title="Money They Still Owe You"
          value={formatCurrency(customer.balance)}
          info="Outstanding balance — what they owe after picking up goods. Pay this down with Record Payment."
        />
        <MetricCard
          title="Store Credit (Prepaid Wallet)"
          value={formatCurrency(customer.store_credit_balance ?? 0)}
          info="Money kept as credit instead of a refund. They can spend this on a future sale — not the same as debt owed to you."
        />
        <MetricCard
          title="Net Cash You Kept"
          value={formatCurrency(customer.net_paid)}
          info="All cash payments received minus any cash refunds given back."
        />
        <MetricCard
          title="Sales Waiting for Pickup"
          value={customer.open_order_count}
          info="Sales created but goods not collected yet."
        />
        <MetricCard
          title="Unpaid on Waiting Sales"
          value={formatCurrency(customer.pending_order_credit)}
          info="Part not yet paid on sales still waiting for pickup. Becomes part of their balance when they pick up."
        />
        <MetricCard
          title="Value Already Picked Up"
          value={formatCurrency(customer.picked_value)}
          info="Total value of sales where the customer already collected the goods."
        />
        <MetricCard
          title="Factory Batches Used"
          value={batchesInvolved.length}
          info="How many different production batches supplied blocks for this customer's sales."
        />
      </div>

      <Tabs defaultValue="timeline" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="timeline">Story Timeline</TabsTrigger>
          <TabsTrigger value="sales">Sales & Batches</TabsTrigger>
          <TabsTrigger value="wallet">Store Credit Wallet</TabsTrigger>
          <TabsTrigger value="receivable">What They Owe & Why</TabsTrigger>
          <TabsTrigger value="ledger">All Money Movements</TabsTrigger>
          <TabsTrigger value="profile">Contact & Risk</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="space-y-4">
          <ExplainBox title="What is this timeline?">
            A chronological story of everything that happened with this customer — new sales, pickups,
            payments, refunds, cancellations, and store-credit changes. Production batches are shown when we
            know which factory run supplied the blocks.
          </ExplainBox>
          <Card className="border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle>Story Timeline</CardTitle>
              <CardDescription>
                Read top to bottom — newest events first. Each card explains what happened and why it matters.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity recorded for this customer yet.</p>
              ) : (
                <div className="space-y-3">
                  {timeline.map((event) => (
                    <div
                      key={event.id}
                      className="rounded-xl border border-border/60 bg-background/40 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className={ACTIVITY_COLORS[event.category]}>
                              {ACTIVITY_LABELS[event.category] ?? event.category}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{formatDate(event.date)}</span>
                          </div>
                          <p className="font-medium">{event.title}</p>
                          <p className="text-sm leading-relaxed text-muted-foreground">{event.description}</p>
                          {event.order_number && (
                            <p className="font-mono text-xs text-muted-foreground">
                              Related sale: {event.order_number}
                            </p>
                          )}
                        </div>
                        {event.amount != null && event.amount > 0 && (
                          <span className="text-sm font-semibold">{formatCurrency(event.amount)}</span>
                        )}
                      </div>
                      {event.batches.length > 0 && (
                        <div className="mt-3 border-t border-border/40 pt-3">
                          <p className="mb-2 text-xs text-muted-foreground">Production batches involved:</p>
                          <BatchBadges batches={event.batches} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sales" className="space-y-4">
          <ExplainBox title="What are sales & batches?">
            Each sale lists what the customer bought. Expand a sale to see every product line, which factory
            batch the blocks came from, and how many pieces were picked up. This answers &quot;where did these
            blocks come from?&quot;
          </ExplainBox>
          <Card className="border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle>Sales History</CardTitle>
              <CardDescription>
                Click any sale to open full details — products, prices, batches, and what is still owed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {orders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sales for this customer.</p>
              ) : (
                orders.map((order) => <SaleDetailCard key={order.id} order={order} />)
              )}
            </CardContent>
          </Card>

          {batchesInvolved.length > 0 && (
            <Card className="border-border/60 bg-card/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Factory className="size-4" />
                  Every Factory Batch for This Customer
                </CardTitle>
                <CardDescription>
                  All production runs that supplied blocks to this customer. Open any batch to see when it was
                  made and how much was produced.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 sm:grid-cols-2">
                  {batchesInvolved.map((batch) => (
                    <Link
                      key={batch.id}
                      href={`/dashboard/production/batches/${batch.id}`}
                      className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/10 px-3 py-2 text-sm hover:border-primary/30 hover:bg-primary/5"
                    >
                      <div>
                        <p className="font-mono font-medium">{formatCustomerBatchLabel(batch)}</p>
                        <p className="text-xs text-muted-foreground">
                          {batch.block_size_cm ? `${batch.block_size_cm}cm block · ` : ""}
                          Status {batch.status ?? "—"}
                        </p>
                      </div>
                      <ExternalLink className="size-3.5 text-muted-foreground" />
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="wallet" className="space-y-4">
          <ExplainBox title="What is store credit (the wallet)?">
            <p>
              When a customer pays for a sale but cancels before pickup, you can refund cash, pay off their old
              debt, or <strong>keep the money as store credit</strong>. That credit sits in their wallet and
              can pay for a future sale — like a prepaid balance. It is <strong>not</strong> the same as money
              they owe you.
            </p>
          </ExplainBox>
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricCard
              title="Available Now"
              value={formatCurrency(customer.store_credit_balance ?? 0)}
              icon={<Wallet className="size-4" />}
              info="How much wallet credit they can spend on the next sale."
            />
            <MetricCard
              title="Ever Added to Wallet"
              value={formatCurrency(totalStoreCreditIssued)}
              info="Total store credit created from cancelled sales and settlements."
            />
            <MetricCard
              title="Already Spent from Wallet"
              value={formatCurrency(totalStoreCreditSpent)}
              info="Store credit used to pay for newer sales."
            />
          </div>

          <Card className="border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle>How Store Credit Was Created & Used</CardTitle>
              <CardDescription>
                Each entry shows where the credit came from (usually a cancelled sale), which production batches
                were on that sale, and where the credit was spent later.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {storeCreditLedger.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No store credit yet. Credit appears here when you cancel a paid sale and choose to keep money
                  in the customer&apos;s wallet instead of refunding cash.
                </p>
              ) : (
                <div className="space-y-4">
                  {storeCreditLedger.map((entry) => (
                    <div
                      key={entry.payment_id}
                      className="rounded-xl border border-border/60 bg-background/40 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="outline"
                              className={
                                entry.kind === "store_credit_issue"
                                  ? ACTIVITY_COLORS.store_credit
                                  : "bg-muted text-foreground"
                              }
                            >
                              {entry.kind === "store_credit_issue"
                                ? "Credit added to wallet"
                                : "Credit spent on a sale"}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{formatDate(entry.date)}</span>
                          </div>
                          <p className="text-lg font-semibold">{formatCurrency(entry.amount)}</p>
                          {entry.order_number && (
                            <p className="text-sm leading-relaxed">
                              {entry.kind === "store_credit_issue" ? (
                                <>
                                  <strong>Why:</strong> Customer cancelled sale{" "}
                                  <span className="font-mono">{entry.order_number}</span> after paying. This
                                  amount was kept in their wallet instead of refunding cash.
                                </>
                              ) : (
                                <>
                                  <strong>Used on:</strong> Sale{" "}
                                  <span className="font-mono">{entry.order_number}</span> — wallet credit paid
                                  part of this sale (not new cash).
                                </>
                              )}
                              {entry.order_status && (
                                <span className="ml-1 text-muted-foreground">
                                  (sale status: {ORDER_STATUS_LABELS[entry.order_status] ?? entry.order_status})
                                </span>
                              )}
                            </p>
                          )}
                          {entry.notes && (
                            <p className="text-sm text-muted-foreground">System note: {entry.notes}</p>
                          )}
                        </div>
                        <div className="text-right text-sm">
                          <p className="text-muted-foreground">Wallet balance after this</p>
                          <p className="font-semibold">{formatCurrency(entry.wallet_after)}</p>
                        </div>
                      </div>

                      {entry.kind === "store_credit_issue" && (
                        <div className="mt-3 border-t border-border/40 pt-3">
                          <p className="mb-1 text-sm font-medium text-foreground">
                            Blocks on the cancelled sale (where credit came from)
                          </p>
                          <p className="mb-2 text-xs text-muted-foreground">
                            These are the factory batches that were on the sale before it was cancelled.
                          </p>
                          <BatchBadges batches={entry.source_batches} />
                          {entry.source_batches.length === 0 && (
                            <p className="text-xs text-muted-foreground">
                              No batch was recorded — the sale may have been cancelled before pickup, or blocks
                              were taken from general stock without picking a batch.
                            </p>
                          )}
                        </div>
                      )}

                      {entry.kind === "store_credit_apply" && (
                        <div className="mt-3 border-t border-border/40 pt-3">
                          <p className="mb-1 text-sm font-medium text-foreground">
                            Blocks on the sale paid with wallet credit
                          </p>
                          {entry.target_batches.length > 0 ? (
                            <BatchBadges batches={entry.target_batches} />
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              No batch linked to this sale yet.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="receivable" className="space-y-4">
          <ExplainBox title="What does the customer owe you?">
            <p>
              The <strong>outstanding balance</strong> ({formatCurrency(customer.balance)}) is debt from sales
              where the customer already picked up goods but did not pay in full. Below is every event that
              increased or reduced that balance — so you can see exactly why they owe what they owe.
            </p>
          </ExplainBox>
          <Card className="border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle>What They Owe & Why</CardTitle>
              <CardDescription>
                Balance increases when they pick up goods without paying in full. Balance decreases when they
                pay you or when a cancelled sale settlement pays off old debt.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {receivableLedger.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No balance changes recorded — customer has no picked-up debt and no payments on account.
                </p>
              ) : (
                <div className="space-y-3">
                  {receivableLedger.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border/60 bg-muted/10 p-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">
                            {entry.direction === "increase"
                              ? "They owe more"
                              : "They paid / debt reduced"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{formatDate(entry.date)}</span>
                        </div>
                        <p className="text-sm leading-relaxed">{entry.description}</p>
                        {entry.order_number && (
                          <p className="font-mono text-xs text-muted-foreground">
                            Related sale: {entry.order_number}
                          </p>
                        )}
                      </div>
                      <span
                        className={
                          entry.direction === "increase"
                            ? "font-semibold text-amber-700 dark:text-amber-400"
                            : "font-semibold text-emerald-700 dark:text-emerald-400"
                        }
                      >
                        {entry.direction === "increase" ? "+" : "−"}
                        {formatCurrency(entry.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ledger" className="space-y-4">
          <ExplainBox title="Understanding money movements">
            <ul className="list-inside list-disc space-y-1">
              {Object.entries(PAYMENT_KIND_LABELS).map(([key, label]) => (
                <li key={key}>
                  <strong>{label}</strong> — {PAYMENT_KIND_HELP[key]}
                </li>
              ))}
            </ul>
          </ExplainBox>
          <Card className="border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle>All Money Movements</CardTitle>
              <CardDescription>
                Complete list of every payment, refund, and store-credit entry. &quot;Wallet after&quot; shows
                the customer&apos;s prepaid balance after each wallet change.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable
                data={payments}
                getRowKey={(row) => row.id}
                emptyMessage="No money movements recorded yet"
                columns={[
                  { id: "date", header: "When", cell: (row) => formatDate(row.payment_date) },
                  {
                    id: "kind",
                    header: "What happened",
                    cell: (row) => (
                      <div>
                        <Badge variant="outline" className="text-[10px]">
                          {PAYMENT_KIND_LABELS[row.kind ?? "payment"] ?? row.kind}
                        </Badge>
                        <p className="mt-1 max-w-[200px] text-[10px] text-muted-foreground">
                          {PAYMENT_KIND_HELP[row.kind ?? "payment"]}
                        </p>
                      </div>
                    ),
                  },
                  {
                    id: "amount",
                    header: "Amount",
                    cell: (row) => formatCurrency(row.amount),
                  },
                  {
                    id: "sale",
                    header: "Related sale",
                    cell: (row) =>
                      row.order?.order_number ? (
                        <span className="font-mono text-sm">{row.order.order_number}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">General account payment</span>
                      ),
                  },
                  {
                    id: "method",
                    header: "How paid",
                    cell: (row) => (
                      <div>
                        <span className="capitalize">{row.payment_method}</span>
                        {row.bank?.name && (
                          <p className="text-xs text-muted-foreground">{row.bank.name}</p>
                        )}
                      </div>
                    ),
                  },
                  {
                    id: "wallet",
                    header: "Wallet after",
                    cell: (row) =>
                      row.wallet_balance_after != null ? (
                        formatCurrency(row.wallet_balance_after)
                      ) : (
                        <span className="text-xs text-muted-foreground">Not a wallet entry</span>
                      ),
                  },
                  { id: "reference", header: "Reference #", cell: (row) => row.reference ?? "—" },
                  {
                    id: "notes",
                    header: "Details",
                    cell: (row) => (
                      <span className="max-w-xs text-xs text-muted-foreground">{row.notes ?? "—"}</span>
                    ),
                  },
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profile" className="space-y-4">
          <ExplainBox title="Contact & credit risk">
            Basic customer details and AI credit scores. Higher scores mean lower risk when selling on credit.
            Limits show the maximum credit sale value recommended per factory.
          </ExplainBox>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-border/60 bg-card/50">
              <CardHeader>
                <CardTitle>Contact Details</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="size-4 shrink-0 text-muted-foreground" />
                  {customer.email ?? "—"}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="size-4 shrink-0 text-muted-foreground" />
                  {customer.phone ?? "—"}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-xs font-medium text-muted-foreground">TIN</span>
                  {customer.tin ?? "—"}
                </div>
                {customer.address && (
                  <div className="flex items-start gap-2 text-sm sm:col-span-2">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    {customer.address}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-card/50">
              <CardHeader>
                <CardTitle>Credit Scores (Risk Check)</CardTitle>
                <CardDescription>
                  Used when deciding if this customer can buy on credit. Separate scores for block factory and
                  recycling factory.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg border border-border/60 p-3">
                  <p className="text-xl font-bold">{customer.credit_score_block ?? "—"}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Block
                    {customer.credit_risk_tier_block ? ` · ${customer.credit_risk_tier_block}` : ""}
                  </p>
                  {Number(customer.credit_limit_block ?? 0) > 0 && (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Limit {formatCurrency(Number(customer.credit_limit_block))}
                    </p>
                  )}
                </div>
                <div className="rounded-lg border border-border/60 p-3">
                  <p className="text-xl font-bold">{customer.credit_score_recycling ?? "—"}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Recycling
                    {customer.credit_risk_tier_recycling ? ` · ${customer.credit_risk_tier_recycling}` : ""}
                  </p>
                  {Number(customer.credit_limit_recycling ?? 0) > 0 && (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Limit {formatCurrency(Number(customer.credit_limit_recycling))}
                    </p>
                  )}
                </div>
                <div className="rounded-lg border border-border/60 p-3">
                  <p className="text-xl font-bold">{customer.credit_score ?? "—"}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Overall{customer.credit_risk_tier ? ` · ${customer.credit_risk_tier}` : ""}
                  </p>
                  {Number(customer.credit_limit ?? 0) > 0 && (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Limit {formatCurrency(Number(customer.credit_limit))}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle>Cash Summary</CardTitle>
              <CardDescription>Quick totals for real money in and out (not store credit wallet).</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3 text-sm">
              <div>
                <p className="text-muted-foreground">Total cash received</p>
                <p className="font-semibold">{formatCurrency(customer.total_paid)}</p>
                <p className="text-xs text-muted-foreground">All customer payments recorded</p>
              </div>
              <div>
                <p className="text-muted-foreground">Cash refunded back</p>
                <p className="font-semibold">{formatCurrency(customer.total_refunded)}</p>
                <p className="text-xs text-muted-foreground">Money returned after cancellations</p>
              </div>
              <div>
                <p className="text-muted-foreground">Sales not yet picked up</p>
                <p className="font-semibold">{formatCurrency(customer.pipeline_value)}</p>
                <p className="text-xs text-muted-foreground">Value of open sales waiting for pickup</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
