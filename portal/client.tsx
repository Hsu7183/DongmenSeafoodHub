import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import {Fish} from 'lucide-react';
import {Button} from '@/components/ui/button';
import type {Customer} from './types';
export class ClientError extends Error{constructor(public status:number,message:string){super(message);}}
export async function api<T>(path:string,options?:RequestInit):Promise<T>{const r=await fetch(`/api/portal/${path}`,{credentials:'same-origin',...options});const data=await r.json();if(!r.ok)throw new ClientError(r.status,data.error||'目前無法完成，請稍後重試');return data;}
export const write=(method:string,data:unknown):RequestInit=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
export const message=(e:unknown)=>e instanceof Error?e.message:'目前無法完成，請稍後重試';
export function ErrorMessage({error}:{error:string}){const admin=error==='請先登入管理者',login=admin||error==='請先選攤位並輸入 PIN'||error==='請登入原訂購攤位';return error?<div className="error" role="alert">{error}{login&&<p><a className="large-link" href={admin?location.pathname:'/login?next='+encodeURIComponent(location.pathname)}>重新登入</a></p>}</div>:null;}
export const CustomerContext=createContext<Customer|null>(null);
export const useCustomer=()=>useContext(CustomerContext)!;
export function CustomerGate({children}:{children:ReactNode}){
  const [customer,setCustomer]=useState<Customer|null>(null),[error,setError]=useState('');
  useEffect(()=>{api<{customer:Customer|null}>('auth/me').then(d=>{if(d.customer)setCustomer(d.customer);else window.location.replace('/login?next='+encodeURIComponent(window.location.pathname));}).catch(e=>setError(message(e)));},[]);
  return customer?<CustomerContext.Provider value={customer}>{children}</CustomerContext.Provider>:<main className="workspace"><p>讀取中…</p><ErrorMessage error={error}/>{error&&<a href="/login">前往登入</a>}</main>;
}
export function AccountBar(){
  const context=useContext(CustomerContext),[customer,setCustomer]=useState<Customer|null>(context),[error,setError]=useState('');
  useEffect(()=>{if(!context)api<{customer:Customer|null}>('auth/me').then(d=>setCustomer(d.customer)).catch(()=>{});},[context]);
  async function logout(){try{await api('auth/logout',write('POST',{}));for(const key of ['dm-order-draft','dm-order-pending','dm-reorder'])sessionStorage.removeItem(key);window.location.assign('/login');}catch(e){setError(message(e));}}
  return <div className="account-bar no-print"><div>{customer?<><strong>{customer.stallName}</strong><a href="/my-orders">我的訂單</a><button onClick={logout}>換攤位</button></>:<a href="/login">攤位登入</a>}</div><ErrorMessage error={error}/></div>;
}
export function Header({active}:{active:string}){return <><header className="site-header"><a href="/" className="brand"><Fish size={28}/><span>東門市場<small>食材訂購</small></span></a><nav aria-label="主要選單"><a href="/order" className={active==='order'?'active':''}>下單</a><a href="/stats" className={active==='stats'?'active':''}>統計</a></nav></header><AccountBar/></>;}
export function ConfirmAction({label,description,onConfirm,disabled=false}:{label:string;description:string;onConfirm:()=>Promise<void>;disabled?:boolean}){
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  return <><Button variant="outline" disabled={disabled||busy} onClick={()=>setOpen(true)}>{label}</Button>{open&&<div className="inline-confirm" role="group" aria-label={label}><p>{description}</p><ErrorMessage error={error}/><div className="button-row"><Button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await onConfirm();setOpen(false);}catch(e){setError(message(e));}finally{setBusy(false);}}}>{busy?'處理中…':'確定'}</Button><Button variant="outline" disabled={busy} onClick={()=>setOpen(false)}>返回</Button></div></div>}</>;
}
