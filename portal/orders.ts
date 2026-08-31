import {z} from 'zod';
import {customerFor,adminFor} from './auth';
import {ApiError,atomic,body,dateValue,demoMode,hash,json,legacyOwner,now,type Env,type Guard} from './server-common';
import {taipeiDay,unitTotals,type Order,type OrderItem,type Product,type SummaryRow,type OrderStatus} from './types';
const productSelect='id,sku,name,specification,unit,category,temperature,supplier,demo';
export const orderSelect='id,number,customer_id AS customerId,stall,notes,created_at AS createdAt,order_day AS orderDay,demo,status,revision,fulfillment_confirmation AS fulfillmentConfirmation,allocation_revision AS allocationRevision';
export async function readOrder(env:Env,id:string):Promise<Order>{
  const header=env.DB.prepare(`SELECT ${orderSelect} FROM portal_orders WHERE id=?`).bind(id);
  const items=env.DB.prepare(`SELECT i.id,i.product_id AS productId,i.sku,i.product_name AS productName,i.specification,i.unit,COALESCE(i.current_quantity,i.quantity) AS quantity,i.quantity AS originalQuantity,CASE WHEN b.status IN ('SUPPLIER_CONFIRMED','COMPLETED') THEN a.allocated_quantity ELSE NULL END AS allocatedQuantity FROM portal_order_items i LEFT JOIN purchase_allocations a ON a.order_item_id=i.id LEFT JOIN purchase_batch_items bi ON bi.id=a.batch_item_id LEFT JOIN purchase_batches b ON b.id=bi.batch_id WHERE i.order_id=? ORDER BY i.sku`).bind(id);
  const history=env.DB.prepare('SELECT revision,kind,before_json AS before,after_json AS after,source,created_at AS createdAt FROM portal_order_revisions WHERE order_id=? ORDER BY revision DESC').bind(id);
  const snapshot=await env.DB.batch([header,items,history]);const order=snapshot[0].results[0] as Order|undefined;if(!order)throw new ApiError(404,'找不到訂單');
  return {...order,items:snapshot[1].results as OrderItem[],history:snapshot[2].results as Order['history']};
}
export async function ownedOrder(request:Request,env:Env,id:string,allowLegacy=false){
  const customer=await customerFor(request,env,false),order=await readOrder(env,id);
  if(customer&&order.customerId===customer.id)return order;
  if(allowLegacy&&!order.customerId){const owner=legacyOwner(request);if(owner&&await env.DB.prepare('SELECT id FROM portal_orders WHERE id=? AND owner_id=? AND customer_id IS NULL').bind(id,owner).first())return order;}
  throw new ApiError(customer?404:401,customer?'找不到訂單':'請登入原訂購攤位');
}
export function event(env:Env,order:Order,kind:string,after:unknown,source:string){return env.DB.prepare('INSERT INTO portal_order_revisions(id,order_id,revision,kind,before_json,after_json,source,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),order.id,(order.revision||1)+1,kind,JSON.stringify({status:order.status,notes:order.notes,items:order.items,fulfillmentConfirmation:order.fulfillmentConfirmation}),JSON.stringify(after),source,now());}
export function orderGuard(order:Order,status:OrderStatus):Guard{return {sql:'EXISTS(SELECT 1 FROM portal_orders WHERE id=? AND revision=? AND status=?)',args:[order.id,order.revision||1,status]};}
export async function validProducts(env:Env,ids:string[]){return (await env.DB.prepare(`SELECT ${productSelect} FROM portal_products WHERE id IN (SELECT value FROM json_each(?)) AND active=1 AND demo=? AND authorization_status=?`).bind(JSON.stringify(ids),demoMode(env),demoMode(env)?'DEMO':'AUTHORIZED').all<Product>()).results;}
const createSchema=z.object({expectedCustomerId:z.string().min(1).max(100),idempotencyKey:z.uuid(),stall:z.string().trim().min(1).max(60).optional(),notes:z.string().trim().max(300).default(''),items:z.array(z.object({productId:z.string().min(1).max(100),quantity:z.number().int().min(1).max(9999)}).strict()).min(1).max(100)}).strict();
export async function ordersRoute(request:Request,env:Env,path:string):Promise<Response|null>{
  const url=new URL(request.url),demo=demoMode(env);
  if(path==='catalog'&&request.method==='GET'){
    const products=await env.DB.prepare(`SELECT ${productSelect} FROM portal_products WHERE active=1 AND demo=? AND authorization_status=? ORDER BY sku`).bind(demo,demo?'DEMO':'AUTHORIZED').all<Product>();
    return json({products:products.results,demo:!!demo});
  }
  if(path==='frequent'&&request.method==='GET'){
    const c=await customerFor(request,env);
    const result=await env.DB.prepare(`SELECT i.product_id AS productId,COUNT(DISTINCT o.id) AS frequency FROM portal_order_items i JOIN portal_orders o ON o.id=i.order_id JOIN portal_products p ON p.id=i.product_id WHERE o.customer_id=? AND o.demo=? AND o.status<>'CANCELLED' AND COALESCE(i.current_quantity,i.quantity)>0 AND p.active=1 AND p.demo=? AND p.authorization_status=? GROUP BY i.product_id ORDER BY frequency DESC,MAX(o.created_at) DESC,i.product_id LIMIT 20`).bind(c!.id,demo,demo,demo?'DEMO':'AUTHORIZED').all();return json({items:result.results});
  }
  if(path==='orders'&&request.method==='POST'){
    const c=await customerFor(request,env),parsed=createSchema.safeParse(await body(request));if(!parsed.success)throw new ApiError(400,'數量須為 1–9999 的整數，每單最多 100 項');
    const input=parsed.data;if(input.expectedCustomerId!==c!.id)throw new ApiError(409,'登入攤位已變更，請重新整理再下單');input.items.sort((a,b)=>a.productId.localeCompare(b.productId));if(new Set(input.items.map(i=>i.productId)).size!==input.items.length)throw new ApiError(400,'同一商品請合併數量');
    const digest=await hash(JSON.stringify({customerId:c!.id,notes:input.notes,items:input.items,demo}));
    const previous=await env.DB.prepare('SELECT id,request_hash AS hash FROM portal_orders WHERE owner_id=? AND idempotency_key=?').bind('customer:'+c!.id,input.idempotencyKey).first<{id:string;hash:string}>();
    if(previous){if(previous.hash!==digest)throw new ApiError(409,'送單編號已使用');return json({order:await readOrder(env,previous.id),duplicate:true});}
    const products=await validProducts(env,input.items.map(i=>i.productId));if(products.length!==input.items.length)throw new ApiError(409,'商品已變更，請重新選擇');
    const id=crypto.randomUUID(),created=now(),number=`DM-${taipeiDay().replaceAll('-','')}-${id.slice(0,8).toUpperCase()}`;
    const statements=[env.DB.prepare(`INSERT INTO portal_orders(id,number,owner_id,customer_id,idempotency_key,request_hash,created_at,order_day,stall,notes,demo,status,revision,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,'SUBMITTED',1,?)`).bind(id,number,'customer:'+c!.id,c!.id,input.idempotencyKey,digest,created,taipeiDay(),c!.stallName,input.notes,demo,created)];
    const snapshots=input.items.map(item=>{const p=products.find(p=>p.id===item.productId)!;return {id:crypto.randomUUID(),productId:p.id,sku:p.sku,productName:p.name,specification:p.specification,unit:p.unit,quantity:item.quantity};});
    for(const item of snapshots)statements.push(env.DB.prepare('INSERT INTO portal_order_items(id,order_id,product_id,sku,product_name,specification,unit,quantity,current_quantity) VALUES (?,?,?,?,?,?,?,?,?)').bind(item.id,id,item.productId,item.sku,item.productName,item.specification,item.unit,item.quantity,item.quantity));
    statements.push(env.DB.prepare('INSERT INTO portal_order_revisions(id,order_id,revision,kind,before_json,after_json,source,created_at) VALUES (?,?,1,\'SUBMITTED\',\'{}\',?,?,?)').bind(crypto.randomUUID(),id,JSON.stringify({items:snapshots,notes:input.notes}),`CUSTOMER:${c!.id}`,created));
    try{await atomic(env.DB,[{sql:'(SELECT COUNT(*) FROM portal_orders WHERE customer_id=? AND created_at>?)<10',args:[c!.id,new Date(Date.now()-60000).toISOString()]}],statements);}catch(e){const duplicate=await env.DB.prepare('SELECT id,request_hash AS hash FROM portal_orders WHERE owner_id=? AND idempotency_key=?').bind('customer:'+c!.id,input.idempotencyKey).first<{id:string;hash:string}>();if(duplicate&&duplicate.hash===digest)return json({order:await readOrder(env,duplicate.id),duplicate:true});throw e;}
    return json({order:await readOrder(env,id)},201);
  }
  if(path==='orders'&&request.method==='GET'){
    const c=await customerFor(request,env);const offset=Math.max(0,Math.min(100000,Number(url.searchParams.get('offset'))||0));
    const rows=await env.DB.prepare(`SELECT ${orderSelect},(SELECT COUNT(*) FROM portal_order_items i WHERE i.order_id=portal_orders.id AND COALESCE(current_quantity,quantity)>0) AS itemCount FROM portal_orders WHERE customer_id=? AND demo=? ORDER BY created_at DESC,id LIMIT 31 OFFSET ?`).bind(c!.id,demo,offset).all();return json({orders:rows.results.slice(0,30),hasMore:rows.results.length>30});
  }
  const match=path.match(/^orders\/([^/]+)(?:\/(reorder|cancel|acknowledge))?$/);
  if(match){
    const order=await ownedOrder(request,env,match[1],request.method==='GET'&&!match[2]);
    if(request.method==='GET'&&!match[2])return json({order});
    if(request.method==='GET'&&match[2]==='reorder'){
      const products=await validProducts(env,order.items.filter(i=>i.quantity>0).map(i=>i.productId));const items:OrderItem[]=[],unavailable:OrderItem[]=[];
      for(const i of order.items.filter(i=>i.quantity>0)){const p=products.find(p=>p.id===i.productId);if(p&&p.sku===i.sku&&p.specification===i.specification&&p.unit===i.unit&&p.name===i.productName)items.push(i);else unavailable.push(i);}
      return json({items,unavailable,customerId:order.customerId});
    }
    if(request.method==='PATCH'&&!match[2]){
      const input=z.object({revision:z.number().int().min(1),notes:z.string().trim().max(300),items:z.array(z.object({id:z.string(),quantity:z.number().int().min(0).max(9999)}).strict()).min(1).max(100)}).strict().safeParse(await body(request));
      if(!input.success)throw new ApiError(400,'修改內容不正確');const data=input.data;
      if(order.status!=='SUBMITTED'||order.revision!==data.revision)throw new ApiError(409,'已截單或訂單有更新，請重新查看');
      if(data.items.length!==order.items.length||new Set(data.items.map(i=>i.id)).size!==order.items.length||data.items.some(i=>!order.items.some(j=>j.id===i.id))||!data.items.some(i=>i.quantity>0))throw new ApiError(400,'請保留至少一項商品；不需要時可取消訂單');
      const next=order.items.map(i=>({...i,quantity:data.items.find(j=>j.id===i.id)!.quantity}));
      const available=await validProducts(env,next.filter(i=>i.quantity>0).map(i=>i.productId));
      if(next.some(i=>i.quantity>0&&!available.some(p=>p.id===i.productId&&p.sku===i.sku&&p.name===i.productName&&p.specification===i.specification&&p.unit===i.unit)))throw new ApiError(409,'商品已下架或規格變更，請將該項改為 0，再重新選商品');
      await atomic(env.DB,[orderGuard(order,'SUBMITTED')],[event(env,order,'EDITED',{items:next,notes:data.notes},`CUSTOMER:${order.customerId}`),...data.items.map(i=>env.DB.prepare('UPDATE portal_order_items SET current_quantity=? WHERE id=? AND order_id=?').bind(i.quantity,i.id,order.id)),env.DB.prepare('UPDATE portal_orders SET notes=?,revision=revision+1,updated_at=? WHERE id=?').bind(data.notes,now(),order.id)]);return json({order:await readOrder(env,order.id)});
    }
    if(request.method==='POST'&&match[2]==='cancel'){
      const data=z.object({revision:z.number().int()}).strict().safeParse(await body(request));if(!data.success)throw new ApiError(400,'資料不正確');
      if(order.revision!==data.data.revision||order.status!=='SUBMITTED')throw new ApiError(409,'已截單或訂單有更新，不能取消');
      await atomic(env.DB,[orderGuard(order,'SUBMITTED')],[event(env,order,'CANCELLED',{status:'CANCELLED'},`CUSTOMER:${order.customerId}`),env.DB.prepare("UPDATE portal_orders SET status='CANCELLED',revision=revision+1,updated_at=? WHERE id=?").bind(now(),order.id)]);return json({order:await readOrder(env,order.id)});
    }
    if(request.method==='POST'&&match[2]==='acknowledge'){
      const data=z.object({revision:z.number().int(),allocationRevision:z.number().int()}).strict().safeParse(await body(request));if(!data.success)throw new ApiError(400,'資料不正確');
      const guards=[{sql:"EXISTS(SELECT 1 FROM portal_orders WHERE id=? AND revision=? AND allocation_revision=? AND fulfillment_confirmation='PENDING' AND status='SUPPLIER_CONFIRMED')",args:[order.id,data.data.revision,data.data.allocationRevision]}];
      await atomic(env.DB,guards,[event(env,order,'ALLOCATION_ACCEPTED',{allocationRevision:data.data.allocationRevision,items:order.items},`CUSTOMER:${order.customerId}`),env.DB.prepare("UPDATE portal_orders SET fulfillment_confirmation='ACCEPTED',revision=revision+1,updated_at=? WHERE id=?").bind(now(),order.id)]);return json({order:await readOrder(env,order.id)});
    }
  }
  if(path==='stats'&&request.method==='GET'){
    const clauses=["o.demo=?","o.status<>'CANCELLED'"],params:(string|number)[]=[demo],from=url.searchParams.get('from'),to=url.searchParams.get('to');
    if(from){clauses.push('o.order_day>=?');params.push(dateValue(from));}if(to){clauses.push('o.order_day<=?');params.push(dateValue(to));}if(from&&to&&from>to)throw new ApiError(400,'開始日期不可晚於結束日期');
    const where=clauses.join(' AND ');const result=await env.DB.batch([env.DB.prepare(`SELECT i.product_id AS productId,i.sku,i.product_name AS productName,i.specification,i.unit,SUM(COALESCE(i.current_quantity,i.quantity)) AS quantity,COUNT(DISTINCT o.id) AS orderCount FROM portal_order_items i JOIN portal_orders o ON o.id=i.order_id WHERE ${where} AND COALESCE(i.current_quantity,i.quantity)>0 GROUP BY i.product_id,i.sku,i.product_name,i.specification,i.unit ORDER BY quantity DESC,i.sku`).bind(...params),env.DB.prepare(`SELECT COUNT(*) AS count FROM portal_orders o WHERE ${where}`).bind(...params)]);
    const rows=result[0].results as SummaryRow[];return json({rows,orderCount:(result[1].results[0] as {count:number}).count,productCount:rows.length,units:unitTotals(rows),updatedAt:now(),demo:!!demo});
  }
  if(path==='admin/orders'&&request.method==='GET'){
    await adminFor(request,env);const from=url.searchParams.get('from'),to=url.searchParams.get('to'),clauses=['demo=?'],args:(string|number)[]=[demo];if(from){clauses.push('order_day>=?');args.push(dateValue(from));}if(to){clauses.push('order_day<=?');args.push(dateValue(to));}if(from&&to&&from>to)throw new ApiError(400,'日期區間不正確');
    const offset=Math.max(0,Math.min(100000,Number(url.searchParams.get('offset'))||0));
    const rows=await env.DB.prepare(`SELECT ${orderSelect},(SELECT COUNT(*) FROM portal_order_items i WHERE i.order_id=portal_orders.id AND COALESCE(current_quantity,quantity)>0) AS itemCount FROM portal_orders WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC,id LIMIT 101 OFFSET ?`).bind(...args,offset).all();return json({orders:rows.results.slice(0,100),hasMore:rows.results.length>100});
  }
  if(/^admin\/orders\/[^/]+$/.test(path)&&request.method==='GET'){await adminFor(request,env);return json({order:await readOrder(env,path.split('/')[2])});}
  if(path==='admin/cutoff'&&request.method==='POST'){
    await adminFor(request,env);const parsed=z.object({orders:z.array(z.object({id:z.string(),revision:z.number().int()}).strict()).min(1).max(100)}).strict().safeParse(await body(request));if(!parsed.success)throw new ApiError(400,'請選取待截單訂單');
    if(new Set(parsed.data.orders.map(o=>o.id)).size!==parsed.data.orders.length)throw new ApiError(400,'訂單不可重複');
    const selected=await Promise.all(parsed.data.orders.map(o=>readOrder(env,o.id)));if(selected.some((o,i)=>!o.customerId||o.status!=='SUBMITTED'||o.revision!==parsed.data.orders[i].revision||o.demo!==demo))throw new ApiError(409,'訂單已變更，請更新');
    await atomic(env.DB,selected.map(o=>orderGuard(o,'SUBMITTED')),selected.flatMap(o=>[event(env,o,'LOCKED',{status:'LOCKED'},'ADMIN'),env.DB.prepare("UPDATE portal_orders SET status='LOCKED',revision=revision+1,updated_at=? WHERE id=?").bind(now(),o.id)]));return json({locked:selected.length});
  }
  return null;
}
