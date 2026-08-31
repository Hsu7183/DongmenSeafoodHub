import { z } from 'zod';
import {ApiError,body,cookie,hash,json,now,type Env} from './server-common';
import type { Customer } from './types';
const customerCookie='dm_customer_session',adminCookie='dm_admin_session';
const hex=(a:Uint8Array)=>Array.from(a,b=>b.toString(16).padStart(2,'0')).join('');
function secret(env:Env){if(!env.PORTAL_PIN_PEPPER||env.PORTAL_PIN_PEPPER.length<32)throw new ApiError(503,'登入尚未設定，請洽管理者');return env.PORTAL_PIN_PEPPER;}
export async function pinHash(pin:string,env:Env,salt=hex(crypto.getRandomValues(new Uint8Array(16)))){
  const pepper=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret(env)),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const material=await crypto.subtle.sign('HMAC',pepper,new TextEncoder().encode(pin));
  const key=await crypto.subtle.importKey('raw',material,'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:100000,hash:'SHA-256'},key,256);
  return `pbkdf2-sha256-v1$100000$${salt}$${hex(new Uint8Array(bits))}`;
}
async function equal(a:string,b:string){const aa=await hash(a),bb=await hash(b);let diff=0;for(let i=0;i<aa.length;i++)diff|=aa.charCodeAt(i)^bb.charCodeAt(i);return diff===0;}
function setCookie(request:Request,name:string,value:string,age:number){return `${name}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${new URL(request.url).protocol==='https:'?'; Secure':''}`;}
async function limited(request:Request,env:Env,account:string,admin=false){
  const time=Date.now(),windowMs=15*60*1000;
  const ip=request.headers.get('CF-Connecting-IP')||'local';
  const keys=await Promise.all([hash(`ip:${admin?'admin:':'customer:'}${ip}`),hash(admin?`admin-account:${ip}`:`customer-account:${account}`)]);
  const results=await env.DB.batch(keys.map(key=>env.DB.prepare(`INSERT INTO portal_login_limits(key,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END,expires_at=CASE WHEN expires_at<=? THEN ? ELSE expires_at END RETURNING attempts`).bind(key,time+windowMs,time,time,time+windowMs)));
  if(results.some((r,i)=>Number((r.results[0] as {attempts:number}).attempts)>(i===0?(admin?10:50):5)))throw new ApiError(429,'嘗試太多次，請於 15 分鐘後再試');
  return keys[1];
}
async function createSession(request:Request,env:Env,role:string,customerId:string|null,version:string){
  const name=role==='admin'?adminCookie:customerCookie,old=cookie(request,name),token=hex(crypto.getRandomValues(new Uint8Array(32))),age=role==='admin'?43200:2592000;
  const queries=[env.DB.prepare('INSERT INTO portal_sessions(token_hash,customer_id,role,auth_version,created_at,expires_at) VALUES (?,?,?,?,?,?)').bind(await hash(token),customerId,role,version,now(),new Date(Date.now()+age*1000).toISOString()),env.DB.prepare('DELETE FROM portal_sessions WHERE expires_at<?').bind(now())];
  if(old)queries.push(env.DB.prepare('DELETE FROM portal_sessions WHERE token_hash=?').bind(await hash(old)));
  await env.DB.batch(queries);return setCookie(request,name,token,age);
}
export async function customerFor(request:Request,env:Env,required=true):Promise<Customer|null>{
  const token=cookie(request,customerCookie);let customer:Customer|null=null;
  if(/^[0-9a-f]{64}$/.test(token))customer=await env.DB.prepare(`SELECT c.id,c.stall_name AS stallName,c.active FROM portal_sessions s JOIN portal_customers c ON c.id=s.customer_id WHERE s.token_hash=? AND s.role='customer' AND s.expires_at>? AND c.active=1 AND CAST(c.auth_version AS TEXT)=s.auth_version`).bind(await hash(token),now()).first<Customer>();
  if(!customer&&required)throw new ApiError(401,'請先選攤位並輸入 PIN');return customer;
}
export async function adminFor(request:Request,env:Env,required=true){
  const token=cookie(request,adminCookie);
  if(env.PORTAL_ADMIN_SECRET&&env.PORTAL_ADMIN_SECRET.length>=24&&/^[0-9a-f]{64}$/.test(token)){
    const session=await env.DB.prepare(`SELECT token_hash FROM portal_sessions WHERE token_hash=? AND role='admin' AND expires_at>? AND auth_version=?`).bind(await hash(token),now(),await hash(env.PORTAL_ADMIN_SECRET)).first();if(session)return true;
  }
  if(required)throw new ApiError(403,'請先登入管理者');return false;
}
export async function authRoute(request:Request,env:Env,path:string):Promise<Response|null>{
  if(path==='auth/customers'&&request.method==='GET')return json({customers:(await env.DB.prepare('SELECT id,stall_name AS stallName FROM portal_customers WHERE active=1 ORDER BY stall_name').all()).results});
  if(path==='auth/me'&&request.method==='GET')return json({customer:await customerFor(request,env,false),admin:await adminFor(request,env,false)});
  if(path==='auth/login'&&request.method==='POST'){
    const input=z.object({customerId:z.string().max(100),pin:z.string().regex(/^\d{4}$/)}).strict().safeParse(await body(request));if(!input.success)throw new ApiError(400,'請選攤位並輸入 4 位數 PIN');
    const limitKey=await limited(request,env,input.data.customerId);
    const row=await env.DB.prepare('SELECT id,stall_name AS stallName,pin_hash AS pinHash,auth_version AS authVersion FROM portal_customers WHERE id=? AND active=1').bind(input.data.customerId).first<{id:string;stallName:string;pinHash:string;authVersion:number}>();
    const candidate=await pinHash(input.data.pin,env,row?.pinHash.split('$')[2]||'00000000000000000000000000000000');
    if(!row||!await equal(candidate,row.pinHash))throw new ApiError(401,'攤位或 PIN 不正確');
    await env.DB.prepare('DELETE FROM portal_login_limits WHERE key=?').bind(limitKey).run();
    return json({customer:{id:row.id,stallName:row.stallName,active:1}},200,{'Set-Cookie':await createSession(request,env,'customer',row.id,String(row.authVersion))});
  }
  if(path==='auth/admin-login'&&request.method==='POST'){
    const input=z.object({secret:z.string().max(200)}).strict().safeParse(await body(request));if(!input.success)throw new ApiError(400,'請輸入管理密碼');
    const limitKey=await limited(request,env,'admin',true);
    if(!env.PORTAL_ADMIN_SECRET||env.PORTAL_ADMIN_SECRET.length<24)throw new ApiError(503,'管理登入尚未設定');
    if(!await equal(input.data.secret,env.PORTAL_ADMIN_SECRET))throw new ApiError(401,'管理密碼不正確');
    await env.DB.prepare('DELETE FROM portal_login_limits WHERE key=?').bind(limitKey).run();
    return json({ok:true},200,{'Set-Cookie':await createSession(request,env,'admin',null,await hash(env.PORTAL_ADMIN_SECRET))});
  }
  if(['auth/logout','auth/admin-logout'].includes(path)&&request.method==='POST'){
    await body(request);const name=path==='auth/logout'?customerCookie:adminCookie;
    await env.DB.prepare('DELETE FROM portal_sessions WHERE token_hash=?').bind(await hash(cookie(request,name))).run();return json({ok:true},200,{'Set-Cookie':setCookie(request,name,'',0)});
  }
  if(path==='admin/customers'&&request.method==='GET'){await adminFor(request,env);return json({customers:(await env.DB.prepare('SELECT id,stall_name AS stallName,active FROM portal_customers ORDER BY created_at DESC').all()).results});}
  if(path==='admin/customers'&&request.method==='POST'){
    await adminFor(request,env);const input=z.object({stallName:z.string().trim().min(1).max(60),pin:z.string().regex(/^\d{4}$/)}).strict().safeParse(await body(request));if(!input.success)throw new ApiError(400,'請填攤名與 4 位數 PIN');
    const id=crypto.randomUUID();try{await env.DB.prepare('INSERT INTO portal_customers(id,stall_name,pin_hash,active,auth_version,created_at,updated_at) VALUES (?,?,?,1,1,?,?)').bind(id,input.data.stallName.normalize('NFKC'),await pinHash(input.data.pin,env),now(),now()).run();}catch(e){if(/UNIQUE/.test(String(e)))throw new ApiError(409,'這個攤名已存在');throw e;}
    return json({customer:{id,stallName:input.data.stallName,active:1}},201);
  }
  if(/^admin\/customers\/[^/]+$/.test(path)&&request.method==='PATCH'){
    await adminFor(request,env);const input=z.object({pin:z.string().regex(/^\d{4}$/).optional(),active:z.boolean().optional()}).strict().safeParse(await body(request));if(!input.success||(!input.data.pin&&input.data.active===undefined))throw new ApiError(400,'請填新的 PIN 或啟用狀態');
    const id=path.split('/')[2],p=input.data.pin?await pinHash(input.data.pin,env):null;
    const result=await env.DB.batch([env.DB.prepare('UPDATE portal_customers SET pin_hash=COALESCE(?,pin_hash),active=COALESCE(?,active),auth_version=auth_version+1,updated_at=? WHERE id=?').bind(p,input.data.active===undefined?null:Number(input.data.active),now(),id),env.DB.prepare('DELETE FROM portal_sessions WHERE customer_id=?').bind(id)]);
    if(!result[0].meta.changes)throw new ApiError(404,'找不到攤位');return json({ok:true});
  }
  return null;
}
