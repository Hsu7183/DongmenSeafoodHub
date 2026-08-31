import type { D1Database,D1PreparedStatement } from '@cloudflare/workers-types';
export type Env={DB:D1Database;ASSETS:{fetch:(request:Request)=>Promise<Response>};SUPPLIER_CONTENT_AUTHORIZED?:string;PORTAL_ACCEPT_LIVE_ORDERS?:string;PORTAL_ADMIN_SECRET?:string;PORTAL_PIN_PEPPER?:string};
export class ApiError extends Error { constructor(public status:number,message:string){super(message);} }
export function json(data:unknown,status=200,headers:Record<string,string>={}){return Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',...headers}});}
export const now=()=>new Date().toISOString();
export const demoMode=(env:Env)=>env.SUPPLIER_CONTENT_AUTHORIZED==='true'&&env.PORTAL_ACCEPT_LIVE_ORDERS==='true'?0:1;
export function cookie(request:Request,name:string){return request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)||'';}
export function legacyOwner(request:Request){const v=cookie(request,'dm_portal_session');return /^[a-f0-9-]{36}$/.test(v)?v:null;}
export async function hash(text:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');}
export async function body(request:Request,maxBytes=25000){
  if(request.headers.get('Origin')!==new URL(request.url).origin)throw new ApiError(403,'請從本站操作');
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw new ApiError(415,'請使用網站表單');
  const reader=request.body?.getReader();if(!reader)throw new ApiError(400,'資料格式不正確');let bytes=0,text='';const decoder=new TextDecoder();
  for(;;){const p=await reader.read();if(p.done)break;bytes+=p.value.byteLength;if(bytes>maxBytes){await reader.cancel();throw new ApiError(413,'內容過長');}text+=decoder.decode(p.value,{stream:true});}
  try{return JSON.parse(text+decoder.decode()) as unknown;}catch{throw new ApiError(400,'資料格式不正確');}
}
export function dateValue(value:string){const d=new Date(value+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==value)throw new ApiError(400,'日期格式不正確');return value;}
export type Guard={sql:string;args:(string|number|null)[]};
export async function atomic(db:D1Database,guards:Guard[],statements:D1PreparedStatement[]){
  const id=crypto.randomUUID();
  const checks=guards.map((g,i)=>db.prepare(`INSERT INTO portal_atomic_guards(id,ok) VALUES (?,CASE WHEN (${g.sql}) THEN 1 ELSE 0 END)`).bind(id+i,...g.args));
  try{return await db.batch([...checks,...statements,db.prepare('DELETE FROM portal_atomic_guards WHERE id LIKE ?').bind(id+'%')]);}
  catch(e){if(/constraint|UNIQUE|portal_atomic_guard|allocation_limit/i.test(e instanceof Error?e.message:''))throw new ApiError(409,'資料已變更或已處理，請更新後再試');throw e;}
}
