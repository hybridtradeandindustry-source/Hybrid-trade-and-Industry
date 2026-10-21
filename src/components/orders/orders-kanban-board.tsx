"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, ArrowRight, GripVertical } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RowActions } from "@/components/crud/row-actions";
import { getAvailableQuantity } from "@/lib/inventory/inventory-utils";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { ORDER_COLUMNS } from "@/constants";
import { ORDER_STATUS_LABELS, type Order, type OrderStatus } from "@/types";

function getNextStatus(status: OrderStatus): OrderStatus | null {
  const idx = ORDER_COLUMNS.indexOf(status as (typeof ORDER_COLUMNS)[number]);
  if (idx === -1 || idx >= ORDER_COLUMNS.length - 1) return null;
  return ORDER_COLUMNS[idx + 1] as OrderStatus;
}

function getForwardStatuses(from: OrderStatus, to: OrderStatus): OrderStatus[] {
  const fromIdx = ORDER_COLUMNS.indexOf(from as (typeof ORDER_COLUMNS)[number]);
  const toIdx = ORDER_COLUMNS.indexOf(to as (typeof ORDER_COLUMNS)[number]);
  if (fromIdx === -1 || toIdx === -1 || toIdx <= fromIdx) return [];
  return ORDER_COLUMNS.slice(fromIdx + 1, toIdx + 1) as OrderStatus[];
}

interface OrderCardContentProps {
  order: Order;
  canManage: boolean;
  isMutating: boolean;
  isDragging?: boolean;
  showDragHandle?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  onAdvance: (order: Order) => void;
  onEdit: (order: Order) => void;
  onDelete: (order: Order) => void;
}

