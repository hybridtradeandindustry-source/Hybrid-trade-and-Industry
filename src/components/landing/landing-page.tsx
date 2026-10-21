"use client";

import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  BarChart3,
  Blocks,
  Brain,
  ChevronRight,
  Factory,
  LineChart,
  Package,
  Recycle,
  Shield,
  Smartphone,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand/brand-logo";
import { APP_DESCRIPTION, APP_NAME, APP_SHORT_NAME, APP_TAGLINE } from "@/constants";
import { cn } from "@/lib/utils";

const stats = [
  { label: "Factories", value: "2", sub: "Block + Recycling" },
  { label: "Modules", value: "15+", sub: "Fully integrated" },
  { label: "Checkpoints", value: "3", sub: "Production tracking" },
  { label: "Live sync", value: "24/7", sub: "Finance & inventory" },
];

const features = [
  {
    icon: BarChart3,
    title: "Finance Command Center",
    description: "Sage 50 mirror, reconciliation, expenses, and cash flow — one live picture of the business.",
    className: "md:col-span-2 md:row-span-1",
    accent: "from-[#80C342]/20 to-transparent",
  },
  {
    icon: Factory,
    title: "Smart Production",
    description: "Three-checkpoint counting with automatic yield and damage — no more evening tallies.",
    className: "md:col-span-1",
    accent: "from-[#00AEEF]/20 to-transparent",
  },
  {
    icon: Brain,
    title: "Hybrid AI",
    description: "Proactive alerts, executive briefings, and capacity insights before problems escalate.",
    className: "md:col-span-1",
    accent: "from-[#80C342]/15 to-[#00AEEF]/10",
  },
  {
    icon: Package,
    title: "Inventory Ledger",
    description: "Real-time stock, BOM consumption, low-stock alerts, and cycle counts.",
    className: "md:col-span-1",
    accent: "from-[#00AEEF]/15 to-transparent",
  },
  {
    icon: Smartphone,
    title: "Mobile Floor App",
    description: "Large buttons, offline sync, photo capture — built for workers on the factory floor.",
    className: "md:col-span-2",
    accent: "from-[#80C342]/10 to-[#00AEEF]/15",
  },
  {
    icon: Shield,
    title: "Audit & RBAC",
    description: "Every change logged. Role-based access enforced on the server.",
    className: "md:col-span-1",
    accent: "from-transparent to-[#80C342]/10",
  },
];

const factories = [
  {
    icon: Blocks,
    name: "Block Factory",
    color: "text-[#80C342]",
    border: "border-[#80C342]/30",
    glow: "shadow-[#80C342]/10",
    items: ["Cement & poliche tracking", "Curing checkpoint counts", "Batch yield analytics"],
  },
  {
    icon: Recycle,
    name: "Plastic Recycling",
    color: "text-[#00AEEF]",
    border: "border-[#00AEEF]/30",
    glow: "shadow-[#00AEEF]/10",
    items: ["Waste intake & sorting", "Pellet production cycle", "Stock plastic dashboard"],
  },
];

function GridBackground() {
  return (
    <div
      className="pointer-events-none absolute inset-0 opacity-[0.35]"
      style={{
        backgroundImage: `
          linear-gradient(to right, rgba(128,195,66,0.08) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(128,195,66,0.08) 1px, transparent 1px)
        `,
        backgroundSize: "64px 64px",
        maskImage: "radial-gradient(ellipse 80% 70% at 50% 0%, black, transparent)",
      }}
    />
  );
}

