export type Product = { id: string; sku: string; name: string; specification: string; unit: string; category: string; temperature: string; supplier: string; demo: number };
export const orderStatuses = ['SUBMITTED','LOCKED','PURCHASING','SUPPLIER_CONFIRMED','COMPLETED','CANCELLED'] as const;
export type OrderStatus = typeof orderStatuses[number];
export const statusLabels: Record<OrderStatus,string> = { SUBMITTED:'可修改', LOCKED:'已截單', PURCHASING:'採購中', SUPPLIER_CONFIRMED:'已確認供貨', COMPLETED:'已完成', CANCELLED:'已取消' };
export type Customer = { id:string; stallName:string; active:number };
export type OrderItem = { id?:string; productId: string; sku: string; productName: string; specification: string; unit: string; quantity: number; originalQuantity?:number; allocatedQuantity?:number|null };
export type Revision = { revision:number; kind:string; before:string; after:string; source:string; createdAt:string };
export type Order = { id: string; number: string; stall: string; notes: string; createdAt: string; orderDay: string; demo: number; items: OrderItem[]; status?:OrderStatus; revision?:number; customerId?:string|null; fulfillmentConfirmation?:string; allocationRevision?:number; history?:Revision[] };
export type OrderListItem = Omit<Order,'items'> & { itemCount:number };
export type Allocation = { id:string; orderId:string; orderItemId:string; stall:string; requestedQuantity:number; allocatedQuantity:number };
export type BatchItem = { id:string; productId:string; sku:string; productName:string; specification:string; unit:string; requestedQuantity:number; supplierConfirmedQuantity:number|null; allocations:Allocation[] };
export type PurchaseBatch = { id:string; number:string; status:string; revision:number; demo:number; createdAt:string; items:BatchItem[]; orders:{id:string;stall:string;fulfillmentConfirmation:string;status:OrderStatus}[] };
export type SummaryRow = OrderItem & { orderCount: number };
export type Summary = { rows: SummaryRow[]; orderCount: number; productCount: number; units: Record<string, number>; updatedAt: string; demo: boolean };
export function taipeiDay(date = new Date()) { return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10); }
export function unitTotals(items: { unit: string; quantity: number }[]) { return items.reduce<Record<string, number>>((out, item) => { out[item.unit] = (out[item.unit] || 0) + item.quantity; return out; }, {}); }
export function formatUnits(units: Record<string, number>) { return Object.entries(units).map(([unit, count]) => `${count.toLocaleString()} ${unit}`).join(' · ') || '0'; }
