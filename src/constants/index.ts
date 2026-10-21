export const APP_SHORT_NAME = "HYBRID";
export const APP_NAME = "Hybrid Block and Plastic Recycling Factory";
export const APP_TAGLINE = "Block & Plastic Recycling";
export const APP_DESCRIPTION =
  "Enterprise operating system for block manufacturing and plastic recycling.";

export const BRAND_COLORS = {
  green: "#80C342",
  greenDark: "#2D5A27",
  blue: "#00AEEF",
  blueDark: "#0054A6",
  navy: "#1A202C",
} as const;

export const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard", permission: { resource: "dashboard", action: "read" } },
  { label: "Finance", href: "/dashboard/finance", icon: "DollarSign", permission: { resource: "finance", action: "read" } },
  { label: "Expenses", href: "/dashboard/expenses", icon: "Receipt", permission: { resource: "finance", action: "read" } },
  { label: "Production", href: "/dashboard/production", icon: "Factory", permission: { resource: "production", action: "read" } },
  { label: "Recycling Stock", href: "/dashboard/stock-plastic", icon: "Recycle", permission: { resource: "production", action: "read" } },
  { label: "Purchasing", href: "/dashboard/purchasing", icon: "Truck", permission: { resource: "inventory", action: "read" } },
  { label: "Suppliers", href: "/dashboard/suppliers", icon: "Building2", permission: { resource: "inventory", action: "read" } },
  { label: "Inventory", href: "/dashboard/inventory", icon: "Package", permission: { resource: "inventory", action: "read" } },
  { label: "Sales", href: "/dashboard/orders", icon: "ShoppingCart", permission: { resource: "sales", action: "read" } },
  { label: "Customers", href: "/dashboard/customers", icon: "Users", permission: { resource: "sales", action: "read" } },
  { label: "Credit", href: "/dashboard/credit", icon: "CreditCard", permission: { resource: "finance", action: "read" } },
  { label: "Banks", href: "/dashboard/banks", icon: "Landmark", permission: { resource: "finance", action: "read" } },
  { label: "HR", href: "/dashboard/hr", icon: "UserCog", permission: { resource: "hr", action: "read" } },
  { label: "Reports", href: "/dashboard/reports", icon: "FileBarChart", permission: { resource: "reports", action: "read" } },
  { label: "AI Assistant", href: "/dashboard/ai", icon: "Brain", permission: { resource: "ai", action: "read" } },
  { label: "Documents", href: "/dashboard/documents", icon: "FolderOpen", permission: { resource: "documents", action: "read" } },
  { label: "Notifications", href: "/dashboard/notifications", icon: "Bell", permission: { resource: "notifications", action: "read" } },
  { label: "Audit Log", href: "/dashboard/audit", icon: "Shield", permission: { resource: "audit", action: "read" } },
  { label: "Admin", href: "/dashboard/admin", icon: "Settings", permission: { resource: "admin", action: "manage" } },
] as const;

export const FACTORY_OPTIONS = [
  { value: "combined", label: "Overall Company" },
  { value: "block", label: "Block Factory" },
  { value: "recycling", label: "Plastic Recycling" },
] as const;

export const ORDER_COLUMNS = ["ordered", "picked"] as const;

export const STORAGE_BUCKETS = {
  documents: "documents",
  productionPhotos: "production-photos",
  deliveryProofs: "delivery-proofs",
  hrDocuments: "hr-documents",
} as const;
