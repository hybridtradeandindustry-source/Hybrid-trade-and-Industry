import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { APP_CONFIG } from "@/lib/config";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = APP_CONFIG.currency) {
  if (currency === APP_CONFIG.currency) {
    return `${new Intl.NumberFormat(APP_CONFIG.locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount)} ${APP_CONFIG.currencyLabel}`;
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(value: number, decimals = 0) {
  return new Intl.NumberFormat(APP_CONFIG.locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Poliche loads are stored and displayed to 2 decimal places (e.g. 2.56). */
export function formatPolicheLoads(value: number) {
  return formatNumber(value, 2);
}

export function formatPercent(value: number, decimals = 1) {
  return `${formatNumber(value, decimals)}%`;
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

export function formatDateTime(date: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

export function calculateYieldRate(good: number, total: number) {
  if (total <= 0) return 0;
  return (good / total) * 100;
}

export function calculateDamageRate(damaged: number, total: number) {
  if (total <= 0) return 0;
  return (damaged / total) * 100;
}

export function generateOrderNumber() {
  return `SAL-${Date.now().toString().slice(-6)}`;
}

export function generateBatchNumber() {
  return `BATCH-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function generatePurchaseNumber() {
  return `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

export function generateItemSku(name: string) {
  const slug = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 12);
  return `MISC-${slug || "ITEM"}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function truncate(str: string, length: number) {
  if (str.length <= length) return str;
  return `${str.slice(0, length)}...`;
}

export function filterByFactoryScope<T extends { factory_id?: string | null }>(
  items: T[],
  scope: "combined" | "block" | "recycling",
  blockFactoryId: string,
  recyclingFactoryId: string
): T[] {
  if (scope === "combined") return items;
  const factoryId = scope === "block" ? blockFactoryId : recyclingFactoryId;
  return items.filter((item) => item.factory_id === factoryId);
}