function HeroGlow() {
  return (
    <>
      <div className="pointer-events-none absolute -left-32 top-0 h-[500px] w-[500px] rounded-full bg-[#80C342]/20 blur-[120px]" />
      <div className="pointer-events-none absolute -right-20 top-32 h-[400px] w-[400px] rounded-full bg-[#00AEEF]/15 blur-[100px]" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-[300px] w-[800px] -translate-x-1/2 rounded-full bg-[#80C342]/8 blur-[80px]" />
    </>
  );
}

function DashboardPreview() {
  return (
    <div className="landing-float relative mx-auto w-full max-w-lg">
      <div className="absolute -inset-1 rounded-3xl bg-gradient-to-br from-[#80C342]/40 via-transparent to-[#00AEEF]/40 blur-sm" />
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0e1a26]/90 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-red-400/80" />
            <span className="size-2.5 rounded-full bg-amber-400/80" />
            <span className="size-2.5 rounded-full bg-[#80C342]/80" />
          </div>
          <span className="ml-2 text-[10px] font-medium uppercase tracking-widest text-white/40">
            {APP_SHORT_NAME} Dashboard
          </span>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Revenue", value: "2.4M", trend: "+12%", color: "#80C342" },
              { label: "Production", value: "48K", trend: "+8%", color: "#00AEEF" },
              { label: "Cash flow", value: "890K", trend: "+5%", color: "#80C342" },
            ].map((m) => (
              <div
                key={m.label}
                className="rounded-xl border border-white/8 bg-white/5 p-3"
              >
                <p className="text-[9px] uppercase tracking-wider text-white/45">{m.label}</p>
                <p className="mt-1 font-mono text-lg font-bold text-white">{m.value}</p>
                <p className="text-[10px] font-medium" style={{ color: m.color }}>
                  {m.trend}
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-white/8 bg-white/5 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium text-white/70">Weekly output</span>
              <LineChart className="size-4 text-[#80C342]" />
            </div>
            <div className="flex h-20 items-end gap-1.5">
              {[40, 65, 45, 80, 55, 90, 70, 85, 60, 95, 75, 88].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-sm bg-gradient-to-t from-[#80C342] to-[#00AEEF]/80 opacity-90"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            {["Finance", "Production", "Inventory"].map((tab, i) => (
              <span
                key={tab}
                className={cn(
                  "rounded-full px-3 py-1 text-[10px] font-medium",
                  i === 0
                    ? "bg-[#80C342]/20 text-[#80C342]"
                    : "bg-white/5 text-white/50"
                )}
              >
                {tab}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#060d18] text-white">
      <GridBackground />
      <HeroGlow />

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#060d18]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <BrandLogo variant="icon" href="/" className="[&_p]:text-white [&_.text-muted-foreground]:text-white/50" />
          <nav className="hidden items-center gap-8 text-sm text-white/60 md:flex">
            <a href="#features" className="transition-colors hover:text-[#80C342]">
              Features
            </a>
            <a href="#factories" className="transition-colors hover:text-[#80C342]">
              Factories
            </a>
            <a href="#platform" className="transition-colors hover:text-[#80C342]">
              Platform
            </a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <Button
              variant="ghost"
              asChild
              className="text-white/80 hover:bg-white/10 hover:text-white"
            >
              <Link href="/login">Sign in</Link>
            </Button>
            <Button
              asChild
              className="bg-gradient-to-r from-[#80C342] to-[#6aa832] text-white shadow-lg shadow-[#80C342]/25 hover:opacity-95"
            >
              <Link href="/login">
                Get Started
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-20 pt-16 lg:pb-28 lg:pt-24">
        <div className="grid items-center gap-16 lg:grid-cols-2 lg:gap-12">
          <div className="text-center lg:text-left">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#80C342]/30 bg-[#80C342]/10 px-4 py-1.5 text-sm text-[#80C342]">
              <Sparkles className="size-4" />
              {APP_TAGLINE}
            </div>

            <h1 className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl xl:text-7xl">
              <span className="bg-gradient-to-r from-[#80C342] via-[#9ad94a] to-[#00AEEF] bg-clip-text text-transparent">
                One platform.
              </span>
              <br />
              <span className="text-white">Two factories.</span>
              <br />
              <span className="text-white/90">Total control.</span>
            </h1>

            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-white/55 lg:mx-0">
              {APP_DESCRIPTION} Finance, production, inventory, sales, HR, and AI — unified for
              block manufacturing and plastic recycling.
            </p>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-4 lg:justify-start">
              <Button
                size="lg"
                asChild
                className="h-12 bg-gradient-to-r from-[#80C342] to-[#6aa832] px-8 text-base text-white shadow-xl shadow-[#80C342]/30 hover:opacity-95"
              >
                <Link href="/login">
                  Launch Dashboard
                  <ArrowRight className="size-5" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                asChild
                className="h-12 border-white/15 bg-white/5 px-8 text-base text-white hover:bg-white/10 hover:text-white"
              >
                <Link href="/mobile">
                  <Smartphone className="size-5" />
                  Mobile App
                </Link>
              </Button>
            </div>

            <div className="mt-12 grid grid-cols-2 gap-6 sm:grid-cols-4 lg:max-w-xl">
              {stats.map((s) => (
                <div key={s.label}>
                  <p className="font-mono text-2xl font-bold text-[#80C342] sm:text-3xl">{s.value}</p>
                  <p className="mt-0.5 text-xs font-medium text-white/80">{s.label}</p>
                  <p className="text-[10px] text-white/40">{s.sub}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute -right-4 top-8 hidden rounded-2xl border border-[#00AEEF]/20 bg-[#0e1a26]/80 px-4 py-3 shadow-xl backdrop-blur-md lg:block landing-float-delayed">
              <div className="flex items-center gap-2">
                <TrendingUp className="size-4 text-[#00AEEF]" />
                <span className="text-xs font-medium text-white/80">Yield up 8.2% this week</span>
              </div>
            </div>
            <DashboardPreview />
          </div>
        </div>
      </section>

      {/* Logo strip */}
      <section className="relative z-10 border-y border-white/5 bg-white/[0.02] py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-6 sm:flex-row sm:justify-between">
          <div className="overflow-hidden rounded-2xl bg-[#0e1a26] px-6 py-4">
            <Image
              src="/logo-full.jpg"
              alt={APP_NAME}
              width={280}
              height={80}
              className="h-14 w-auto object-contain sm:h-16"
            />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-white/40">
            {["Sage 50 Sync", "Real-time Inventory", "HR & Payroll", "Hybrid AI", "Mobile Floor"].map(
              (item) => (
                <span key={item} className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-[#80C342]" />
                  {item}
                </span>
              )
            )}
          </div>
        </div>
      </section>

      {/* Features bento */}
      <section id="features" className="relative z-10 mx-auto max-w-7xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#80C342]">
            Everything connected
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            Built for how you actually run a factory
          </h2>
          <p className="mt-4 text-white/50">
            Not another spreadsheet. A live operating system that ties the floor to finance.
          </p>
        </div>

        <div className="mt-16 grid gap-4 md:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className={cn(
                "group relative overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] p-6 transition-all duration-300 hover:border-[#80C342]/30 hover:bg-white/[0.05] hover:shadow-lg hover:shadow-[#80C342]/5",
                feature.className
              )}
            >
              <div
                className={cn(
                  "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-0 transition-opacity duration-300 group-hover:opacity-100",
                  feature.accent
                )}
              />
              <div className="relative">
                <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#80C342]/20 to-[#00AEEF]/20 text-[#80C342] ring-1 ring-white/10 transition-transform duration-300 group-hover:scale-110">
                  <feature.icon className="size-6" />
                </div>
                <h3 className="text-lg font-semibold text-white">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/50">{feature.description}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-[#80C342] opacity-0 transition-opacity group-hover:opacity-100">
                  Learn more <ChevronRight className="size-3" />
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Dual factory */}
      <section id="factories" className="relative z-10 mx-auto max-w-7xl px-6 py-12 pb-24">
        <div className="grid gap-6 lg:grid-cols-2">
          {factories.map((f) => (
            <div
              key={f.name}
              className={cn(
                "group relative overflow-hidden rounded-3xl border bg-[#0e1a26]/50 p-8 backdrop-blur-sm transition-all hover:shadow-2xl",
                f.border,
                f.glow
              )}
            >
              <div className="absolute -right-8 -top-8 size-32 rounded-full bg-gradient-to-br from-white/5 to-transparent blur-2xl" />
              <div className="relative flex items-start gap-4">
                <div className={cn("rounded-2xl bg-white/5 p-4 ring-1 ring-white/10", f.color)}>
                  <f.icon className="size-8" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white">{f.name}</h3>
                  <ul className="mt-4 space-y-2">
                    {f.items.map((item) => (
                      <li key={item} className="flex items-center gap-2 text-sm text-white/55">
                        <Zap className={cn("size-3.5 shrink-0", f.color)} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Platform CTA */}
      <section id="platform" className="relative z-10 mx-auto max-w-7xl px-6 pb-24">
        <div className="relative overflow-hidden rounded-3xl border border-[#80C342]/20">
          <div className="absolute inset-0 bg-gradient-to-br from-[#80C342]/15 via-[#0e1a26] to-[#00AEEF]/15" />
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImEiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTTAgMGg2MHY2MEgweiIgZmlsbD0ibm9uZSIvPjxwYXRoIGQ9Ik0zMCAwaDEwdjEwSDMweiIgZmlsbD0icmdiYSgxMjgsMTk1LDY2LDAuMDUpIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2EpIi8+PC9zdmc+')] opacity-50" />

          <div className="relative px-8 py-16 text-center sm:px-16 sm:py-20">
            <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-[#80C342]/20 ring-1 ring-[#80C342]/30">
              <Users className="size-8 text-[#80C342]" />
            </div>
            <h2 className="mx-auto mt-6 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
              Ready to run both factories from one screen?
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-white/55">
              Production counting at three checkpoints. Sage reconciliation. Role-scoped AI that
              speaks up before problems escalate.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Button
                size="lg"
                asChild
                className="h-12 bg-white px-8 text-base font-semibold text-[#0e1a26] hover:bg-white/90"
              >
                <Link href="/login">
                  Start with Demo Access
                  <ArrowRight className="size-5" />
                </Link>
              </Button>
            </div>
            <p className="mt-6 font-mono text-xs text-white/35">
              demo · ceo@hybridfactory.com / demo1234
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 bg-[#040a12]">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 py-10 sm:flex-row">
          <BrandLogo variant="icon" showText className="[&_p]:text-white [&_.text-muted-foreground]:text-white/40" />
          <p className="text-center text-sm text-white/35">
            © {new Date().getFullYear()} {APP_NAME}. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm text-white/40">
            <Link href="/login" className="transition-colors hover:text-[#80C342]">
              Sign in
            </Link>
            <Link href="/mobile" className="transition-colors hover:text-[#80C342]">
              Mobile
            </Link>
          </div>
        </div>
      </footer>

      <style jsx global>{`
        @keyframes landing-float {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-10px);
          }
        }
        .landing-float {
          animation: landing-float 6s ease-in-out infinite;
        }
        .landing-float-delayed {
          animation: landing-float 6s ease-in-out 1.5s infinite;
        }
      `}</style>
    </div>
  );
}
