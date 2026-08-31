"use client";

import Dashboard from "./Dashboard";
import { DirectoryAdmin, PricesAdmin, ProductsAdmin, SettingsAdmin } from "./CatalogAdmin";
import { AuditAdmin, FinanceAdmin, OrdersAdmin, PurchaseOrdersAdmin, QuotationsAdmin } from "./OperationsAdmin";
import ImportProducts from "./ImportProducts";

export default function AdminWorkspace({ section = "dashboard" }: { section?: string }) {
  if (section === "customers" || section === "suppliers" || section === "categories") return <DirectoryAdmin key={section} resource={section} />;
  if (section === "products") return <ProductsAdmin />;
  if (section === "prices" || section === "tiers") return <PricesAdmin />;
  if (section === "orders") return <OrdersAdmin />;
  if (section === "purchase-orders") return <PurchaseOrdersAdmin />;
  if (section === "finance" || section === "commissions" || section === "payments") return <FinanceAdmin />;
  if (section === "quotations") return <QuotationsAdmin />;
  if (section === "audit") return <AuditAdmin />;
  if (section === "settings") return <SettingsAdmin />;
  if (section === "import-products") return <ImportProducts />;
  return <Dashboard />;
}
