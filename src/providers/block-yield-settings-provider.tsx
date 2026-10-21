"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  BLOCK_YIELDS,
  CEMENT_KG_PER_BAG as DEFAULT_CEMENT_KG_PER_BAG,
  type BlockSizeCm,
  type BlockYieldSpec,
} from "@/lib/block-factory/yields";
import { useAuth } from "@/providers/auth-provider";

// ── Types ──────────────────────────────────────────────────────────────────────

export type YieldOverrideMap = Partial<
  Record<
    BlockSizeCm,
    Partial<Pick<BlockYieldSpec, "blocksPerCementBag" | "platesPerBag" | "blocksPerPlate" | "blocksPerPolicheLoad">>
  >
>;

export type BlockYieldSettings = {
  /** Resolved yield specs — merges defaults with user overrides */
  yields: Record<BlockSizeCm, BlockYieldSpec>;
  /** Kg per cement bag (shared global constant) */
  cementKgPerBag: number;
  /** Raw override map as stored */
  overrides: YieldOverrideMap;
  /** Update one or more size overrides */
  setOverrides: (next: YieldOverrideMap) => void;
  /** Reset all overrides to factory defaults */
  resetToDefaults: () => void;
};

// ── Context ────────────────────────────────────────────────────────────────────

const BlockYieldSettingsContext = createContext<BlockYieldSettings | null>(null);

function storageKey(orgId: string) {
  return `block_yield_overrides_${orgId}`;
}

function loadOverrides(orgId: string): YieldOverrideMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(storageKey(orgId));
    return raw ? (JSON.parse(raw) as YieldOverrideMap) : {};
  } catch {
    return {};
  }
}

function saveOverrides(orgId: string, overrides: YieldOverrideMap) {
  try {
    localStorage.setItem(storageKey(orgId), JSON.stringify(overrides));
  } catch {
    // ignore storage quota issues
  }
}

function resolveYields(overrides: YieldOverrideMap): Record<BlockSizeCm, BlockYieldSpec> {
  const sizes: BlockSizeCm[] = [10, 15, 20, 24];
  const result = {} as Record<BlockSizeCm, BlockYieldSpec>;
  for (const size of sizes) {
    const base = BLOCK_YIELDS[size];
    const ov = overrides[size] ?? {};
    result[size] = {
      ...base,
      blocksPerCementBag: ov.blocksPerCementBag ?? base.blocksPerCementBag,
      platesPerBag: ov.platesPerBag ?? base.platesPerBag,
      blocksPerPlate: ov.blocksPerPlate ?? base.blocksPerPlate,
      blocksPerPolicheLoad: ov.blocksPerPolicheLoad ?? base.blocksPerPolicheLoad,
    };
  }
  return result;
}

// ── Provider ───────────────────────────────────────────────────────────────────

export function BlockYieldSettingsProvider({
  orgId,
  children,
}: {
  orgId: string;
  children: React.ReactNode;
}) {
  const [overrides, setOverridesState] = useState<YieldOverrideMap>(() =>
    orgId ? loadOverrides(orgId) : {}
  );

  // Re-load when orgId changes (user switches org)
  useEffect(() => {
    if (orgId) setOverridesState(loadOverrides(orgId));
  }, [orgId]);

  const setOverrides = useCallback(
    (next: YieldOverrideMap) => {
      const merged = { ...overrides, ...next };
      setOverridesState(merged);
      if (orgId) saveOverrides(orgId, merged);
    },
    [overrides, orgId]
  );

  const resetToDefaults = useCallback(() => {
    setOverridesState({});
    if (orgId) localStorage.removeItem(storageKey(orgId));
  }, [orgId]);

  const yields = useMemo(() => resolveYields(overrides), [overrides]);

  const value = useMemo<BlockYieldSettings>(
    () => ({
      yields,
      cementKgPerBag: DEFAULT_CEMENT_KG_PER_BAG,
      overrides,
      setOverrides,
      resetToDefaults,
    }),
    [yields, overrides, setOverrides, resetToDefaults]
  );

  return (
    <BlockYieldSettingsContext.Provider value={value}>
      {children}
    </BlockYieldSettingsContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useBlockYieldSettings(): BlockYieldSettings {
  const ctx = useContext(BlockYieldSettingsContext);
  if (!ctx) {
    // Outside of provider — return static defaults (safe fallback for server)
    return {
      yields: resolveYields({}),
      cementKgPerBag: DEFAULT_CEMENT_KG_PER_BAG,
      overrides: {},
      setOverrides: () => {},
      resetToDefaults: () => {},
    };
  }
  return ctx;
}

// ── Bridge (mounts provider with orgId from auth) ──────────────────────────────

/**
 * Reads the current user's organization_id from AuthProvider and wraps
 * children with BlockYieldSettingsProvider. Place this inside <AuthProvider>.
 */
export function BlockYieldSettingsBridge({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const orgId = user?.organization_id ?? "";
  return (
    <BlockYieldSettingsProvider orgId={orgId}>
      {children}
    </BlockYieldSettingsProvider>
  );
}
