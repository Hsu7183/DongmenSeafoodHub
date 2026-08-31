import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import type {Order,PurchaseBatch} from '../portal/types';
import {makeOrderPdf} from '../portal/pdf';
type Actor={cookie:string;customer:{id:string;stallName:string}};
export async function workflowTests(base:string,admin:string,a:Actor,b:Actor,check:(v:unknown,label:string)=>void){
  assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
  const prefix=crypto.randomUUID(),actorIds=new Map([[a.cookie,a.customer.id],[b.cookie,b.customer.id]]);
  async function req(route:string,actor='',method='GET',data?:unknown,headers:Record<string,string>={}){return fetch(`${base}/api/portal/${route}`,{method,headers:{Cookie:actor,'CF-Connecting-IP':`2001:db8:${prefix.slice(0,4)}:${prefix.slice(4,8)}::1`,...(method==='GET'?{}:{Origin:base,'Content-Type':'application/json'}),...headers},...(data===undefined?{}:{body:JSON.stringify(data)})});}
  async function ok(route:string,actor='',method='GET',data?:unknown,status=200){const r=await req(route,actor,method,data);check(r.status===status,`${method} ${route}: expected ${status}, got ${r.status}: ${r.ok?'':await r.clone().text()}`);return r.json();}
  async function create(label:string){return (await ok('admin/customers',admin,'POST',{stallName:`TEST ${prefix} ${label}`,pin:'3579'},201)).customer as Actor['customer'];}
  async function login(c:Actor['customer'],pin='3579'){const r=await req('auth/login','','POST',{customerId:c.id,pin});check(r.status===200,'PIN login succeeds in actual Worker');const cookie=r.headers.get('set-cookie')!.split(';')[0];check(/HttpOnly/i.test(r.headers.get('set-cookie')!)&&/SameSite=Strict/i.test(r.headers.get('set-cookie')!),'session cookie protections');actorIds.set(cookie,c.id);return cookie;}
  async function order(actor:string,quantity:number,productId='demo-mackerel'){return (await ok('orders',actor,'POST',{expectedCustomerId:actorIds.get(actor),idempotencyKey:crypto.randomUUID(),notes:'',items:[{productId,quantity}]},201)).order as Order;}
  async function read(id:string,actor=a.cookie){return (await ok(`orders/${id}`,actor)).order as Order;}
  async function edit(o:Order,quantity:number,actor=a.cookie){return req(`orders/${o.id}`,actor,'PATCH',{revision:o.revision,notes:o.notes,items:o.items.map(i=>({id:i.id,quantity}))});}
  async function cutoff(orders:Order[]){await ok('admin/cutoff',admin,'POST',{orders:orders.map(o=>({id:o.id,revision:o.revision}))});return Promise.all(orders.map(o=>ok(`admin/orders/${o.id}`,admin).then(d=>d.order as Order)));}
  const directory=path.resolve('.wrangler/state/v3/d1/miniflare-D1DatabaseObject'),files=(await readdir(directory)).filter(f=>f.endsWith('.sqlite')&&f!=='metadata.sqlite');assert.equal(files.length,1,'one local D1 test database');
  const db=new DatabaseSync(path.join(directory,files[0]));db.exec('PRAGMA busy_timeout=5000');
  const pid='test-'+prefix;
  try{
    // Fixtures are restricted to this local D1 database; no production writes.
    db.prepare(`INSERT INTO portal_products(id,sku,name,specification,unit,category,temperature,supplier,source_type,source_updated_at,authorization_status,active,demo) VALUES (?,?,?,?,?,'魚類','冷凍','TEST','DEMO',?,'DEMO',1,1)`).run(pid,pid,'TEST 薄鹽鯖魚','測試箱裝','箱',new Date().toISOString());
    const first=await order(a.cookie,10,pid),a2=await login(a.customer,'2468');
    check((await read(first.id,a2)).customerId===a.customer.id,'A device B reads A device A order');
    check((await ok('orders',a2)).orders.some((o:Order)=>o.id===first.id),'cross-device history');
    for(const [route,method,payload] of [[`orders/${first.id}`,'GET',undefined],[`orders/${first.id}/reorder`,'GET',undefined],[`orders/${first.id}`,'PATCH',{revision:first.revision,notes:'',items:first.items.map(i=>({id:i.id,quantity:2}))}],[`orders/${first.id}/cancel`,'POST',{revision:first.revision}],[`orders/${first.id}/acknowledge`,'POST',{revision:first.revision,allocationRevision:1}]] as const)await ok(route,b.cookie,method,payload,404);
    await ok('admin/orders',a.cookie,'GET',undefined,403);await ok('admin/purchasing',a.cookie,'GET',undefined,403);await ok('admin/customers',a.cookie,'GET',undefined,403);
    const beforeSwap=(await ok('orders',b.cookie)).orders.length;
    await ok('orders',b.cookie,'POST',{expectedCustomerId:a.customer.id,idempotencyKey:crypto.randomUUID(),items:[{productId:pid,quantity:3}]},409);
    check((await ok('orders',b.cookie)).orders.length===beforeSwap,'cross-tab changed customer cannot misattribute order');
    const key=crypto.randomUUID(),payload={expectedCustomerId:a.customer.id,idempotencyKey:key,items:[{productId:pid,quantity:1}]};
    const duplicate=await Promise.all([req('orders',a.cookie,'POST',payload),req('orders',a2,'POST',payload)]);const duplicates=await Promise.all(duplicate.map(r=>r.json()));
    check(duplicate.every(r=>r.ok)&&duplicates[0].order.id===duplicates[1].order.id,'cross-device idempotency');
    let r=await edit(first,6);check(r.status===200,'submitted edit succeeds');let changed=(await r.json()).order as Order;
    check(changed.items[0].quantity===6&&changed.items[0].originalQuantity===10,'10 to 6 preserves original quantity');
    check(changed.history!.some(h=>h.kind==='EDITED'&&h.before.includes('"quantity":10')&&h.after.includes('"quantity":6')),'revision stores before/after/source/time');
    const totals=()=>ok('stats');let stats=await totals();const q=(s:{rows:{productId:string;quantity:number}[]})=>s.rows.filter(i=>i.productId===pid).reduce((n,i)=>n+i.quantity,0);
    check(q(stats)===7,'stats sums effective six plus separate one, not original ten');
    r=await edit(first,9);check(r.status===409,'stale revision rejected');
    const edits=await Promise.all([edit(changed,7),edit(changed,8)]);check(edits.filter(r=>r.ok).length===1&&edits.some(r=>r.status===409),'concurrent edits only one succeeds');changed=await read(first.id);
    await ok(`orders/${first.id}/cancel`,a.cookie,'POST',{revision:changed.revision});stats=await totals();check(q(stats)===1,'cancelled order excluded from demand');
    check((await read(first.id)).items[0].originalQuantity===10,'cancel preserves original history');
    check(!(await ok('frequent',a.cookie)).items.some((i:{productId:string;frequency:number})=>i.productId===pid&&i.frequency!==1),'frequent excludes cancelled order');
    const repeat=await ok(`orders/${duplicates[0].order.id}/reorder`,a.cookie);check(repeat.items[0].quantity===1&&repeat.unavailable.length===0,'reorder uses original active items and quantities');
    db.prepare('UPDATE portal_products SET specification=? WHERE id=?').run('規格已更新',pid);
    const stale=await ok(`orders/${duplicates[0].order.id}/reorder`,a.cookie);check(stale.items.length===0&&stale.unavailable[0].productId===pid,'changed specification is not silently substituted');
    db.prepare('UPDATE portal_products SET specification=?,active=0 WHERE id=?').run('測試箱裝',pid);
    check((await ok(`orders/${duplicates[0].order.id}/reorder`,a.cookie)).unavailable.length===1,'unlisted product requires reselection');db.prepare('UPDATE portal_products SET active=1 WHERE id=?').run(pid);
    const c=await create('C'),cc=await login(c);
    check((await ok('frequent',cc)).items.length===0,'new customer has empty frequent data for catalog fallback');
    const demand=await Promise.all([order(a.cookie,10,pid),order(b.cookie,20,pid),order(cc,30,pid)]),locked=await cutoff(demand);
    check((await edit(locked[0],5)).status===409,'locked order cannot be edited');await ok(`orders/${locked[0].id}/cancel`,a.cookie,'POST',{revision:locked[0].revision},409);
    const batchPayload={orders:locked.map(o=>({id:o.id,revision:o.revision})),idempotencyKey:crypto.randomUUID()};
    const preview=await ok('admin/purchasing/preview',admin,'POST',{orders:batchPayload.orders});check(preview.items[0].requestedQuantity===60,'A10+B20+C30 previews sixty');
    const made=await Promise.all([req('admin/purchasing',admin,'POST',batchPayload),req('admin/purchasing',admin,'POST',batchPayload)]),madeJson=await Promise.all(made.map(r=>r.json()));
    check(made.every(r=>r.ok)&&madeJson[0].batch.id===madeJson[1].batch.id,'concurrent batch retry returns same batch');let batch=madeJson[0].batch as PurchaseBatch;
    check(batch.items[0].requestedQuantity===60&&batch.items[0].allocations.length===3,'batch retains three allocations');
    await ok('admin/purchasing',admin,'POST',{...batchPayload,idempotencyKey:crypto.randomUUID()},409);
    check(Number(db.prepare('SELECT COUNT(*) AS count FROM purchase_allocations WHERE order_item_id=?').get(demand[0].items[0].id!)!.count)===1,'unique order item allocation');
    await ok(`admin/purchasing/${batch.id}`,a.cookie,'GET',undefined,403);
    const allocate=(supply:number,cQuantity:number,revision=batch.revision)=>({revision,items:batch.items.map(i=>({id:i.id,supplierConfirmedQuantity:supply,allocations:i.allocations.map(a=>({id:a.id,allocatedQuantity:a.orderId===demand[2].id?cQuantity:a.requestedQuantity}))}))});
    await ok(`admin/purchasing/${batch.id}/confirm`,admin,'POST',allocate(50,21),400);
    check((await ok(`admin/purchasing/${batch.id}`,admin)).batch.items[0].supplierConfirmedQuantity===null,'invalid 51 allocation leaves batch unchanged');
    let blocked=false;try{db.prepare('UPDATE purchase_allocations SET allocated_quantity=1 WHERE id=?').run(batch.items[0].allocations[0].id);}catch{blocked=true;}check(blocked,'database trigger also rejects allocation above unconfirmed supply');
    batch=(await ok(`admin/purchasing/${batch.id}/confirm`,admin,'POST',allocate(50,20))).batch;
    check(batch.items[0].supplierConfirmedQuantity===50&&batch.items[0].allocations.reduce((n,a)=>n+a.allocatedQuantity,0)===50,'supply fifty allocated ten twenty twenty');
    let reducedBlocked=false;try{db.prepare('UPDATE purchase_batch_items SET supplier_confirmed_quantity=49 WHERE id=?').run(batch.items[0].id);}catch{reducedBlocked=true;}check(reducedBlocked,'database trigger prevents lowering supply below allocation');
    const concurrentProposal=allocate(50,20),parallelConfirm=await Promise.all([req(`admin/purchasing/${batch.id}/confirm`,admin,'POST',concurrentProposal),req(`admin/purchasing/${batch.id}/confirm`,admin,'POST',concurrentProposal)]);
    check(parallelConfirm.filter(r=>r.ok).length===1&&parallelConfirm.some(r=>r.status===409),'two managers cannot overwrite same allocation revision');batch=(await ok(`admin/purchasing/${batch.id}`,admin)).batch;
    let short=await read(demand[2].id,cc);check(short.fulfillmentConfirmation==='PENDING'&&short.items[0].quantity===30&&short.items[0].allocatedQuantity===20,'shortage requires confirmation without overwriting demand');
    const font=await readFile('public/fonts/DongmenSansTC-Regular.ttf');await writeFile('.runtime/portal-tests/shortage-order.pdf',await makeOrderPdf(short,font));await writeFile('.runtime/portal-tests/cancelled-order.pdf',await makeOrderPdf(await read(first.id),font));
    await ok(`admin/purchasing/${batch.id}/complete`,admin,'POST',{revision:batch.revision},409);
    await ok(`orders/${short.id}/acknowledge`,b.cookie,'POST',{revision:short.revision,allocationRevision:short.allocationRevision},404);
    await ok(`orders/${short.id}/acknowledge`,cc,'POST',{revision:short.revision,allocationRevision:short.allocationRevision!-1},409);
    short=(await ok(`orders/${short.id}/acknowledge`,cc,'POST',{revision:short.revision,allocationRevision:short.allocationRevision})).order;
    check(short.fulfillmentConfirmation==='ACCEPTED','customer accepts exact proposal');
    batch=(await ok(`admin/purchasing/${batch.id}/confirm`,admin,'POST',allocate(50,20))).batch;short=await read(short.id,cc);check(short.fulfillmentConfirmation==='PENDING','new supply proposal invalidates old acceptance');
    await ok(`orders/${short.id}/acknowledge`,cc,'POST',{revision:short.revision,allocationRevision:short.allocationRevision});
    batch=(await ok(`admin/purchasing/${batch.id}/complete`,admin,'POST',{revision:batch.revision})).batch;check(batch.status==='COMPLETED','completed only after shortfall accepted');
    await ok(`admin/purchasing/${batch.id}/confirm`,admin,'POST',allocate(50,20),409);
    check(!JSON.stringify(batch).match(/customer_price|supplier_cost|commission|margin|pin_hash/),'purchase and allocation print data excludes prices and credentials');
    const race=await order(b.cookie,3,pid),raceEdit=edit(race,2,b.cookie),raceLock=req('admin/cutoff',admin,'POST',{orders:[{id:race.id,revision:race.revision}]});const raceResult=await Promise.all([raceEdit,raceLock]);
    check(raceResult.filter(r=>r.ok).length===1&&raceResult.some(r=>r.status===409),'edit and cutoff race serialized');
    const legacyId=crypto.randomUUID(),owner=crypto.randomUUID(),time=new Date().toISOString();db.prepare(`INSERT INTO portal_orders(id,number,owner_id,idempotency_key,request_hash,created_at,order_day,stall,notes,demo) VALUES (?,?,?,?,?,?,?,'TEST legacy','',1)`).run(legacyId,legacyId,owner,legacyId,'legacy',time,time.slice(0,10));
    await ok(`orders/${legacyId}`,'dm_portal_session='+owner);await ok(`orders/${legacyId}`,a.cookie,'GET',undefined,404);await ok('admin/cutoff',admin,'POST',{orders:[{id:legacyId,revision:1}]},409);
    check(!(await ok('orders',a.cookie)).orders.some((o:Order)=>o.id===legacyId),'legacy orders never claimed by name');
    // A legal large confirmation must not hit the customer's 25 KB body limit.
    const catalog=db.prepare('SELECT id,sku,name,specification,unit FROM portal_products WHERE demo=1 AND active=1 AND id<>? ORDER BY sku LIMIT 8').all(pid);
    const bulk:Order[]=[];db.exec('BEGIN');
    for(let n=0;n<50;n++){const id=crypto.randomUUID();db.prepare(`INSERT INTO portal_orders(id,number,owner_id,customer_id,idempotency_key,request_hash,created_at,order_day,stall,notes,demo,status) VALUES (?,?,?,?,?,?,?,?,?,'',1,'LOCKED')`).run(id,id,'customer:'+c.id,c.id,id,'fixture',time,time.slice(0,10),c.stallName);for(const p of catalog)db.prepare('INSERT INTO portal_order_items(id,order_id,product_id,sku,product_name,specification,unit,quantity,current_quantity) VALUES (?,?,?,?,?,?,?,1,1)').run(crypto.randomUUID(),id,p.id,p.sku,p.name,p.specification,p.unit);bulk.push({id,revision:1} as Order);}
    db.exec('COMMIT');
    const mass=(await ok('admin/purchasing',admin,'POST',{orders:bulk.map(o=>({id:o.id,revision:1})),idempotencyKey:crypto.randomUUID()},201)).batch as PurchaseBatch;
    const massPayload={revision:mass.revision,items:mass.items.map(i=>({id:i.id,supplierConfirmedQuantity:i.requestedQuantity,allocations:i.allocations.map(a=>({id:a.id,allocatedQuantity:a.requestedQuantity}))}))};
    check(JSON.stringify(massPayload).length>25000,'large confirmation fixture exceeds 25 KB');
    const massSaved=(await ok(`admin/purchasing/${mass.id}/confirm`,admin,'POST',massPayload)).batch as PurchaseBatch;check(massSaved.items.every(i=>i.supplierConfirmedQuantity===50),'50 orders x 8 products can finish confirmation');
    const zeroOrders=await cutoff([await order(b.cookie,2,pid)]);let zero=(await ok('admin/purchasing',admin,'POST',{orders:zeroOrders.map(o=>({id:o.id,revision:o.revision})),idempotencyKey:crypto.randomUUID()},201)).batch as PurchaseBatch;
    zero=(await ok(`admin/purchasing/${zero.id}/confirm`,admin,'POST',{revision:zero.revision,items:zero.items.map(i=>({id:i.id,supplierConfirmedQuantity:0,allocations:i.allocations.map(a=>({id:a.id,allocatedQuantity:0}))}))})).batch;
    check(zero.items[0].supplierConfirmedQuantity===0&&zero.orders[0].fulfillmentConfirmation==='PENDING','zero supply is explicit and requires customer confirmation');
    const frequentOrder=crypto.randomUUID();db.prepare(`INSERT INTO portal_orders(id,number,owner_id,customer_id,idempotency_key,request_hash,created_at,order_day,stall,notes,demo) VALUES (?,?,?,?,?,?,?,?,?,'',1)`).run(frequentOrder,frequentOrder,'customer:'+c.id,c.id,frequentOrder,'fixture',time,time.slice(0,10),c.stallName);
    for(let n=0;n<25;n++){const id=`freq-${prefix}-${n}`;db.prepare(`INSERT INTO portal_products(id,sku,name,specification,unit,category,temperature,supplier,source_type,source_updated_at,authorization_status,active,demo) VALUES (?,?,?,'測試','包','其他','冷凍','TEST','DEMO',?,'DEMO',1,1)`).run(id,id,`TEST 常買${n}`,time);db.prepare('INSERT INTO portal_order_items(id,order_id,product_id,sku,product_name,specification,unit,quantity,current_quantity) VALUES (?,?,?,?,?,\'測試\',\'包\',1,1)').run(crypto.randomUUID(),frequentOrder,id,id,`TEST 常買${n}`);}
    check((await ok('frequent',cc)).items.length===20,'frequent has at most twenty available products');
    check(!(await ok('frequent',b.cookie)).items.some((i:{productId:string})=>i.productId.startsWith('freq-'+prefix)),'frequent never reads another customer history');
    const reset=await create('reset'),old=await login(reset);await ok(`admin/customers/${reset.id}`,admin,'PATCH',{pin:'8642'});check((await ok('auth/me',old)).customer===null,'reset revokes prior sessions');
    await ok('auth/login','','POST',{customerId:reset.id,pin:'3579'},401);const renewed=await login(reset,'8642');await ok(`admin/customers/${reset.id}`,admin,'PATCH',{active:false});check((await ok('auth/me',renewed)).customer===null,'deactivation revokes sessions');
    const logged=await login(c);await ok('auth/logout',logged,'POST',{});check((await ok('auth/me',logged)).customer===null,'logout revokes token');
    const limit=await create('limit');const guesses=await Promise.all(Array.from({length:8},(_,i)=>req('auth/login','','POST',{customerId:limit.id,pin:'0000'},{'CF-Connecting-IP':`192.0.2.${i+1}`})));
    check(guesses.filter(r=>r.status===401).length===5&&guesses.filter(r=>r.status===429).length===3,'parallel guesses atomically limited across IPs');
    const row=db.prepare('SELECT pin_hash FROM portal_customers WHERE id=?').get(limit.id)!;check(String(row.pin_hash).startsWith('pbkdf2-sha256-v1$100000$')&&String(row.pin_hash)!=='3579','PIN uses slow salted peppered hash');
    const sessions=db.prepare('SELECT token_hash FROM portal_sessions LIMIT 1').get()!;check(/^[a-f0-9]{64}$/.test(String(sessions.token_hash)),'database stores session digest');
    check(!JSON.stringify(await ok('auth/customers')).match(/pin_hash|auth_version|3579|token/),'public stall picker has no credentials');
    await ok('auth/login','','POST',{customerId:c.id,pin:'3579'},200);
    check((await req('auth/logout',cc,'POST',{}, {Origin:'https://evil.example'})).status===403,'logout CSRF blocked');
    check((await req('admin/cutoff',admin,'POST',{orders:[]},{Origin:'https://evil.example'})).status===403,'admin writes check origin');
    // Additive migration preserves legacy data and can be applied before runtime initialization.
    await mkdir('.runtime/portal-tests',{recursive:true});const migrated=new DatabaseSync(`.runtime/portal-tests/migration-${prefix}.sqlite`);
    try{migrated.exec(await readFile('drizzle/0000_tiny_ghost_rider.sql','utf8'));migrated.prepare(`INSERT INTO portal_orders(id,number,owner_id,idempotency_key,request_hash,created_at,order_day,stall,notes,demo) VALUES ('old','old','old','old','old','2026-08-31','2026-08-31','OLD','keep',1)`).run();migrated.exec(await readFile('drizzle/0001_tough_barracuda.sql','utf8'));migrated.exec(await readFile('drizzle/0002_allocation_guards.sql','utf8'));const old=migrated.prepare("SELECT * FROM portal_orders WHERE id='old'").get()!;check(old.notes==='keep'&&old.customer_id===null&&old.status==='SUBMITTED','additive migration retains legacy orders without claiming ownership');}finally{migrated.close();}
  }finally{db.prepare('UPDATE portal_products SET active=0 WHERE id=? OR id LIKE ?').run(pid,`freq-${prefix}-%`);db.close();}
}
