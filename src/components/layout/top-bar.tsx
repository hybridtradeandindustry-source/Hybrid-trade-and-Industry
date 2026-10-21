"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, ChevronDown, LogOut, Menu, User } from "lucide-react";
import { toast } from "sonner";
import { cn, formatDateTime, getInitials } from "@/lib/utils";
import { FACTORY_OPTIONS } from "@/constants";
import { useAuth } from "@/providers/auth-provider";
import { useAppStore } from "@/stores/app-store";
import { useNotifications } from "@/hooks/use-api";
import { getNotificationHref } from "@/lib/notifications/notification-links";
import type { Notification, ViewScope } from "@/types";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const TYPE_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline" | "warning" | "info"> = {
  task: "default",
  approval: "secondary",
  ai_alert: "destructive",
  system: "outline",
  missing_data: "warning",
};

export function TopBar() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { viewScope, setViewScope, toggleSidebar } = useAppStore();
  const { notifications, unreadCount, markReadMutation } = useNotifications();

  const handleLogout = async () => {
    await logout();
    toast.success("Signed out successfully");
    router.push("/login");
  };

  const markAllRead = () => {
    markReadMutation.mutate(
      { action: "mark_all_read" },
      { onSuccess: () => toast.success("All notifications marked as read") }
    );
  };

  const openNotification = (notif: Notification) => {
    if (!notif.is_read) {
      markReadMutation.mutate({ action: "mark_read", id: notif.id });
    }
    const href = getNotificationHref(notif);
    if (href) router.push(href);
  };

  const preview = notifications.slice(0, 8);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl sm:px-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={toggleSidebar} aria-label="Open sidebar">
          <Menu className="size-5" />
        </Button>
        <Select value={viewScope} onValueChange={(value) => setViewScope(value as ViewScope)}>
          <SelectTrigger className="w-[180px] border-border/60 bg-card/50 sm:w-[220px]">
            <SelectValue placeholder="Select view" />
          </SelectTrigger>
          <SelectContent>
            {FACTORY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="size-5" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-96">
            <DropdownMenuLabel className="flex items-center justify-between gap-2">
              <span>Notifications</span>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <Button variant="ghost" size="sm" className="h-auto px-2 py-1 text-xs" onClick={markAllRead}>
                    Mark all read
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="h-auto px-2 py-1 text-xs" asChild>
                  <Link href="/dashboard/notifications">View all</Link>
                </Button>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <ScrollArea className="max-h-80">
              {preview.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No notifications yet
                </div>
              ) : (
                preview.map((notif) => (
                  <DropdownMenuItem
                    key={notif.id}
                    className={cn(
                      "flex cursor-pointer flex-col items-start gap-1.5 p-3",
                      !notif.is_read && "bg-primary/5"
                    )}
                    onClick={() => openNotification(notif)}
                  >
                    <div className="flex w-full items-start justify-between gap-2">
                      <span className={cn("text-sm font-medium leading-snug", !notif.is_read && "text-foreground")}>
                        {notif.title}
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        <Badge variant={TYPE_VARIANTS[notif.type] ?? "outline"} className="text-[10px]">
                          {notif.type.replace(/_/g, " ")}
                        </Badge>
                        {!notif.is_read ? <Badge variant="info" className="text-[10px]">New</Badge> : null}
                      </div>
                    </div>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{notif.message}</p>
                    <p className="text-[10px] text-muted-foreground/70">{formatDateTime(notif.created_at)}</p>
                  </DropdownMenuItem>
                ))
              )}
            </ScrollArea>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 pl-2 pr-3">
              <Avatar className="size-8">
                <AvatarFallback className="text-xs">{user ? getInitials(user.full_name) : "?"}</AvatarFallback>
              </Avatar>
              <div className="hidden text-left sm:block">
                <p className="text-sm font-medium leading-none">{user?.full_name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{user?.roleName}</p>
              </div>
              <ChevronDown className="size-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled><User className="mr-2 size-4" />{user?.email}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 size-4" />Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
