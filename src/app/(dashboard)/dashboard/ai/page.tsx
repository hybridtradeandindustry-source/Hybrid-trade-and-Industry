"use client";

import { useState, useEffect, useRef } from "react";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  MessageSquare,
  RefreshCw,
  Send,
  Sparkles,
  DollarSign,
  Factory,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Trash2,
  TrendingUp,
  LineChart as LineIcon,
} from "lucide-react";
import { AiDashboard } from "@/components/ai/ai-dashboard";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAi,
  useRefreshAi,
  useProductionCapacity,
  useProductionIntelligence,
} from "@/hooks/use-api";
import { useAuth } from "@/providers/auth-provider";
import { useAppStore } from "@/stores/app-store";
import { cn, formatDateTime, formatPercent, formatNumber, formatCurrency, formatPolicheLoads } from "@/lib/utils";
import type { AiAlert, AiBriefing, ViewScope } from "@/types";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  time: string;
  tools?: string[];
}

interface ChatThread {
  id: string;
  name: string;
  role: "ceo" | "finance" | "production" | "warehouse";
  messages: ChatMessage[];
  isDefault: boolean;
  createdAt: string;
  /** Factory scope this thread was created under. Missing on threads saved
   * before this field existed — those are treated as "combined" so they
   * never resurface inside a specific factory's scoped view. */
  scope?: ViewScope;
}

const BLOCK_DEFAULT_SUGGESTIONS = [
  "How many 20cm blocks can we produce today?",
  "Which customers have the highest credit risk?",
  "What batches are overdue?",
  "Summarize this month's cash flow",
];

const RECYCLING_DEFAULT_SUGGESTIONS = [
  "How much recycled plastic did we produce today?",
  "What's our current raw material and finished pellet stock?",
  "Which recycling customers have outstanding credit?",
  "Summarize this month's recycling cash flow",
];

function getDefaultSuggestions(isRecyclingScope: boolean) {
  return isRecyclingScope ? RECYCLING_DEFAULT_SUGGESTIONS : BLOCK_DEFAULT_SUGGESTIONS;
}

/**
 * The model sometimes writes a visible "Follow-up suggestions" heading right before the
 * <suggestions> tag, even though the tag's contents are rendered separately as clickable
 * chips — stripping only the tag left that orphan heading behind in the message body.
 */
