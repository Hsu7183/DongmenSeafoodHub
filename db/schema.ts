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
  customerId: text('customer_id').references(() => customers.id), status:text('status').notNull().default('SUBMITTED'),
  revision:integer('revision').notNull().default(1), updatedAt:text('updated_at'),
  fulfillmentConfirmation:text('fulfillment_confirmation').notNull().default('NONE'), allocationRevision:integer('allocation_revision').notNull().default(0),
}, table => [uniqueIndex('idx_portal_orders_owner_key').on(table.ownerId, table.idempotencyKey), index('idx_portal_orders_demo_day').on(table.demo, table.orderDay),index('idx_portal_orders_customer').on(table.customerId,table.createdAt)]);
export const items = sqliteTable('portal_order_items', {
  id: text('id').primaryKey(), orderId: text('order_id').notNull().references(() => orders.id),
  productId: text('product_id').notNull().references(() => products.id), sku: text('sku').notNull(),
  productName: text('product_name').notNull(), specification: text('specification').notNull(),
  unit: text('unit').notNull(), quantity: integer('quantity').notNull(),
  currentQuantity:integer('current_quantity'),
}, table => [index('idx_portal_items_order').on(table.orderId), check('portal_quantity_valid', sql`${table.quantity} > 0 AND ${table.quantity} <= 9999`)]);

export const customers = sqliteTable('portal_customers',{
  id:text('id').primaryKey(),stallName:text('stall_name').notNull().unique(),pinHash:text('pin_hash').notNull(),active:integer('active').notNull().default(1),
  authVersion:integer('auth_version').notNull().default(1),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
});
export const sessions=sqliteTable('portal_sessions',{
  tokenHash:text('token_hash').primaryKey(),customerId:text('customer_id').references(()=>customers.id),role:text('role').notNull(),
  authVersion:text('auth_version').notNull(),createdAt:text('created_at').notNull(),expiresAt:text('expires_at').notNull(),
},t=>[index('idx_portal_sessions_expiry').on(t.expiresAt)]);
export const loginLimits=sqliteTable('portal_login_limits',{key:text('key').primaryKey(),attempts:integer('attempts').notNull(),expiresAt:integer('expires_at').notNull()});
export const revisions=sqliteTable('portal_order_revisions',{
  id:text('id').primaryKey(),orderId:text('order_id').notNull().references(()=>orders.id),revision:integer('revision').notNull(),kind:text('kind').notNull(),
  beforeJson:text('before_json').notNull(),afterJson:text('after_json').notNull(),source:text('source').notNull(),createdAt:text('created_at').notNull(),
},t=>[uniqueIndex('idx_portal_revisions_order_version').on(t.orderId,t.revision)]);
export const purchaseBatches=sqliteTable('purchase_batches',{
  id:text('id').primaryKey(),number:text('number').notNull().unique(),idempotencyKey:text('idempotency_key').notNull().unique(),requestHash:text('request_hash').notNull(),
  status:text('status').notNull().default('PURCHASING'),revision:integer('revision').notNull().default(1),demo:integer('demo').notNull(),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
});
export const purchaseBatchItems=sqliteTable('purchase_batch_items',{
  id:text('id').primaryKey(),batchId:text('batch_id').notNull().references(()=>purchaseBatches.id),productId:text('product_id').notNull(),sku:text('sku').notNull(),
  productName:text('product_name').notNull(),specification:text('specification').notNull(),unit:text('unit').notNull(),
  requestedQuantity:integer('requested_quantity').notNull(),supplierConfirmedQuantity:integer('supplier_confirmed_quantity'),
});
export const allocations=sqliteTable('purchase_allocations',{
  id:text('id').primaryKey(),batchItemId:text('batch_item_id').notNull().references(()=>purchaseBatchItems.id),orderId:text('order_id').notNull().references(()=>orders.id),
  orderItemId:text('order_item_id').notNull().references(()=>items.id),requestedQuantity:integer('requested_quantity').notNull(),allocatedQuantity:integer('allocated_quantity').notNull().default(0),
},t=>[uniqueIndex('idx_allocations_order_item').on(t.orderItemId),index('idx_allocations_batch_item').on(t.batchItemId)]);
export const batchEvents=sqliteTable('purchase_batch_events',{
  id:text('id').primaryKey(),batchId:text('batch_id').notNull().references(()=>purchaseBatches.id),revision:integer('revision').notNull(),beforeJson:text('before_json').notNull(),afterJson:text('after_json').notNull(),source:text('source').notNull(),createdAt:text('created_at').notNull(),
},t=>[uniqueIndex('idx_batch_event_revision').on(t.batchId,t.revision)]);
// D1 batch assertions: a failed condition aborts the entire batch, including concurrent edits.
export const atomicGuards=sqliteTable('portal_atomic_guards',{id:text('id').primaryKey(),ok:integer('ok').notNull()},t=>[check('portal_atomic_guard_ok',sql`${t.ok}=1`)]);
