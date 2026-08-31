export type User = { id: string; name: string; email: string; role: "SUPER_ADMIN" | "SALES" | "CUSTOMER" | "SUPPLIER"; customerId?: string; supplierId?: string };
export type Variant = { id: string; sku: string; specification: string; weight: string | number; packageUnit: string; caseQuantity: number; moq: number; customerPrice?: number; available?: boolean };
export type Product = { id: string; name: string; shortName?: string; brand: string; origin: string; description: string; storageMethod: string; temperature: string; imageUrl?: string; imageSource: string; imageAuthorized: boolean; available: boolean; category: { id: string; name: string }; supplier: { id: string; name: string }; variants: Variant[] };
export type OrderItem = { id: string; variantId: string; sku: string; productName: string; specification: string; quantity: number; packageUnit: string; customerPrice: number; lineTotal: number; supplierCost?: number; commissionAmount?: number; grossProfit?: number };
export type Order = { id: string; orderNumber: string; status: string; paymentStatus: string; totalAmount: number; createdAt: string; deliveryDate?: string; deliveryTime?: string; deliveryAddress?: string; notes?: string; customer?: { id: string; companyName: string; stallName: string; contactName: string; phone: string }; items: OrderItem[] };
export async function api<T = any>(path: string, body?: unknown, method?: string): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store", method: method || (body === undefined ? "GET" : "POST"), headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : data.message || "操作未完成，請稍後再試。");
  return data;
}
export const money = (value: unknown) => new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", currencyDisplay: "code", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value || 0)).replace("TWD", "NT$");
export const date = (value: string | undefined) => value ? new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)) : "—";
export const statuses: Record<string, string> = { DRAFT: "草稿", SUBMITTED: "已送出", CONFIRMED: "已確認", ORDERED_TO_SUPPLIER: "已向供應商訂貨", PREPARING: "備貨中", SHIPPED: "配送中", DELIVERED: "已送達", COMPLETED: "已完成", CANCELLED: "已取消", UNPAID: "未付款", PARTIAL: "部分付款", PAID: "已付款", OVERDUE: "已逾期", PENDING: "待確認" };