function stripSuggestionsArtifacts(text: string): string {
  return text
    .replace(/<suggestions>[\s\S]*?<\/suggestions>/g, "")
    .replace(/^\s*#{0,6}\s*\*{0,2}follow-?up\s+(suggestions|questions|prompts)\*{0,2}:?\s*$/gim, "")
    .trim();
}

const ASSISTANTS = [
  { id: "ceo", name: "CEO Assistant", desc: "Executive metrics, capacity planning, risk", icon: Brain },
  { id: "finance", name: "Finance Manager", desc: "Cash flow, collections, revenue graphs", icon: DollarSign },
  { id: "production", name: "Production Supervisor", desc: "Batch progress, waste stats, yield", icon: Factory },
  { id: "warehouse", name: "Warehouse Officer", desc: "Inventory summary, low-stock reorders", icon: Package },
];

const ESTIMATED_PRICES: Record<number, number> = {
  20: 28, // 28 ETB for 20cm
  15: 22, // 22 ETB for 15cm
  10: 18, // 18 ETB for 10cm
  24: 34, // 34 ETB for 24cm
};

export default function AIPage() {
  const { hasPermission, user } = useAuth();
  const { viewScope } = useAppStore();
  const isRecyclingScope = viewScope === "recycling";
  const defaultRole = (user?.role || "ceo") as "ceo" | "finance" | "production" | "warehouse";

  // Navigation & UI States
  const [activeThreadId, setActiveThreadId] = useState<string>(defaultRole);
  const [activeTab, setActiveTab] = useState<"chat" | "predictions">("chat");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [customThreads, setCustomThreads] = useState<ChatThread[]>([]);

  // Modals
  const [isBriefingOpen, setIsBriefingOpen] = useState(false);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);

  // Only show/allow threads that belong to the currently selected factory
  // scope — a Block Factory chat must never be reachable while viewing
  // Plastic Recycling, and vice versa. Untagged legacy threads only show
  // under "combined".
  const visibleCustomThreads = customThreads.filter(
    (t) => (t.scope ?? "combined") === viewScope
  );

  // Active role is determined by the selected thread's role
  const activeThread =
    visibleCustomThreads.find((t) => t.id === activeThreadId) ||
    ({
      id: activeThreadId,
      name: ASSISTANTS.find((a) => a.id === activeThreadId)?.name || "Hybrid AI Assistant",
      role: activeThreadId as any,
      messages: [],
      isDefault: true,
      createdAt: new Date().toISOString(),
    } as ChatThread);

  const activeRole = activeThread.role;

  // React Query ground calls
  const { data, isLoading, chatMutation, resolveAlertMutation, refetch } = useAi(activeRole);
  const { data: capacityData, isLoading: isCapacityLoading, refetch: refetchCapacity } = useProductionCapacity();
  const { data: intelligenceData, isLoading: isIntelLoading, refetch: refetchIntel } = useProductionIntelligence();
  const refreshAi = useRefreshAi();

  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>(getDefaultSuggestions(isRecyclingScope));
  const chatBottomRef = useRef<HTMLDivElement>(null);
  // Always holds the latest `messages` — read this (not `messages` directly)
  // inside callbacks that fire after a delay (mutation success, typewriter
  // completion), since those closures otherwise see a stale pre-render snapshot.
  const messagesRef = useRef<ChatMessage[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  // Synchronous send lock. `chatMutation.isPending` is React state — it only
  // flips after a re-render, so two `ask()` calls in the SAME tick (e.g. a
  // very fast double-click/double-Enter, or two event handlers firing back
  // to back before React processes the first state update) can both read
  // isPending as still false and both go through. A ref is mutated
  // synchronously and is visible immediately to the second call, so it's the
  // only guard that actually closes a same-tick double-fire.
  const isSendingRef = useRef(false);

  // Auto-scroll to bottom whenever messages or streaming content change
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // Hybrid AI Predictions is Block Factory-only (cement/poliche capacity); fall
  // back to chat if the scope is recycling while it's active.
  const effectiveTab = isRecyclingScope && activeTab === "predictions" ? "chat" : activeTab;

  // Load custom threads from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("nova_custom_threads");
      if (saved) {
        setCustomThreads(JSON.parse(saved));
      }
    } catch (err) {
      console.warn("Failed to load custom threads:", err);
    }
  }, []);

  // Sync custom threads to localStorage
  const saveCustomThreads = (updated: ChatThread[]) => {
    setCustomThreads(updated);
    try {
      localStorage.setItem("nova_custom_threads", JSON.stringify(updated));
    } catch (err) {
      console.warn("Failed to save custom threads:", err);
    }
  };

  // Reset to a default (scope-correct) thread whenever the top-navbar scope
  // changes, so a stale thread from the other factory never stays on screen.
  const [lastSeenScope, setLastSeenScope] = useState(viewScope);
  if (viewScope !== lastSeenScope) {
    setLastSeenScope(viewScope);
    setActiveThreadId(defaultRole);
    setSuggestions(getDefaultSuggestions(isRecyclingScope));
  }

  // Sync messages state depending on active thread
  useEffect(() => {
    if (activeThread.isDefault) {
      // For default threads, load grounding messages from the DB
      if (data?.chatHistory) {
        setMessages(
          (data.chatHistory as any[]).map((m: any) => ({
            role: m.role,
            content: m.content,
            time: m.time || new Date().toISOString(),
            tools: m.tools,
          }))
        );
      } else {
        setMessages([]);
      }
    } else {
      // For custom threads, load messages from local thread state
      setMessages(activeThread.messages);
    }
  }, [activeThreadId, data?.chatHistory, customThreads]);

  // Create new custom chat session
  const handleNewChat = (roleType: "ceo" | "finance" | "production" | "warehouse" = activeRole) => {
    const roleName = ASSISTANTS.find((a) => a.id === roleType)?.name || "Assistant";
    const dateStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const newThread: ChatThread = {
      id: `custom_${Date.now()}`,
      name: `New ${roleName} (${dateStr})`,
      role: roleType,
      messages: [],
      isDefault: false,
      createdAt: new Date().toISOString(),
      scope: viewScope,
    };

    saveCustomThreads([newThread, ...customThreads]);
    setActiveThreadId(newThread.id);
    toast.success(`Started new chat with ${roleName}`);
  };

  // Delete a custom chat session
  const handleDeleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customThreads.filter((t) => t.id !== id);
    saveCustomThreads(updated);
    if (activeThreadId === id) {
      setActiveThreadId(defaultRole);
    }
    toast.success("Chat session deleted");
  };

  const parseInlineMarkdown = (text: string): React.ReactNode[] => {
    const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`)/g;
    const parts = text.split(regex);

    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i} className="font-bold text-foreground">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("*") && part.endsWith("*")) {
        return <em key={i} className="italic text-muted-foreground">{part.slice(1, -1)}</em>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return <code key={i} className="bg-muted px-1.5 py-0.5 rounded font-mono text-[10px] text-primary">{part.slice(1, -1)}</code>;
      }
      return part;
    });
  };

  const renderRichMarkdown = (text: string) => {
    if (!text) return null;
    const lines = text.split("\n");
    const elements: React.ReactNode[] = [];

    let inTable = false;
    let tableHeaders: string[] = [];
    let tableRows: string[][] = [];

    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx].trim();

      if (line.startsWith("|") && line.endsWith("|")) {
        // Skip separator line like |---|---|
        // Escaping the hyphen in the character class [\s:\-|] to avoid creating an ASCII range
        if (/^\|[\s:\-|]*$/.test(line) || /^\|[\s:\-|]+\|$/.test(line)) {
          continue;
        }

        const cells = line
          .split("|")
          .map((c) => c.trim())
          .filter((c, i, arr) => i > 0 && i < arr.length - 1);

        if (!inTable) {
          inTable = true;
          tableHeaders = cells;
          tableRows = [];
        } else {
          tableRows.push(cells);
        }
        continue;
      }

      // Render table if we just exited table mode
      if (inTable) {
        elements.push(
          <div key={`table-${idx}`} className="overflow-x-auto my-3 border border-border/60 rounded-lg bg-background/50 shadow-sm">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                  {tableHeaders.map((h, i) => (
                    <th key={i} className="p-2.5 font-bold">{parseInlineMarkdown(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, rIdx) => (
                  <tr key={rIdx} className="border-b border-border/40 hover:bg-muted/10 last:border-0">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="p-2.5 text-foreground/95 font-medium">{parseInlineMarkdown(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        inTable = false;
      }

      // Headers
      if (line.startsWith("### ")) {
        elements.push(
          <h4 key={idx} className="text-xs font-bold text-foreground mt-3 mb-1.5 first:mt-0">
            {parseInlineMarkdown(line.slice(4))}
          </h4>
        );
      } else if (line.startsWith("## ")) {
        elements.push(
          <h3 key={idx} className="text-sm font-bold text-foreground mt-4 mb-2 first:mt-0">
            {parseInlineMarkdown(line.slice(3))}
          </h3>
        );
      } else if (line.startsWith("# ")) {
        elements.push(
          <h2 key={idx} className="text-base font-bold text-foreground mt-5 mb-2.5 first:mt-0">
            {parseInlineMarkdown(line.slice(2))}
          </h2>
        );
      } else if (line.startsWith("- ") || line.startsWith("* ")) {
        elements.push(
          <ul key={idx} className="list-disc list-inside ml-2 my-0.5">
            <li className="text-xs text-foreground/95">
              {parseInlineMarkdown(line.slice(2))}
            </li>
          </ul>
        );
      } else if (line.startsWith("> ")) {
        elements.push(
          <blockquote key={idx} className="border-l-4 border-primary/40 bg-primary/5 pl-3 py-1.5 my-2 rounded-r-lg text-xs italic text-muted-foreground">
            {parseInlineMarkdown(line.slice(2))}
          </blockquote>
        );
      } else if (line === "") {
        elements.push(<div key={idx} className="h-1.5" />);
      } else {
        const orderedMatch = line.match(/^(\d+)\.\s(.*)$/);
        if (orderedMatch) {
          elements.push(
            <ol key={idx} className="list-decimal list-inside ml-2 my-0.5">
              <li className="text-xs text-foreground/95">
                {parseInlineMarkdown(orderedMatch[2])}
              </li>
            </ol>
          );
        } else {
          elements.push(
            <p key={idx} className="text-xs leading-relaxed text-foreground/95 my-0.5">
              {parseInlineMarkdown(line)}
            </p>
          );
        }
      }
    }

    if (inTable) {
      elements.push(
        <div key="table-end" className="overflow-x-auto my-3 border border-border/60 rounded-lg bg-background/50 shadow-sm">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                {tableHeaders.map((h, i) => (
                  <th key={i} className="p-2.5 font-bold">{parseInlineMarkdown(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, rIdx) => (
                <tr key={rIdx} className="border-b border-border/40 hover:bg-muted/10 last:border-0">
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="p-2.5 text-foreground/95 font-medium">{parseInlineMarkdown(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    return elements;
  };

  const renderMessageContent = (content: string) => {
    if (!content) return null;
    const withoutSuggestions = stripSuggestionsArtifacts(content);
    const parts = withoutSuggestions.split(/(<dashboard>[\s\S]*?<\/dashboard>)/g);
    return parts.map((part, i) => {
      if (part.startsWith("<dashboard>") && part.endsWith("</dashboard>")) {
        const jsonStr = part.slice("<dashboard>".length, -"</dashboard>".length).trim();
        try {
          const parsed = JSON.parse(jsonStr);
          return <AiDashboard key={i} data={parsed} />;
        } catch (err) {
          console.error("Failed to parse dashboard JSON:", err);
          return (
            <div key={i} className="text-xs text-destructive bg-destructive/10 p-2.5 my-2 rounded-lg border border-destructive/20 font-mono">
              Error rendering Hybrid AI Dashboard. Raw payload:
              <pre className="mt-1.5 overflow-x-auto text-[10px] whitespace-pre-wrap bg-background p-2 rounded">{jsonStr}</pre>
            </div>
          );
        }
      }
      return <div key={i} className="space-y-1">{renderRichMarkdown(part)}</div>;
    });
  };

  const briefing = (data?.briefing ?? {
    summary: "",
    confidence_level: 0,
    generated_at: new Date().toISOString(),
    data_gaps: {},
  }) as AiBriefing;
  const alerts = (data?.alerts ?? []) as AiAlert[];
  const missingData = (data?.missingData ?? []) as string[];

  const dataGaps = briefing.data_gaps ?? {};
  const gapEntries = Object.entries(dataGaps);
  const openAlerts = alerts.filter((a) => !a.is_resolved);

  const handleResolve = (alert: AiAlert) => {
    resolveAlertMutation.mutate(alert.id, {
      onSuccess: () => {
        toast.success(`Alert "${alert.title}" resolved`);
        void refetch();
      },
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Failed to resolve alert"),
    });
  };

  const handleRefresh = () => {
    refreshAi.mutate(
      { useLlm: true },
      {
        onSuccess: () => {
          void refetch();
          void refetchCapacity();
          void refetchIntel();
          toast.success("Hybrid AI intelligence synced with live ERP data");
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Sync failed"),
      }
    );
  };

  const ask = (userMessage: string) => {
    if (!userMessage.trim()) return;
    // Synchronous lock first — closes same-tick double-fires that a state
    // check (isPending) cannot, since state updates aren't visible until the
    // next render. This is the ONLY thing standing between a fast
    // double-click/double-Enter and two independent chat requests for the
    // same question, both of which would get answered and appended.
    if (isSendingRef.current) return;
    if (chatMutation.isPending || streamingContent !== null) return;
    if (!hasPermission("ai", "chat") && !hasPermission("ai", "read")) {
      toast.error("You don't have permission to use AI chat");
      return;
    }
    isSendingRef.current = true;

    setQuery("");
    const newMsg: ChatMessage = { role: "user", content: userMessage, time: new Date().toISOString() };

    // Never read `messages` from this closure directly below — `ask()` is
    // defined fresh each render, but its callbacks fire well after this
    // render (post-mutation, post-typewriter), so a captured `messages`
    // snapshot is stale by then. messagesRef always holds the latest value.
    const messagesAfterUser = [...messagesRef.current, newMsg];
    setMessages(messagesAfterUser);
    if (!activeThread.isDefault) {
      const updatedThreads = customThreads.map((t) =>
        t.id === activeThreadId ? { ...t, messages: messagesAfterUser } : t
      );
      saveCustomThreads(updatedThreads);
    }

    chatMutation.mutate(userMessage, {
      onSuccess: (result) => {
        isSendingRef.current = false;
        // Parse out <suggestions> tag from reply
        const suggestionsMatch = result.reply.match(/<suggestions>([\s\S]*?)<\/suggestions>/);
        let cleanReply = stripSuggestionsArtifacts(result.reply);
        if (suggestionsMatch) {
          try {
            const parsed = JSON.parse(suggestionsMatch[1]) as string[];
            if (Array.isArray(parsed) && parsed.length > 0) {
              setSuggestions(parsed);
            }
          } catch {
            // Fallback to defaults if parsing fails
          }
        }

        const replyMsg: ChatMessage = {
          role: "assistant",
          content: cleanReply,
          time: new Date().toISOString(),
          tools: result.tools_used,
        };

        // Typewriter streaming effect
        setStreamingContent("");
        let i = 0;
        const chars = cleanReply.split("");
        const tick = setInterval(() => {
          i += 6; // advance 6 chars per tick for snappy feel
          setStreamingContent(cleanReply.slice(0, i));
          if (i >= chars.length) {
            clearInterval(tick);
            setStreamingContent(null);
            if (!activeThread.isDefault) {
              const updatedMessages = [...messagesRef.current, replyMsg];
              setMessages(updatedMessages);
              const updatedThreads = customThreads.map((t) =>
                t.id === activeThreadId
                  ? {
                      ...t,
                      messages: updatedMessages,
                      name: t.name.startsWith("New ")
                        ? userMessage.slice(0, 22) + (userMessage.length > 22 ? "..." : "")
                        : t.name,
                    }
                  : t
              );
              saveCustomThreads(updatedThreads);
            } else {
              setMessages((prev) => [...prev, replyMsg]);
              void refetch();
            }
          }
        }, 16); // ~60fps
      },
      onError: (err) => {
        isSendingRef.current = false;
        toast.error(err instanceof Error ? err.message : "AI chat failed");
      },
    });
  };

  const handleAsk = () => ask(query.trim());

  if (isLoading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 lg:grid-cols-4">
          <Skeleton className="h-72 lg:col-span-1" />
          <Skeleton className="h-96 lg:col-span-3" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hybrid AI Intelligence Workspace"
        description="Dual-pane AI brain — Chat with specialized agents, build dynamic dashboards, and manage active alerts."
      />

      <div className="flex gap-6 items-start relative min-h-[calc(100vh-220px)]">
        {/* Left Sidebar: Collapsible Chat Session Pane */}
        <div
          className={cn(
            "flex flex-col gap-4 shrink-0 transition-all duration-300 ease-in-out",
            isSidebarCollapsed ? "w-16" : "w-72"
          )}
        >
          <Card className="border-border/60 bg-card/60 flex flex-col max-h-[calc(100vh-220px)] overflow-hidden">
            <CardHeader className="p-4 border-b border-border/40 flex flex-row items-center justify-between space-y-0 shrink-0">
              {!isSidebarCollapsed && (
                <div>
                  <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                    <Brain className="size-4 text-primary animate-pulse" />
                    Hybrid AI Workspace
                  </CardTitle>
                </div>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="size-8 ml-auto text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-lg"
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {isSidebarCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
              </Button>
            </CardHeader>

            <ScrollArea className="flex-1 p-2 space-y-4 overflow-y-auto">
              <div className="px-1 py-1 shrink-0">
                <Button
                  onClick={() => handleNewChat()}
                  className={cn(
                    "w-full h-9 gap-2 shadow-sm rounded-lg bg-primary hover:bg-primary/95 text-xs font-semibold",
                    isSidebarCollapsed ? "px-0 justify-center" : "justify-start px-3"
                  )}
                  title="New Custom Chat"
                >
                  <Plus className="size-4" />
                  {!isSidebarCollapsed && <span>New Chat</span>}
                </Button>
              </div>

              {/* Expert Roles */}
              <div className="space-y-1">
                {!isSidebarCollapsed && (
                  <p className="text-[9px] font-bold text-muted-foreground uppercase px-2 py-1 tracking-wider">
                    Expert Roles
                  </p>
                )}
                {ASSISTANTS.map((assistant) => {
                  const Icon = assistant.icon;
                  const active = activeThreadId === assistant.id;
                  return (
                    <Button
                      key={assistant.id}
                      variant={active ? "secondary" : "ghost"}
                      className={cn(
                        "w-full justify-start text-left h-auto border border-transparent rounded-lg transition-all duration-150",
                        isSidebarCollapsed ? "p-3 justify-center" : "p-2.5 gap-3",
                        active && "border-primary/20 bg-primary/5 text-primary"
                      )}
                      onClick={() => setActiveThreadId(assistant.id)}
                      title={assistant.name}
                    >
                      <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                      {!isSidebarCollapsed && (
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-xs font-bold leading-none">{assistant.name}</span>
                          <span className="text-[9px] text-muted-foreground truncate leading-none mt-1">{assistant.desc}</span>
                        </div>
                      )}
                    </Button>
                  );
                })}
              </div>

              {/* Custom Threads */}
              {visibleCustomThreads.length > 0 && (
                <div className="space-y-1 pt-3 border-t border-border/40">
                  {!isSidebarCollapsed && (
                    <p className="text-[9px] font-bold text-muted-foreground uppercase px-2 py-1 tracking-wider">
                      Recent Chats
                    </p>
                  )}
                  {visibleCustomThreads.map((thread) => {
                    const active = activeThreadId === thread.id;
                    return (
                      <Button
                        key={thread.id}
                        variant={active ? "secondary" : "ghost"}
                        className={cn(
                          "w-full group justify-start text-left h-auto border border-transparent rounded-lg p-2.5 gap-2 transition-all duration-150",
                          isSidebarCollapsed ? "p-3 justify-center" : "p-2.5",
                          active && "border-primary/20 bg-primary/5 text-primary"
                        )}
                        onClick={() => setActiveThreadId(thread.id)}
                        title={thread.name}
                      >
                        <MessageSquare className="size-4 text-muted-foreground shrink-0" />
                        {!isSidebarCollapsed && (
                          <div className="flex items-center justify-between w-full min-w-0">
                            <span className="text-xs font-semibold truncate leading-none mr-2">{thread.name}</span>
                            <span
                              onClick={(e) => handleDeleteChat(thread.id, e)}
                              className="size-5 rounded hover:bg-muted-foreground/10 text-muted-foreground hover:text-destructive flex items-center justify-center shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                              title="Delete session"
                            >
                              <Trash2 className="size-3" />
                            </span>
                          </div>
                        )}
                      </Button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </Card>

          {!isSidebarCollapsed && (
            <Card className="border-border/60 bg-card/50">
              <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Grounded Summary
                </CardTitle>
                <Badge variant="outline" className="gap-0.5 text-[9px] px-1 py-0.5">
                  <Sparkles className="size-3 text-primary animate-pulse" />
                  Grounded: {formatPercent(briefing.confidence_level * 100, 0)}
                </Badge>
              </CardHeader>
              <CardContent className="p-4 pt-1 space-y-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-muted-foreground leading-none">
                    <span>ground accuracy</span>
                    <span>{formatPercent(briefing.confidence_level * 100, 0)}</span>
                  </div>
                  <Progress value={briefing.confidence_level * 100} className="h-1.5" />
                </div>

                {briefing.summary && (
                  <div className="rounded-lg border border-border bg-background/50 p-2.5 space-y-2">
                    <h4 className="text-[10px] font-bold text-foreground flex items-center gap-1">
                      <Brain className="size-3 text-primary" />
                      Briefing
                    </h4>
                    <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-3">
                      {briefing.summary}
                    </p>
                    <Button
                      variant="link"
                      className="p-0 h-auto text-[9px] text-primary font-semibold hover:underline"
                      onClick={() => setIsBriefingOpen(true)}
                    >
                      Open Full Briefing
                    </Button>
                  </div>
                )}

                <div className="flex items-center justify-between text-[10px] border-t border-border/40 pt-2 font-medium">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <AlertTriangle className="size-3 text-warning" />
                    Active Alerts
                  </span>
                  <Badge variant={openAlerts.length > 0 ? "destructive" : "secondary"} className="text-[9px]">
                    {openAlerts.length}
                  </Badge>
                </div>

                {openAlerts.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-[10px] h-7 gap-1 rounded-lg"
                    onClick={() => setIsAlertsOpen(true)}
                  >
                    Manage Alerts ({openAlerts.length})
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Pane: LLM Spacious Tabbed Window */}
        <div className="flex-1 min-w-0">
          <Card className="border-border/60 bg-card/40 flex flex-col h-[calc(100vh-220px)] shadow-lg backdrop-blur-sm overflow-hidden rounded-xl">
            {/* Header */}
            <CardHeader className="p-4 border-b border-border/60 bg-card/60 flex flex-row items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Brain className="size-5 text-primary animate-pulse" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                    Hybrid AI: {activeThread.name}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Assistant context: <span className="font-bold text-foreground uppercase">{activeRole}</span>
                  </CardDescription>
                </div>
              </div>

              <div>
                {(hasPermission("ai", "refresh") || hasPermission("ai", "read")) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs bg-background/50 hover:bg-background/80"
                    disabled={refreshAi.isPending}
                    onClick={handleRefresh}
                  >
                    <RefreshCw className={`size-3.5 ${refreshAi.isPending ? "animate-spin" : ""}`} />
                    Sync ERP Data
                  </Button>
                )}
              </div>
            </CardHeader>

            {/* TAB SELECTOR HEADER */}
            <div className="flex border-b border-border/40 bg-card/50 px-4 shrink-0 gap-4">
              <button
                className={cn(
                  "py-2.5 text-xs font-bold border-b-2 px-1 transition-all flex items-center gap-1.5",
                  effectiveTab === "chat"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setActiveTab("chat")}
              >
                <MessageSquare className="size-3.5" />
                Chat Workspace
              </button>
              {!isRecyclingScope && (
                <button
                  className={cn(
                    "py-2.5 text-xs font-bold border-b-2 px-1 transition-all flex items-center gap-1.5",
                    effectiveTab === "predictions"
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setActiveTab("predictions")}
                >
                  <LineIcon className="size-3.5" />
                  Hybrid AI Predictions
                </button>
              )}
            </div>

            {/* TAB CONTENTS */}
            {effectiveTab === "chat" ? (
              <>
                <div className="flex-1 overflow-y-auto p-4 bg-background/25">
                  <div className="space-y-4 pr-3 pb-4">
                    {messages.length === 0 && !streamingContent ? (
                      <div className="flex flex-col items-center justify-center py-24 text-center space-y-3">
                        <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                          <Sparkles className="size-6 animate-pulse" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-foreground">Consult with Hybrid AI {ASSISTANTS.find(a=>a.id === activeRole)?.name}</p>
                          <p className="text-xs text-muted-foreground max-w-sm">
                            Ask about capacity planning, raw resources bottlenecks, pending customer orders, or ask Hybrid AI to build a dashboard.
                          </p>
                        </div>
                      </div>
                    ) : (
                      messages.map((msg, i) => (
                        <div key={i} className="space-y-1">
                          <div
                            className={cn(
                              "max-w-[90%] rounded-xl p-3 text-sm shadow-sm",
                              msg.role === "user"
                                ? "ml-auto bg-primary text-primary-foreground font-medium text-xs"
                                : "bg-card border border-border/80 text-foreground"
                            )}
                          >
                            {renderMessageContent(msg.content)}
                          </div>
                          {msg.role === "assistant" && msg.tools && msg.tools.length > 0 && (
                            <div className="flex flex-wrap gap-1 px-1">
                              {msg.tools.map((tool) => (
                                <Badge key={tool} variant="secondary" className="text-[9px] px-1.5 py-0.5 bg-muted/50 border-border/20 text-muted-foreground">
                                  Source: {tool}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    )}

                    {/* Streaming / typing indicator */}
                    {chatMutation.isPending && streamingContent === null && (
                      <div className="flex items-center gap-2.5 text-xs text-muted-foreground p-3 bg-card border border-border/40 rounded-xl max-w-[200px]">
                        <Sparkles className="size-3.5 animate-spin text-primary" />
                        <span className="animate-pulse">Hybrid AI is thinking...</span>
                      </div>
                    )}
                    {streamingContent !== null && (
                      <div className="space-y-1">
                        <div className="max-w-[90%] rounded-xl p-3 text-sm shadow-sm bg-card border border-border/80 text-foreground">
                          {renderMessageContent(streamingContent)}
                          <span className="inline-block w-0.5 h-3.5 ml-0.5 bg-primary animate-pulse rounded-full align-middle" />
                        </div>
                      </div>
                    )}

                    {/* Invisible anchor for auto-scroll */}
                    <div ref={chatBottomRef} />
                  </div>
                </div>

                <div className="p-4 border-t border-border/60 bg-card/60 shrink-0 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map((prompt, si) => (
                      <Button
                        key={si}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-auto whitespace-normal px-2.5 py-1.5 text-left text-[11px] rounded-lg bg-background/50 hover:bg-background/80 border-primary/20 hover:border-primary/50 hover:text-primary transition-colors"
                        disabled={chatMutation.isPending || streamingContent !== null}
                        onClick={() => ask(prompt)}
                      >
                        <Sparkles className="size-2.5 shrink-0 text-primary/60 mr-1" />
                        {prompt}
                      </Button>
                    ))}
                  </div>

                  <div className="flex gap-2 items-center">
                    <Textarea
                      placeholder={`Consult Hybrid AI on ${activeRole} stats, forecast, or build a dashboard...`}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleAsk();
                        }
                      }}
                      rows={2}
                      className="resize-none text-xs rounded-xl bg-background/70 border-border/80 focus-visible:ring-primary"
                    />
                    <Button
                      onClick={handleAsk}
                      disabled={chatMutation.isPending || !query.trim()}
                      className="shrink-0 size-11 rounded-xl"
                    >
                      <Send className="size-4" />
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              // PREDICTIONS AND FORECASTS TAB VIEW
              <ScrollArea className="flex-1 p-6 bg-background/25 overflow-y-auto space-y-6">
                <div className="space-y-6 pr-3 pb-6">
                  {/* Top Intro Section */}
                  <div className="flex items-center justify-between border-b border-border/40 pb-4">
                    <div>
                      <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                        <TrendingUp className="size-5 text-primary" />
                        ERP Stock Forecasting & Potential Value
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Predictions are calculated directly from historical waste rates, batch counts, and standard conversion specifications.
                      </p>
                    </div>
                  </div>

                  {/* Stock Metrics summary */}
                  {capacityData && (
                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
                      <Card className="border-border/60 bg-background/50 shadow-none">
                        <CardHeader className="p-4 pb-1">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Raw Material: Cement</span>
                        </CardHeader>
                        <CardContent className="p-4 pt-1 flex flex-col gap-1">
                          <span className="text-xl font-bold text-foreground">{formatNumber(capacityData.inventory.cementBags)} bags</span>
                          <span className="text-[10px] text-muted-foreground leading-none">In active inventory</span>
                        </CardContent>
                      </Card>
                      <Card className="border-border/60 bg-background/50 shadow-none">
                        <CardHeader className="p-4 pb-1">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Raw Material: Poliche</span>
                        </CardHeader>
                        <CardContent className="p-4 pt-1 flex flex-col gap-1">
                          <span className="text-xl font-bold text-foreground">{formatPolicheLoads(capacityData.inventory.policheLoads)} loads</span>
                          <span className="text-[10px] text-muted-foreground leading-none">In active warehouse</span>
                        </CardContent>
                      </Card>
                      <Card className="border-border/60 bg-background/50 shadow-none">
                        <CardHeader className="p-4 pb-1">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Historical Grounding Sample</span>
                        </CardHeader>
                        <CardContent className="p-4 pt-1 flex flex-col gap-1">
                          <span className="text-xl font-bold text-foreground">{intelligenceData?.sample_batches || "12"} batches</span>
                          <span className="text-[10px] text-muted-foreground leading-none">Analyzed completed batches</span>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {/* Main predictions details grid table */}
                  {capacityData?.predictions ? (
                    <div className="border border-border/60 rounded-xl overflow-hidden bg-background/40 shadow-sm">
                      <div className="p-4 bg-muted/30 border-b border-border/40">
                        <h4 className="text-xs font-bold text-foreground">Theoretical Yield & Financial Forecast Table</h4>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left border-collapse">
                          <thead>
                            <tr className="border-b border-border/60 bg-muted/20 text-muted-foreground font-semibold">
                              <th className="p-3">Block Size</th>
                              <th className="p-3">Max Possible Yield</th>
                              <th className="p-3">Max Pallets</th>
                              <th className="p-3">Avg Selling Price</th>
                              <th className="p-3 text-primary">Expected Potential Value</th>
                              <th className="p-3">Bottleneck Resource</th>
                              <th className="p-3">Waste (Learned)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {capacityData.predictions.map((p) => {
                              const sizeKey = p.block_size_cm;
                              const price = ESTIMATED_PRICES[sizeKey] || 25;
                              const expectedRevenue = p.max_blocks * price;

                              return (
                                <tr key={p.block_size_cm} className="border-b border-border/20 last:border-0 hover:bg-muted/10">
                                  <td className="p-3 font-semibold text-foreground">{p.label}</td>
                                  <td className="p-3 font-bold">{formatNumber(p.max_blocks)} blocks</td>
                                  <td className="p-3 text-muted-foreground">~{formatNumber(p.max_pallets)} pallets</td>
                                  <td className="p-3 text-muted-foreground">{price} ETB / block</td>
                                  <td className="p-3 font-bold text-primary">{formatCurrency(expectedRevenue)} ETB</td>
                                  <td className="p-3 font-semibold capitalize text-warning">{p.limiting_factor}</td>
                                  <td className="p-3 text-muted-foreground">{p.expected_waste_pct}%</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-center py-10 text-muted-foreground bg-muted/10 rounded-lg">
                      No capacity calculations currently calculated. Please sync data.
                    </p>
                  )}

                  {/* detailed intelligence reasoning summary card */}
                  <Card className="border-border/60 bg-background/50 shadow-none">
                    <CardHeader className="p-4">
                      <CardTitle className="text-xs font-bold flex items-center gap-1.5">
                        <Brain className="size-4.5 text-primary" />
                        Forecasting Grounding Justification
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0 space-y-3 text-xs leading-relaxed text-muted-foreground">
                      <p>
                        The forecasting modules evaluate resource bottlenecks directly from active inventory levels. For example, if cement reserves are depleted faster than aggregate sand or poliche loads, cement is flagged as the bottleneck constraint, restricting overall block counts.
                      </p>
                      <p>
                        To ensure that forecasts are reasonable and account for production realities, they factor in an average <strong>12-day cycle rate</strong> and <strong>learned waste rates</strong> extracted from completed production logs in the database.
                      </p>
                      <p className="font-semibold text-foreground/90">
                        Note: The potential value indicates the financial value of the maximum blocks that can be created with remaining stock. It assumes all resources are fully allocated to a single block size type.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </ScrollArea>
            )}
          </Card>
        </div>
      </div>

      {/* Briefing Modal */}
      {isBriefingOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => setIsBriefingOpen(false)}
        >
          <Card className="w-full max-w-2xl max-h-[80vh] flex flex-col border border-border shadow-2xl bg-card" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="border-b border-border p-4 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Brain className="size-5 text-primary" />
                  Full Executive Briefing - {ASSISTANTS.find((a) => a.id === activeRole)?.name}
                </CardTitle>
                <CardDescription className="text-xs">
                  Generated {formatDateTime(briefing.generated_at)}
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="h-8" onClick={() => setIsBriefingOpen(false)}>
                Close
              </Button>
            </CardHeader>
            <ScrollArea className="flex-1 p-6 overflow-y-auto">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{briefing.summary}</p>
            </ScrollArea>
          </Card>
        </div>
      )}

      {/* Alerts Modal */}
      {isAlertsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => setIsAlertsOpen(false)}
        >
          <Card className="w-full max-w-lg max-h-[80vh] flex flex-col border border-border shadow-2xl bg-card" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="border-b border-border p-4 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <AlertTriangle className="size-5 text-warning animate-bounce" />
                Active Alerts ({openAlerts.length})
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-8" onClick={() => setIsAlertsOpen(false)}>
                Close
              </Button>
            </CardHeader>
            <ScrollArea className="flex-1 p-4 overflow-y-auto space-y-3">
              {openAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={cn(
                    "rounded-lg border p-3.5 space-y-3 bg-background/60",
                    alert.severity === "high"
                      ? "border-destructive/30 bg-destructive/5"
                      : "border-warning/30 bg-warning/5"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold">{alert.title}</p>
                    <Badge variant={alert.severity === "high" ? "destructive" : "warning"} className="text-[10px]">
                      {alert.severity}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-normal">{alert.message}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-1.5 h-8 text-xs font-semibold hover:bg-primary hover:text-primary-foreground transition-all duration-200"
                    disabled={resolveAlertMutation.isPending}
                    onClick={() => handleResolve(alert)}
                  >
                    <CheckCircle2 className="size-3.5" />
                    Resolve Alert
                  </Button>
                </div>
              ))}
            </ScrollArea>
          </Card>
        </div>
      )}

      {/* Missing Data alerts */}
      {(gapEntries.length > 0 || missingData.length > 0) && (
        <Card className="border-warning/30 bg-warning/5 mt-4">
          <CardHeader className="p-4">
            <CardTitle className="text-warning text-xs font-bold">Missing grounding data</CardTitle>
            <CardDescription className="text-[10px]">
              Grounding accuracy may be reduced for this agent context
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="grid gap-3 sm:grid-cols-2">
              {gapEntries.map(([key, value]) => (
                <div key={key} className="rounded-lg border border-warning/20 bg-background/50 p-2.5">
                  <p className="text-[10px] font-medium uppercase text-warning">
                    {key.replace(/_/g, " ")}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{String(value)}</p>
                </div>
              ))}
              {missingData.map((gap) => (
                <div key={gap} className="rounded-lg border border-warning/20 bg-background/50 p-2.5">
                  <p className="text-xs text-muted-foreground">{gap}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
