import {z} from 'zod';
import {adminFor} from './auth';
import {ApiError,atomic,body,demoMode,hash,json,now,type Env} from './server-common';
import {event,orderGuard,readOrder} from './orders';
import {taipeiDay,type PurchaseBatch,type BatchItem,type Allocation,type Order} from './types';
export async function readBatch(env:Env,id:string):Promise<PurchaseBatch>{
  const header=env.DB.prepare('SELECT id,number,status,revision,demo,created_at AS createdAt FROM purchase_batches WHERE id=?').bind(id);
  const items=env.DB.prepare('SELECT id,product_id AS productId,sku,product_name AS productName,specification,unit,requested_quantity AS requestedQuantity,supplier_confirmed_quantity AS supplierConfirmedQuantity FROM purchase_batch_items WHERE batch_id=? ORDER BY sku,id').bind(id);
  const allocations=env.DB.prepare('SELECT a.id,a.batch_item_id AS batchItemId,a.order_id AS orderId,a.order_item_id AS orderItemId,o.stall,a.requested_quantity AS requestedQuantity,a.allocated_quantity AS allocatedQuantity FROM purchase_allocations a JOIN portal_orders o ON o.id=a.order_id JOIN purchase_batch_items i ON i.id=a.batch_item_id WHERE i.batch_id=? ORDER BY o.stall,a.id').bind(id);
  const orders=env.DB.prepare('SELECT DISTINCT o.id,o.stall,o.status,o.fulfillment_confirmation AS fulfillmentConfirmation FROM portal_orders o JOIN purchase_allocations a ON a.order_id=o.id JOIN purchase_batch_items i ON i.id=a.batch_item_id WHERE i.batch_id=? ORDER BY o.stall,o.id').bind(id);
  const snapshot=await env.DB.batch([header,items,allocations,orders]);const batch=snapshot[0].results[0] as PurchaseBatch|undefined;if(!batch)throw new ApiError(404,'找不到採購批次');
  const rows=snapshot[2].results as (Allocation&{batchItemId:string})[];return {...batch,items:(snapshot[1].results as BatchItem[]).map(i=>({...i,allocations:rows.filter(a=>a.batchItemId===i.id)})),orders:snapshot[3].results as PurchaseBatch['orders']};
}
const selections=z.object({orders:z.array(z.object({id:z.string(),revision:z.number().int()}).strict()).min(1).max(100)}).strict();
function groupOrders(orders:Order[]){
  const groups=new Map<string,BatchItem>();
  for(const order of orders)for(const item of order.items.filter(i=>i.quantity>0)){
    const key=JSON.stringify([item.productId,item.sku,item.productName,item.specification,item.unit]);
    if(!groups.has(key))groups.set(key,{...item,id:crypto.randomUUID(),requestedQuantity:0,supplierConfirmedQuantity:null,allocations:[]});
    const group=groups.get(key)!;group.requestedQuantity+=item.quantity;group.allocations.push({id:crypto.randomUUID(),orderId:order.id,orderItemId:item.id!,stall:order.stall,requestedQuantity:item.quantity,allocatedQuantity:0});
  }
  return [...groups.values()];
}
async function selectedOrders(env:Env,input:z.infer<typeof selections>){
  if(new Set(input.orders.map(o=>o.id)).size!==input.orders.length)throw new ApiError(400,'訂單不可重複');
  const orders=await Promise.all(input.orders.map(o=>readOrder(env,o.id)));
  if(orders.some((o,i)=>!o.customerId||o.status!=='LOCKED'||o.revision!==input.orders[i].revision||o.demo!==demoMode(env)))throw new ApiError(409,'只能選取未採購的已截單訂單，請更新');return orders;
}
export async function purchasingRoute(request:Request,env:Env,path:string):Promise<Response|null>{
  if(!path.startsWith('admin/purchasing'))return null;await adminFor(request,env);
  if(path==='admin/purchasing'&&request.method==='GET'){
    const result=await env.DB.prepare('SELECT id,number,status,revision,created_at AS createdAt FROM purchase_batches WHERE demo=? ORDER BY created_at DESC LIMIT 100').bind(demoMode(env)).all();return json({batches:result.results});
  }
  if(path==='admin/purchasing/preview'&&request.method==='POST'){
    const parsed=selections.safeParse(await body(request));if(!parsed.success)throw new ApiError(400,'請選取已截單訂單');return json({items:groupOrders(await selectedOrders(env,parsed.data))});
  }
  if(path==='admin/purchasing'&&request.method==='POST'){
    const parsed=selections.extend({idempotencyKey:z.uuid()}).safeParse(await body(request));if(!parsed.success)throw new ApiError(400,'請選取已截單訂單');
    const input=parsed.data;input.orders.sort((a,b)=>a.id.localeCompare(b.id));const digest=await hash(JSON.stringify({orders:input.orders,demo:demoMode(env)}));
    const existing=await env.DB.prepare('SELECT id,request_hash AS hash FROM purchase_batches WHERE idempotency_key=?').bind(input.idempotencyKey).first<{id:string;hash:string}>();if(existing){if(existing.hash!==digest)throw new ApiError(409,'操作編號已使用');return json({batch:await readBatch(env,existing.id),duplicate:true});}
    const orders=await selectedOrders(env,input),items=groupOrders(orders),id=crypto.randomUUID(),number=`PO-${taipeiDay().replaceAll('-','')}-${id.slice(0,8).toUpperCase()}`;
    if(!items.length)throw new ApiError(400,'沒有有效商品');
    const statements=[env.DB.prepare('INSERT INTO purchase_batches(id,number,idempotency_key,request_hash,status,revision,demo,created_at,updated_at) VALUES (?,?,?,?,\'PURCHASING\',1,?,?,?)').bind(id,number,input.idempotencyKey,digest,demoMode(env),now(),now())];
    statements.push(env.DB.prepare(`INSERT INTO purchase_batch_items(id,batch_id,product_id,sku,product_name,specification,unit,requested_quantity) SELECT json_extract(value,'$.id'),?,json_extract(value,'$.productId'),json_extract(value,'$.sku'),json_extract(value,'$.productName'),json_extract(value,'$.specification'),json_extract(value,'$.unit'),json_extract(value,'$.requestedQuantity') FROM json_each(?)`).bind(id,JSON.stringify(items.map(({allocations:ignored,...i})=>{void ignored;return i;}))));
    statements.push(env.DB.prepare(`INSERT INTO purchase_allocations(id,batch_item_id,order_id,order_item_id,requested_quantity,allocated_quantity) SELECT json_extract(value,'$.id'),json_extract(value,'$.batchItemId'),json_extract(value,'$.orderId'),json_extract(value,'$.orderItemId'),json_extract(value,'$.requestedQuantity'),0 FROM json_each(?)`).bind(JSON.stringify(items.flatMap(i=>i.allocations.map(a=>({...a,batchItemId:i.id}))))));
    for(const o of orders)statements.push(event(env,o,'PURCHASING',{status:'PURCHASING',batchId:id},'ADMIN'),env.DB.prepare("UPDATE portal_orders SET status='PURCHASING',revision=revision+1,updated_at=? WHERE id=?").bind(now(),o.id));
    try{await atomic(env.DB,orders.map(o=>orderGuard(o,'LOCKED')),statements);}catch(e){const previous=await env.DB.prepare('SELECT id,request_hash AS hash FROM purchase_batches WHERE idempotency_key=?').bind(input.idempotencyKey).first<{id:string;hash:string}>();if(previous?.hash===digest)return json({batch:await readBatch(env,previous.id),duplicate:true});throw e;}
    return json({batch:await readBatch(env,id)},201);
  }
  const match=path.match(/^admin\/purchasing\/([^/]+)(?:\/(confirm|complete))?$/);if(!match)return null;
  const batch=await readBatch(env,match[1]);if(batch.demo!==demoMode(env))throw new ApiError(404,'找不到批次');
  if(request.method==='GET'&&!match[2])return json({batch});
  const batchGuard={sql:'EXISTS(SELECT 1 FROM purchase_batches WHERE id=? AND revision=? AND status=?)',args:[batch.id,batch.revision,batch.status]};
  if(request.method==='POST'&&match[2]==='confirm'){
    const parsed=z.object({revision:z.number().int(),items:z.array(z.object({id:z.string(),supplierConfirmedQuantity:z.number().int().min(0).max(99990000),allocations:z.array(z.object({id:z.string(),allocatedQuantity:z.number().int().min(0).max(9999)}).strict()).max(100)}).strict()).min(1).max(10000)}).strict().safeParse(await body(request,1500000));
    if(!parsed.success)throw new ApiError(400,'供應與配貨數量須為非負整數');const data=parsed.data;
    if(data.revision!==batch.revision||!['PURCHASING','SUPPLIER_CONFIRMED'].includes(batch.status))throw new ApiError(409,'批次已更新或完成');
    if(data.items.length!==batch.items.length||new Set(data.items.map(i=>i.id)).size!==batch.items.length)throw new ApiError(400,'請完整填寫所有商品');
    for(const i of data.items){const original=batch.items.find(j=>j.id===i.id);if(!original||i.supplierConfirmedQuantity>original.requestedQuantity||i.allocations.length!==original.allocations.length||new Set(i.allocations.map(a=>a.id)).size!==original.allocations.length)throw new ApiError(400,'供應量或配貨項目不正確');
      let sum=0;for(const a of i.allocations){const old=original.allocations.find(b=>b.id===a.id);if(!old||a.allocatedQuantity>old.requestedQuantity)throw new ApiError(400,'配貨不得超過原需求');sum+=a.allocatedQuantity;}
      if(sum>i.supplierConfirmedQuantity)throw new ApiError(400,'配貨總量不能超過可供量');if(sum!==i.supplierConfirmedQuantity)throw new ApiError(400,'請將可供量分配完成，未配到的攤位填 0');
    }
    const orders=await Promise.all(batch.orders.map(o=>readOrder(env,o.id)));const statements=[env.DB.prepare('INSERT INTO purchase_batch_events(id,batch_id,revision,before_json,after_json,source,created_at) VALUES (?,?,?,?,?,\'ADMIN\',?)').bind(crypto.randomUUID(),batch.id,batch.revision+1,JSON.stringify(batch.items),JSON.stringify(data.items),now())];
    statements.push(env.DB.prepare('UPDATE purchase_allocations SET allocated_quantity=0 WHERE batch_item_id IN (SELECT id FROM purchase_batch_items WHERE batch_id=?)').bind(batch.id));
    statements.push(env.DB.prepare(`UPDATE purchase_batch_items SET supplier_confirmed_quantity=json_extract(j.value,'$.supplierConfirmedQuantity') FROM json_each(?) j WHERE purchase_batch_items.id=json_extract(j.value,'$.id') AND batch_id=?`).bind(JSON.stringify(data.items.map(i=>({id:i.id,supplierConfirmedQuantity:i.supplierConfirmedQuantity}))),batch.id));
    statements.push(env.DB.prepare(`UPDATE purchase_allocations SET allocated_quantity=json_extract(j.value,'$.allocatedQuantity') FROM json_each(?) j WHERE purchase_allocations.id=json_extract(j.value,'$.id') AND batch_item_id IN (SELECT id FROM purchase_batch_items WHERE batch_id=?)`).bind(JSON.stringify(data.items.flatMap(i=>i.allocations)),batch.id));
    for(const o of orders){const proposed=batch.items.flatMap(i=>i.allocations).filter(a=>a.orderId===o.id).map(a=>({...a,allocatedQuantity:data.items.flatMap(i=>i.allocations).find(b=>b.id===a.id)!.allocatedQuantity}));const short=proposed.some(a=>a.allocatedQuantity<a.requestedQuantity);
      statements.push(event(env,o,'ALLOCATION_PROPOSED',{allocations:proposed,allocationRevision:batch.revision+1,fulfillmentConfirmation:short?'PENDING':'NONE'},'ADMIN'),env.DB.prepare("UPDATE portal_orders SET status='SUPPLIER_CONFIRMED',fulfillment_confirmation=?,allocation_revision=?,revision=revision+1,updated_at=? WHERE id=?").bind(short?'PENDING':'NONE',batch.revision+1,now(),o.id));
    }
    statements.push(env.DB.prepare("UPDATE purchase_batches SET status='SUPPLIER_CONFIRMED',revision=revision+1,updated_at=? WHERE id=?").bind(now(),batch.id));
    await atomic(env.DB,[batchGuard,...orders.map(o=>orderGuard(o,o.status!))],statements);return json({batch:await readBatch(env,batch.id)});
  }
  if(request.method==='POST'&&match[2]==='complete'){
    const parsed=z.object({revision:z.number().int()}).strict().safeParse(await body(request));if(!parsed.success)throw new ApiError(400,'資料不正確');
    if(parsed.data.revision!==batch.revision||batch.status!=='SUPPLIER_CONFIRMED')throw new ApiError(409,'請先完成供貨確認');
    const orders=await Promise.all(batch.orders.map(o=>readOrder(env,o.id)));if(orders.some(o=>o.fulfillmentConfirmation==='PENDING'))throw new ApiError(409,'仍有攤位尚未確認異動數量');
    await atomic(env.DB,[batchGuard,...orders.map(o=>orderGuard(o,'SUPPLIER_CONFIRMED'))],[...orders.flatMap(o=>[event(env,o,'COMPLETED',{status:'COMPLETED'},'ADMIN'),env.DB.prepare("UPDATE portal_orders SET status='COMPLETED',revision=revision+1,updated_at=? WHERE id=?").bind(now(),o.id)]),env.DB.prepare("UPDATE purchase_batches SET status='COMPLETED',revision=revision+1,updated_at=? WHERE id=?").bind(now(),batch.id)]);return json({batch:await readBatch(env,batch.id)});
  }
  return null;
}
