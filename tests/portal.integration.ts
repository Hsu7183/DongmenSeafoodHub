import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { makeOrderPdf } from '../portal/pdf';
import type { Order, Product, Summary } from '../portal/types';

const base = process.env.PORTAL_TEST_URL || 'http://127.0.0.1:5173';
let checks = 0;
function check(condition: unknown, description: string) { assert.ok(condition,description);checks++; }
async function client() {
  const response = await fetch(`${base}/api/portal/catalog`);
  check(response.status === 200,'catalog works');
  const cookie = response.headers.get('set-cookie')?.split(';')[0] || '';
  check(cookie.startsWith('dm_portal_session='),'private session issued');
  const data = await response.json() as {products:Product[];demo:boolean};
  check(data.demo && data.products.length===8,'only eight authored demo products');
  return { cookie, data };
}
async function post(cookie:string, body:unknown, origin=base) { return fetch(`${base}/api/portal/orders`,{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)}); }
async function main() {
  const a=await client(), b=await client();
  const before=await (await fetch(`${base}/api/portal/stats`)).json() as Summary;
  const body={idempotencyKey:crypto.randomUUID(),stall:'TEST A 攤',notes:'繁體中文測試，不是真實交易。',items:[{productId:'demo-mackerel',quantity:2},{productId:'demo-tiger-shrimp',quantity:3}]};
  const response=await post(a.cookie,body);
  check(response.status===201,'order persisted');
  const first=(await response.json()).order as Order;
  check(first.items.length===2 && first.items.some(x=>x.productName==='薄鹽鯖魚'&&x.quantity===2),'server snapshots product names and quantities');
  check(!JSON.stringify(first).match(/supplier_cost|commission|owner_id|request_hash|idempotency_key/),'receipt excludes internal fields');
  const retry=await post(a.cookie,body);const retried=await retry.json();
  check(retry.status===200&&retried.duplicate&&retried.order.id===first.id,'same request cannot duplicate');
  check((await post(a.cookie,{...body,notes:'changed'})).status===409,'same key different data rejected');
  const parallelBody={...body,idempotencyKey:crypto.randomUUID(),items:[{productId:'demo-mackerel',quantity:4}]};
  const parallel=await Promise.all([post(a.cookie,parallelBody),post(a.cookie,parallelBody)]);
  const parallelData=await Promise.all(parallel.map(x=>x.json()));
  check(parallel.every(x=>x.ok)&&parallelData[0].order.id===parallelData[1].order.id,'concurrent double submit is atomic');
  const second=await post(b.cookie,{...body,idempotencyKey:crypto.randomUUID(),stall:'TEST B 攤',items:[{productId:'demo-mackerel',quantity:5},{productId:'demo-whitebait',quantity:7}]});
  check(second.status===201,'second browser can order');
  check((await fetch(`${base}/api/portal/orders/${first.id}`,{headers:{Cookie:a.cookie}})).status===200,'own receipt accessible after reload');
  check((await fetch(`${base}/api/portal/orders/${first.id}`,{headers:{Cookie:b.cookie}})).status===404,'other browser cannot read receipt');
  check((await fetch(`${base}/api/portal/orders/${first.id}`)).status===401,'anonymous receipt blocked');
  check((await post(a.cookie,{...body,idempotencyKey:crypto.randomUUID()},'https://untrusted.example')).status===403,'cross-site writes blocked');
  for(const quantity of [0,-1,1.5,10000,'2']) check((await post(a.cookie,{...body,idempotencyKey:crypto.randomUUID(),items:[{productId:'demo-mackerel',quantity}]})).status===400,`reject invalid quantity ${quantity}`);
  check((await post(a.cookie,{...body,idempotencyKey:crypto.randomUUID(),items:[{productId:'demo-mackerel',quantity:1},{productId:'demo-mackerel',quantity:2}]})).status===400,'duplicate product rejected');
  check((await post(a.cookie,{...body,idempotencyKey:crypto.randomUUID(),items:Array.from({length:100},(_,i)=>({productId:`absent-${i}`,quantity:1}))})).status===409,'100 product inputs avoid D1 bind limit and safely reject unknown items');
  check((await post(a.cookie,{...body,idempotencyKey:crypto.randomUUID(),notes:'中'.repeat(30000)})).status===413,'oversized body rejected');
  check((await fetch(`${base}/api/portal/stats?from=2026-99-01`)).status===400,'invalid dates fail cleanly');
  check((await fetch(`${base}/api/portal/stats?from=2026-02-30`)).status===400,'impossible day rejected');
  check((await fetch(`${base}/api/portal/stats?from=2026-09-01&to=2026-08-01`)).status===400,'reversed date range rejected');
  const after=await (await fetch(`${base}/api/portal/stats`)).json() as Summary;
  check(after.orderCount-before.orderCount===3,'exactly three new orders aggregated');
  const quantity=(data:Summary,id:string)=>data.rows.filter(r=>r.productId===id).reduce((sum,r)=>sum+r.quantity,0);
  check(quantity(after,'demo-mackerel')-quantity(before,'demo-mackerel')===11,'two browsers and three orders sum correctly');
  check(quantity(after,'demo-tiger-shrimp')-quantity(before,'demo-tiger-shrimp')===3,'shrimp quantity correct');
  check(quantity(after,'demo-whitebait')-quantity(before,'demo-whitebait')===7,'whitebait quantity correct');
  check((after.units['片']||0)-(before.units['片']||0)===11 && (after.units['盒']||0)-(before.units['盒']||0)===3,'different packaging units separated');
  check(!JSON.stringify(after).match(/TEST A|TEST B|stall|notes|owner|price|commission/),'global summary leaks no order/customer/price data');
  const future=await (await fetch(`${base}/api/portal/stats?from=2099-01-01&to=2099-01-02`)).json() as Summary;
  check(future.orderCount===0&&future.rows.length===0,'empty date range has no fabricated rows');
  const font=await readFile('public/fonts/DongmenSansTC-Regular.ttf');
  await mkdir('.runtime/portal-tests',{recursive:true});
  const pdf=await makeOrderPdf(first,font);
  check(Buffer.from(pdf).subarray(0,5).toString()==='%PDF-','real PDF bytes generated');
  await writeFile('.runtime/portal-tests/order.pdf',pdf);
  const large:Order={...first,number:'DM-PDF-LONG-TEST',stall:'繁體中文長攤位名稱與列印換行測試',notes:'備註中文換行驗證。'.repeat(30),items:Array.from({length:70},(_,i)=>({productId:`test-${i}`,sku:`TEST-${i}`,productName:`第${i+1}項商品：冷凍海鮮長商品名稱與規格換行測試`,specification:'每包 600g，測試長規格與包裝單位，非正式商品',unit:'包',quantity:i+1}))};
  await writeFile('.runtime/portal-tests/long-order.pdf',await makeOrderPdf(large,font));
  await writeFile('.runtime/portal-tests/results.json',JSON.stringify({checks,createdOrderIds:[first.id,parallelData[0].order.id,(await second.json()).order.id],beforeOrders:before.orderCount,afterOrders:after.orderCount},null,2));
  console.log(JSON.stringify({checks,status:'passed',pdfs:2}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
