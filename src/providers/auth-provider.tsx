"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Profile, Permission } from "@/types";
import { clearDemoAuthCookies } from "@/lib/api/demo-auth";
import { createClient } from "@/lib/supabase/client";
import {
  loadAuthUserFromSupabase,
  signInWithSupabase,
  signOutFromSupabase,
} from "@/lib/auth/supabase-session";

export { ROLE_PERMISSIONS, ROLE_NAMES } from "@/lib/auth/role-permissions";

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  roleName: string;
  factory_id: string | null;
  organization_id: string;
  permissions: Permission[];
}

interface AuthContextValue {
  user: AuthUser | null;
  profile: Profile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  usesSupabase: boolean;
  login: (email: string, password: string) => Promise<{ error?: string; user?: AuthUser }>;
  logout: () => Promise<void>;
  hasPermission: (resource: string, action: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const STORAGE_KEY = "elecnova-auth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const supabase = createClient();
      const authUser = await loadAuthUserFromSupabase(supabase);
      if (!cancelled) {
        setUser(authUser);
        if (authUser) localStorage.setItem(STORAGE_KEY, JSON.stringify(authUser));
        else {
          localStorage.removeItem(STORAGE_KEY);
          clearDemoAuthCookies();
        }
      }
      if (!cancelled) setIsLoading(false);
    }

    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (email: string, password: string) => {
    const supabase = createClient();
    const result = await signInWithSupabase(supabase, email, password);
    if (result.error) return { error: result.error };
    if (result.user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(result.user));
      setUser(result.user);
      return { user: result.user };
    }
    return { error: "Login failed" };
  };

  const logout = async () => {
    const supabase = createClient();
    await signOutFromSupabase(supabase);
    localStorage.removeItem(STORAGE_KEY);
    clearDemoAuthCookies();
    setUser(null);
  };

  const hasPermission = (resource: string, action: string) => {
    if (!user) return false;
    if (user.role === "ceo") return true;
    return user.permissions.some(
      (p) =>
        (p.resource === resource && p.action === action) ||
        (p.resource === "*" && p.action === "*")
    );
  };

  const profile: Profile | null = user
    ? {
        id: user.id,
        organization_id: user.organization_id,
        email: user.email,
        full_name: user.full_name,
        factory_id: user.factory_id,
        is_active: true,
        mfa_enabled: user.role === "ceo" || user.role === "finance_manager",
      }
    : null;

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isLoading,
        isAuthenticated: !!user,
        usesSupabase: true,
        login,
        logout,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useRequireAuth() {
  return useAuth();
}
