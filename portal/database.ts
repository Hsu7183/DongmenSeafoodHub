import type { D1Database } from '@cloudflare/workers-types';
import { demoCatalog } from './catalog';

export async function ensureDatabase(db: D1Database) {
  // Idempotent initialization also permits local development without remote migrations.
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS portal_products (id TEXT PRIMARY KEY, sku TEXT NOT NULL UNIQUE, name TEXT NOT NULL, specification TEXT NOT NULL, unit TEXT NOT NULL, category TEXT NOT NULL, temperature TEXT NOT NULL, supplier TEXT NOT NULL, source_url TEXT, source_type TEXT NOT NULL, source_updated_at TEXT NOT NULL, authorization_status TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, demo INTEGER NOT NULL DEFAULT 1)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS portal_orders (id TEXT PRIMARY KEY, number TEXT NOT NULL UNIQUE, owner_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL, created_at TEXT NOT NULL, order_day TEXT NOT NULL, stall TEXT NOT NULL, notes TEXT NOT NULL, demo INTEGER NOT NULL DEFAULT 1)`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_orders_owner_key ON portal_orders(owner_id, idempotency_key)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_portal_orders_demo_day ON portal_orders(demo, order_day)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS portal_order_items (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES portal_orders(id), product_id TEXT NOT NULL REFERENCES portal_products(id), sku TEXT NOT NULL, product_name TEXT NOT NULL, specification TEXT NOT NULL, unit TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity > 0 AND quantity <= 9999))`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_portal_items_order ON portal_order_items(order_id)`),
  ]);
  await db.batch(demoCatalog.map(product => db.prepare(`INSERT OR IGNORE INTO portal_products (id,sku,name,specification,unit,category,temperature,supplier,source_type,source_updated_at,authorization_status,demo) VALUES (?,?,?,?,?,?,?,?,'DEMO','2026-08-31T00:00:00Z','DEMO',1)`).bind(product.id, product.sku, product.name, product.specification, product.unit, product.category, product.temperature, '平台自建示範')));
}
