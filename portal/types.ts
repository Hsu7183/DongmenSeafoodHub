export type Product = { id: string; sku: string; name: string; specification: string; unit: string; category: string; temperature: string; supplier: string; demo: number };
export type OrderItem = { productId: string; sku: string; productName: string; specification: string; unit: string; quantity: number };
export type Order = { id: string; number: string; stall: string; notes: string; createdAt: string; orderDay: string; demo: number; items: OrderItem[] };
export type SummaryRow = OrderItem & { orderCount: number };
export type Summary = { rows: SummaryRow[]; orderCount: number; productCount: number; units: Record<string, number>; updatedAt: string; demo: boolean };
export function taipeiDay(date = new Date()) { return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10); }
export function unitTotals(items: { unit: string; quantity: number }[]) { return items.reduce<Record<string, number>>((out, item) => { out[item.unit] = (out[item.unit] || 0) + item.quantity; return out; }, {}); }
export function formatUnits(units: Record<string, number>) { return Object.entries(units).map(([unit, count]) => `${count.toLocaleString()} ${unit}`).join(' · ') || '0'; }
