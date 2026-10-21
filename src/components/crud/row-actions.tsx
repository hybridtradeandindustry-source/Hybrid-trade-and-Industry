"use client";

import { MoreHorizontal, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface RowActionsProps {
  onEdit?: () => void;
  onDelete?: () => void;
  onRestore?: () => void;
  extraActions?: { label: string; onClick: () => void; destructive?: boolean }[];
}

export function RowActions({ onEdit, onDelete, onRestore, extraActions = [] }: RowActionsProps) {
  if (!onEdit && !onDelete && !onRestore && extraActions.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {extraActions.map((action) => (
          <DropdownMenuItem
            key={action.label}
            onClick={action.onClick}
            className={action.destructive ? "text-destructive focus:text-destructive" : undefined}
          >
            {action.label}
          </DropdownMenuItem>
        ))}
        {extraActions.length > 0 && (onEdit || onDelete || onRestore) ? (
          <DropdownMenuSeparator />
        ) : null}
        {onEdit ? (
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="mr-2 size-4" />
            Edit
          </DropdownMenuItem>
        ) : null}
        {onRestore ? (
          <DropdownMenuItem onClick={onRestore}>
            <RotateCcw className="mr-2 size-4" />
            Reactivate
          </DropdownMenuItem>
        ) : null}
        {onDelete ? (
          <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
            <Trash2 className="mr-2 size-4" />
            Delete
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
