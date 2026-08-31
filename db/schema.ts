import { sqliteTable, text, integer, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const products = sqliteTable('portal_products', {
  id: text('id').primaryKey(), sku: text('sku').notNull().unique(), name: text('name').notNull(),
  specification: text('specification').notNull(), unit: text('unit').notNull(), category: text('category').notNull(),
  temperature: text('temperature').notNull(), supplier: text('supplier').notNull(),
  sourceUrl: text('source_url'), sourceType: text('source_type').notNull(),
  sourceUpdatedAt: text('source_updated_at').notNull(), authorizationStatus: text('authorization_status').notNull(),
  active: integer('active').notNull().default(1), demo: integer('demo').notNull().default(1),
});
export const orders = sqliteTable('portal_orders', {
  id: text('id').primaryKey(), number: text('number').notNull().unique(), ownerId: text('owner_id').notNull(),
  idempotencyKey: text('idempotency_key').notNull(), requestHash: text('request_hash').notNull(),
  createdAt: text('created_at').notNull(), orderDay: text('order_day').notNull(),
  stall: text('stall').notNull(), notes: text('notes').notNull(), demo: integer('demo').notNull().default(1),
}, table => [uniqueIndex('idx_portal_orders_owner_key').on(table.ownerId, table.idempotencyKey), index('idx_portal_orders_demo_day').on(table.demo, table.orderDay)]);
export const items = sqliteTable('portal_order_items', {
  id: text('id').primaryKey(), orderId: text('order_id').notNull().references(() => orders.id),
  productId: text('product_id').notNull().references(() => products.id), sku: text('sku').notNull(),
  productName: text('product_name').notNull(), specification: text('specification').notNull(),
  unit: text('unit').notNull(), quantity: integer('quantity').notNull(),
}, table => [index('idx_portal_items_order').on(table.orderId), check('portal_quantity_valid', sql`${table.quantity} > 0 AND ${table.quantity} <= 9999`)]);
