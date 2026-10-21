export type FinancePeriod =
  | "this_month"
  | "last_month"
  | "last_3_months"
  | "specific_month"
  | "custom";

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function monthBounds(year: number, month: number): { from: string; to: string } {
  const from = new Date(year, month, 1);
  const to = new Date(year, month + 1, 0);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export function resolveFinanceDateRange(
  period: FinancePeriod,
  options?: { dateFrom?: string; dateTo?: string; monthYear?: string }
): { from: string; to: string; label: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  if (period === "this_month") {
    const bounds = monthBounds(year, month);
    return { ...bounds, label: "This month" };
  }

  if (period === "last_month") {
    const d = new Date(year, month - 1, 1);
    const bounds = monthBounds(d.getFullYear(), d.getMonth());
    return { ...bounds, label: "Last month" };
  }

  if (period === "last_3_months") {
    const from = new Date(year, month - 2, 1);
    const to = new Date(year, month + 1, 0);
    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      label: "Last 3 months",
    };
  }

  if (period === "specific_month" && options?.monthYear) {
    const [y, m] = options.monthYear.split("-").map(Number);
    if (y && m) {
      const bounds = monthBounds(y, m - 1);
      const label = new Date(y, m - 1, 1).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
      return { ...bounds, label };
    }
  }

  const from = options?.dateFrom || todayIsoDate();
  const to = options?.dateTo || todayIsoDate();
  return { from, to, label: "Custom range" };
}

export function financePeriodLabel(period: FinancePeriod): string {
  if (period === "this_month") return "This month";
  if (period === "last_month") return "Last month";
  if (period === "last_3_months") return "Last 3 months";
  if (period === "specific_month") return "Specific month";
  return "Custom range";
}

export function monthYearOptions(count = 12): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    options.push({ value, label });
  }
  return options;
}