function OrderCardContent({
  order,
  canManage,
  isMutating,
  isDragging,
  showDragHandle,
  dragHandleProps,
  onAdvance,
  onEdit,
  onDelete,
}: OrderCardContentProps) {
  const nextStatus = getNextStatus(order.status);

  return (
    <Card
      className={cn(
        "border-border/60 bg-card shadow-sm transition-all hover:border-border hover:shadow-md",
        isDragging && "opacity-40"
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            {showDragHandle && dragHandleProps && (
              <button
                type="button"
                {...dragHandleProps}
                className="mt-0.5 shrink-0 cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
                aria-label={`Drag sale ${order.order_number}`}
              >
                <GripVertical className="size-4" />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-mono text-sm font-semibold">{order.order_number}</p>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {order.customer?.name ?? "Unknown customer"}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {order.ai_risk_flag && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <AlertTriangle className="size-4 text-destructive" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    {order.ai_risk_reason ?? "AI flagged this sale as at risk"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {canManage && (
              <RowActions onEdit={() => onEdit(order)} onDelete={() => onDelete(order)} />
            )}
          </div>
        </div>

        <p className="mt-2 text-sm font-semibold">{formatCurrency(order.total_amount)}</p>
        {order.items && order.items.length > 0 && (
          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            {order.items.map((line) => (
              <p key={line.id}>
                {line.quantity} × {line.description}
                {line.inventory_item
                  ? ` · ${getAvailableQuantity(line.inventory_item)} available`
                  : ""}
              </p>
            ))}
          </div>
        )}
        {order.production_batch_id && (
          <Badge variant="outline" className="mt-2 text-[10px]">
            Linked to production batch
          </Badge>
        )}
        {order.delivery_date && (
          <p className="mt-1 text-xs text-muted-foreground">
            Due {formatDate(order.delivery_date)}
          </p>
        )}

        {order.ai_risk_flag && (
          <Badge variant="destructive" className="mt-2 text-[10px]">
            AI Risk
          </Badge>
        )}

        {canManage && nextStatus && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3 w-full gap-1.5 border-primary/20 bg-primary/5 text-xs hover:bg-primary/10"
            disabled={isMutating}
            onClick={() => onAdvance(order)}
          >
            Advance to {ORDER_STATUS_LABELS[nextStatus]}
            <ArrowRight className="size-3.5" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

interface DraggableOrderCardProps {
  order: Order;
  canManage: boolean;
  isMutating: boolean;
  onAdvance: (order: Order) => void;
  onEdit: (order: Order) => void;
  onDelete: (order: Order) => void;
}

function DraggableOrderCard({
  order,
  canManage,
  isMutating,
  onAdvance,
  onEdit,
  onDelete,
}: DraggableOrderCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: order.id,
    data: { order, status: order.status },
    disabled: !canManage,
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} className="touch-none">
      <OrderCardContent
        order={order}
        canManage={canManage}
        isMutating={isMutating}
        isDragging={isDragging}
        showDragHandle={canManage}
        dragHandleProps={{ ...attributes, ...listeners }}
        onAdvance={onAdvance}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </div>
  );
}

interface OrderColumnProps {
  status: OrderStatus;
  orders: Order[];
  canManage: boolean;
  isMutating: boolean;
  onAdvance: (order: Order) => void;
  onEdit: (order: Order) => void;
  onDelete: (order: Order) => void;
}

function OrderColumn({
  status,
  orders,
  canManage,
  isMutating,
  onAdvance,
  onEdit,
  onDelete,
}: OrderColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    data: { status },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "w-72 shrink-0 rounded-xl transition-colors",
        isOver && canManage && "ring-2 ring-primary/20"
      )}
    >
      <Card
        className={cn(
          "border-border/60 bg-card/30 backdrop-blur-sm transition-colors h-full",
          isOver && canManage && "border-primary/50 bg-primary/5"
        )}
      >
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-sm">
            <span>{ORDER_STATUS_LABELS[status]}</span>
            <Badge variant="secondary" className="text-xs">
              {orders.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <div className="h-[calc(100vh-280px)] space-y-3 overflow-y-auto pr-2">
            {orders.map((order) => (
              <DraggableOrderCard
                key={order.id}
                order={order}
                canManage={canManage}
                isMutating={isMutating}
                onAdvance={onAdvance}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
            {orders.length === 0 && (
              <p
                className={cn(
                  "py-8 text-center text-xs text-muted-foreground",
                  isOver && canManage && "text-primary"
                )}
              >
                {isOver && canManage ? "Drop here" : "No sales"}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export interface OrdersKanbanBoardProps {
  orders: Order[];
  canManage: boolean;
  isMutating: boolean;
  onMove: (order: Order, targetStatus: OrderStatus) => void;
  onAdvance: (order: Order) => void;
  onEdit: (order: Order) => void;
  onDelete: (order: Order) => void;
}

export function OrdersKanbanBoard({
  orders,
  canManage,
  isMutating,
  onMove,
  onAdvance,
  onEdit,
  onDelete,
}: OrdersKanbanBoardProps) {
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);

  const ordersByStatus = useMemo(
    () =>
      ORDER_COLUMNS.reduce(
        (acc, status) => {
          acc[status] = orders.filter((o) => o.status === status);
          return acc;
        },
        {} as Record<OrderStatus, Order[]>
      ),
    [orders]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const order = event.active.data.current?.order as Order | undefined;
    setActiveOrder(order ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveOrder(null);

    if (!canManage) return;

    const { active, over } = event;
    if (!over) return;

    const order = active.data.current?.order as Order | undefined;
    const targetStatus = over.data.current?.status as OrderStatus | undefined;

    if (!order || !targetStatus || order.status === targetStatus) return;

    onMove(order, targetStatus);
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="overflow-x-auto pb-4">
        <div className="flex min-w-max gap-4">
          {ORDER_COLUMNS.map((status) => (
            <OrderColumn
              key={status}
              status={status}
              orders={ordersByStatus[status] ?? []}
              canManage={canManage}
              isMutating={isMutating}
              onAdvance={onAdvance}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeOrder ? (
          <div className="w-72 rotate-2 cursor-grabbing opacity-95 shadow-lg">
            <OrderCardContent
              order={activeOrder}
              canManage={canManage}
              isMutating={isMutating}
              onAdvance={onAdvance}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

export { getForwardStatuses, getNextStatus };
