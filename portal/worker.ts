import type { D1Database } from '@cloudflare/workers-types';
import { z } from 'zod';
import { ensureDatabase } from './database';
import { taipeiDay, unitTotals, type Product, type SummaryRow } from './types';

type Env = { DB: D1Database; ASSETS: { fetch: (request: Request) => Promise<Response> }; SUPPLIER_CONTENT_AUTHORIZED?: string; PORTAL_ACCEPT_LIVE_ORDERS?: string };
const orderSchema = z.object({
  idempotencyKey: z.uuid(), stall: z.string().trim().min(1).max(60), notes: z.string().trim().max(300).default(''),
  items: z.array(z.object({ productId: z.string().min(1).max(100), quantity: z.number().int().min(1).max(9999) }).strict()).min(1).max(100),
}).strict();
const cookieName = 'dm_portal_session';
class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
const prepared = new WeakMap<object, Promise<void>>();
function json(data: unknown, status = 200, headers: Record<string, string> = {}) { return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', ...headers } }); }
async function init(db: D1Database) { if (!prepared.has(db)) prepared.set(db, ensureDatabase(db).catch(error => { prepared.delete(db); throw error; })); await prepared.get(db); }
function owner(request: Request) { const value = request.headers.get('Cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1); return value && /^[a-f0-9-]{36}$/.test(value) ? value : null; }
async function limitedBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder(); let size = 0, text = '';
  for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 25000) { await reader.cancel(); throw new ApiError(413, '訂單內容過長'); } text += decoder.decode(part.value, {stream:true}); }
  return text + decoder.decode();
}
function validateDate(value: string) { const date = new Date(`${value}T00:00:00Z`); if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new ApiError(400, '日期格式不正確'); return value; }
async function orderForOwner(db: D1Database, id: string, ownerId: string) {
  const order = await db.prepare('SELECT id,number,stall,notes,created_at AS createdAt,order_day AS orderDay,demo FROM portal_orders WHERE id=? AND owner_id=?').bind(id, ownerId).first();
  if (!order) throw new ApiError(404, '找不到這張訂單，請使用原本下單的瀏覽器開啟');
  const items = await db.prepare('SELECT product_id AS productId,sku,product_name AS productName,specification,unit,quantity FROM portal_order_items WHERE order_id=? ORDER BY product_name,sku').bind(id).all();
  return { ...order, items: items.results };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      const pageRoute = ['/', '/order', '/quick-order', '/stats'].includes(url.pathname) || url.pathname.startsWith('/receipt/');
      const assetRequest = pageRoute ? new Request(new URL('/index.html',request.url), request) : request;
      const response = await env.ASSETS.fetch(assetRequest);
      if (!response.headers.get('Content-Type')?.includes('text/html')) return response;
      const trustedOrigin = url.hostname.endsWith('.chatgpt.site') || ['127.0.0.1','localhost'].includes(url.hostname) ? url.origin : null;
      let html = await response.text();
      if (trustedOrigin && !url.pathname.startsWith('/receipt/') && !html.includes('property="og:image"')) html = html.replace('</head>', `<meta property="og:image" content="${trustedOrigin}/og.png"/><meta name="twitter:image" content="${trustedOrigin}/og.png"/></head>`);
      if (url.pathname.startsWith('/receipt/')) html = html.replace(/<meta (?:property="og:image"|name="twitter:image")[^>]*>/g,'').replace('<title>東門市場・食材訂購</title>', '<title>私人訂購單｜東門市場</title>').replaceAll('content="東門市場・食材訂購"', 'content="私人訂購單｜東門市場"').replaceAll('content="下單、列印 PDF、商品數量總表。"', 'content="訂單明細僅限原下單瀏覽器開啟。"');
      const headers = new Headers(response.headers); headers.set('Cache-Control','no-store'); headers.set('X-Content-Type-Options','nosniff'); headers.set('Referrer-Policy','same-origin');
      return new Response(html,{status:response.status,headers});
    }
    try {
      if (url.pathname === '/api/health') return json({ ok: true, service: 'dongmen-portal' });
      if (!env.DB) throw new ApiError(503, '訂單資料庫尚未連上，請稍後再試');
      await init(env.DB);
      const live = env.SUPPLIER_CONTENT_AUTHORIZED === 'true' && env.PORTAL_ACCEPT_LIVE_ORDERS === 'true';
      const demo = live ? 0 : 1;
      if (url.pathname === '/api/portal/catalog' && request.method === 'GET') {
        const products = await env.DB.prepare(`SELECT id,sku,name,specification,unit,category,temperature,supplier,demo FROM portal_products WHERE active=1 AND demo=? AND authorization_status=? ORDER BY sku`).bind(demo, live ? 'AUTHORIZED' : 'DEMO').all<Product>();
        const headers: Record<string,string> = {};
        if (!owner(request)) headers['Set-Cookie'] = `${cookieName}=${crypto.randomUUID()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${url.protocol === 'https:' ? '; Secure' : ''}`;
        return json({ products: products.results, demo: !live, catalogStatus: live ? 'AUTHORIZED' : 'AWAITING_AUTHORIZATION' }, 200, headers);
      }
      if (url.pathname === '/api/portal/orders' && request.method === 'POST') {
        if (request.headers.get('Origin') !== url.origin) throw new ApiError(403, '請從網站的下單頁送出');
        if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new ApiError(415, '請使用網站的下單表單');
        const ownerId = owner(request);
        if (!ownerId) throw new ApiError(401, '下單連線已失效，請重新整理頁面');
        const raw = await limitedBody(request);
        let parsed: unknown;
        try { parsed = JSON.parse(raw); } catch { throw new ApiError(400, '訂單格式不正確'); }
        const validated = orderSchema.safeParse(parsed);
        if (!validated.success) throw new ApiError(400, '請填寫攤位名稱，數量須為 1 至 9999 的整數，每單最多 100 項');
        const input = validated.data;
        input.items.sort((a, b) => a.productId.localeCompare(b.productId));
        if (new Set(input.items.map(item => item.productId)).size !== input.items.length) throw new ApiError(400, '同一商品請合併數量，不可重複列入');
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ ...input, demo }))))).map(x => x.toString(16).padStart(2, '0')).join('');
        const previous = await env.DB.prepare('SELECT id,request_hash FROM portal_orders WHERE owner_id=? AND idempotency_key=?').bind(ownerId, input.idempotencyKey).first<{ id: string; request_hash: string }>();
        if (previous) {
          if (previous.request_hash !== hash) throw new ApiError(409, '此送單編號已使用，請重新整理後再下單');
          return json({ order: await orderForOwner(env.DB, previous.id, ownerId), duplicate: true });
        }
        const recent = await env.DB.prepare('SELECT COUNT(*) AS count FROM portal_orders WHERE owner_id=? AND created_at>?').bind(ownerId, new Date(Date.now() - 60000).toISOString()).first<{count:number}>();
        if ((recent?.count || 0) >= 10) throw new ApiError(429, '送單過於頻繁，請稍候一分鐘再試');
        const products = await env.DB.prepare(`SELECT id,sku,name,specification,unit FROM portal_products WHERE active=1 AND demo=? AND authorization_status=? AND id IN (SELECT value FROM json_each(?))`).bind(demo, live ? 'AUTHORIZED' : 'DEMO', JSON.stringify(input.items.map(item => item.productId))).all<Product>();
        if (products.results.length !== input.items.length) throw new ApiError(409, '部分商品已下架或不可訂購，請重新整理商品清單');
        const now = new Date(), id = crypto.randomUUID(), day = taipeiDay(now);
        const number = `DM-${day.replaceAll('-', '')}-${id.slice(0, 8).toUpperCase()}`;
        const statements = [env.DB.prepare('INSERT INTO portal_orders (id,number,owner_id,idempotency_key,request_hash,created_at,order_day,stall,notes,demo) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(id,number,ownerId,input.idempotencyKey,hash,now.toISOString(),day,input.stall,input.notes,demo)];
        for (const item of input.items) {
          const p = products.results.find(p => p.id === item.productId)!;
          statements.push(env.DB.prepare('INSERT INTO portal_order_items (id,order_id,product_id,sku,product_name,specification,unit,quantity) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),id,p.id,p.sku,p.name,p.specification,p.unit,item.quantity));
        }
        try { await env.DB.batch(statements); } catch (error) {
          const concurrent = await env.DB.prepare('SELECT id,request_hash FROM portal_orders WHERE owner_id=? AND idempotency_key=?').bind(ownerId,input.idempotencyKey).first<{id:string;request_hash:string}>();
          if (!concurrent) throw error;
          if (concurrent.request_hash !== hash) throw new ApiError(409, '送單編號衝突，請重新整理');
          return json({ order: await orderForOwner(env.DB, concurrent.id, ownerId), duplicate: true });
        }
        return json({ order: await orderForOwner(env.DB, id, ownerId) }, 201);
      }
      if (url.pathname.startsWith('/api/portal/orders/') && request.method === 'GET') {
        const ownerId = owner(request);
        if (!ownerId) throw new ApiError(401, '請使用原本下單的瀏覽器開啟');
        return json({ order: await orderForOwner(env.DB, url.pathname.split('/').at(-1)!, ownerId) });
      }
      if (url.pathname === '/api/portal/stats' && request.method === 'GET') {
        const from = url.searchParams.get('from'), to = url.searchParams.get('to');
        const clauses = ['o.demo=?']; const params: (string|number)[] = [demo];
        if (from) { clauses.push('o.order_day>=?'); params.push(validateDate(from)); }
        if (to) { clauses.push('o.order_day<=?'); params.push(validateDate(to)); }
        if (from && to && from > to) throw new ApiError(400, '開始日期不可晚於結束日期');
        const where = clauses.join(' AND ');
        const results = await env.DB.batch([
          env.DB.prepare(`SELECT i.product_id AS productId,i.sku,i.product_name AS productName,i.specification,i.unit,SUM(i.quantity) AS quantity,COUNT(DISTINCT i.order_id) AS orderCount FROM portal_order_items i JOIN portal_orders o ON o.id=i.order_id WHERE ${where} GROUP BY i.product_id,i.sku,i.product_name,i.specification,i.unit ORDER BY quantity DESC,i.sku`).bind(...params),
          env.DB.prepare(`SELECT COUNT(*) AS count FROM portal_orders o WHERE ${where}`).bind(...params),
        ]);
        const rows = results[0].results as SummaryRow[];
        return json({ rows, orderCount: Number((results[1].results[0] as {count:number} | undefined)?.count || 0), productCount: rows.length, units: unitTotals(rows), updatedAt: new Date().toISOString(), demo: !live });
      }
      throw new ApiError(404, '找不到這個功能');
    } catch (error) {
      if (!(error instanceof ApiError)) console.error('Portal request failed', error instanceof Error ? error.message : 'unknown');
      return json({ error: error instanceof ApiError ? error.message : '暫時無法完成操作，請稍後再試；未成功的訂單不會顯示送出成功' }, error instanceof ApiError ? error.status : 500);
    }
  },
};
