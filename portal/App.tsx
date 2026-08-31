import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ArrowRight, Check, CheckCircle2, ClipboardList, Download, Fish, Minus, Plus, Printer, RefreshCw, Search, Table2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { formatUnits, taipeiDay, unitTotals, type Order, type Product, type Summary } from './types';
import { ProductImage } from './ProductImage';
import './styles.css';

function Home() {
  return <>
    <header className="site-header"><a href="/" className="brand"><Fish size={28}/><span>東門市場<small>食材訂購</small></span></a><span className="pill">測試版</span></header>
    <main className="home"><h1>請選擇</h1>
      <div className="entry-grid">
        <a href="/order" className="entry-card order-entry"><ClipboardList size={36}/><div><h2>下單</h2><p>選商品、填數量</p></div><ArrowRight size={28}/></a>
        <a href="/stats" className="entry-card stats-entry"><Table2 size={36}/><div><h2>統計</h2><p>看商品總數量</p></div><ArrowRight size={28}/></a>
      </div><DemoNotice/>
    </main>
  </>;
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/portal/${path}`, { credentials:'same-origin', ...options });
  const data = await response.json();
  if(!response.ok) throw new Error(data.error || '目前無法完成操作，請稍後重試');
  return data;
}
let catalogPromise: Promise<{products:Product[];demo:boolean}> | undefined;
function loadCatalog() {
  // Serialize first-cookie creation across tabs, and reuse it during React remounts.
  if(!catalogPromise) {
    const load = () => api<{products:Product[];demo:boolean}>('catalog');
    catalogPromise = (async () => navigator.locks ? await navigator.locks.request('dm-portal-session',load) : await load())().catch(error=>{catalogPromise=undefined;throw error;});
  }
  return catalogPromise!;
}
function Header({ active }: { active: string }) { return <header className="site-header"><a href="/" className="brand"><Fish size={28}/><span>東門市場<small>食材訂購</small></span></a><nav aria-label="主要選單"><a href="/order" className={active==='order'?'active':''}>下單</a><a href="/stats" className={active==='stats'?'active':''}>統計</a></nav></header>; }
function ErrorMessage({ error }: { error: string }) { return error ? <div className="error" role="alert">{error}</div> : null; }
function DemoNotice() { return <p className="demo-notice">測試版，不會實際採購。</p>; }
function saveDraft(value: unknown) { try { sessionStorage.setItem('dm-order-draft', JSON.stringify(value)); } catch { /* Draft storage is optional; orders are stored on the server. */ } }
function readDraft() { try { return JSON.parse(sessionStorage.getItem('dm-order-draft') || '{}'); } catch { return {}; } }

function OrderPage() {
  const [products,setProducts] = useState<Product[]>([]), [demo,setDemo] = useState(true), [loading,setLoading] = useState(true), [error,setError] = useState('');
  const [query,setQuery] = useState(''), [temperature,setTemperature] = useState('全部'), [category,setCategory] = useState('全部');
  const [quantities,setQuantities] = useState<Record<string,number>>(()=>readDraft().quantities || {});
  const [stall,setStall] = useState<string>(()=>readDraft().stall || ''), [notes,setNotes] = useState<string>(()=>readDraft().notes || '');
  const [review,setReview] = useState(false), [busy,setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(review)dialog.current?.showModal();},[review]);
  const sending = useRef(false); const pending = useRef<{content:string;key:string}|null>(null);
  useEffect(()=>{ let ignore=false; loadCatalog().then(data=>{if(!ignore){setProducts(data.products);setDemo(data.demo);}}).catch(e=>{if(!ignore)setError(e.message);}).finally(()=>{if(!ignore)setLoading(false);});return()=>{ignore=true;}; },[]);
  useEffect(()=>saveDraft({quantities,stall,notes}),[quantities,stall,notes]);
  const selected = products.filter(p=>(quantities[p.id]||0)>0);
  const totalUnits = formatUnits(unitTotals(selected.map(p=>({unit:p.unit,quantity:quantities[p.id]}))));
  const filtered = products.filter(p=>(temperature==='全部'||p.temperature===temperature)&&(category==='全部'||p.category===category)&&`${p.name} ${p.specification} ${p.sku}`.toLowerCase().includes(query.trim().toLowerCase()));
  const setQuantity = (id:string,value:number)=>setQuantities(prev=>({...prev,[id]:Math.min(9999,Math.max(0,Math.trunc(value)||0))}));
  const missing = Object.keys(quantities).some(id=>quantities[id]>0&&!products.some(p=>p.id===id));
  async function submit() {
    if(sending.current) return;
    if(!stall.trim()) { setError('請填寫攤位／店名，方便核對訂單'); return; }
    if(!selected.length || missing) { setError('商品清單已變更，請重新選擇商品'); return; }
    sending.current=true;setBusy(true);setError('');
    const content = JSON.stringify({stall:stall.trim(),notes:notes.trim(),items:selected.map(p=>({productId:p.id,quantity:quantities[p.id]}))});
    if(!pending.current || pending.current.content!==content) {
      let saved: typeof pending.current = null; try{saved=JSON.parse(sessionStorage.getItem('dm-order-pending')||'null');}catch{}
      pending.current=saved?.content===content?saved:{content,key:crypto.randomUUID()};
      try{sessionStorage.setItem('dm-order-pending',JSON.stringify(pending.current));}catch{}
    }
    try {
      const data = await api<{order:Order}>('orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...JSON.parse(content),idempotencyKey:pending.current.key})});
      try{sessionStorage.removeItem('dm-order-draft');sessionStorage.removeItem('dm-order-pending');}catch{}
      window.location.replace(`/receipt/${data.order.id}`);
    } catch(e) { setError(e instanceof Error?e.message:'送單未確認，請重試');sending.current=false;setBusy(false); }
  }
  return <><Header active="order"/><main className="workspace order-page"><div className="page-heading"><div><h1>下單</h1></div><span className="count-label">共 {products.length} 項</span></div>{demo&&<DemoNotice/>}<ErrorMessage error={error}/>{missing&&<div className="error">先前選取的商品已變更。<button onClick={()=>setQuantities({})}>清除舊選取</button></div>}<div className="order-layout"><section className="catalog-panel" aria-label="商品清單"><div className="catalog-toolbar"><label className="search-box"><Search size={19}/><Input aria-label="搜尋商品名稱或規格" value={query} onChange={e=>setQuery(e.target.value)} placeholder="找商品"/></label><div className="filter-row"><div className="segmented" aria-label="保存方式">{['全部','冷凍','冷藏'].map(t=><button key={t} className={temperature===t?'selected':''} aria-pressed={temperature===t} onClick={()=>setTemperature(t)}>{t==='冷藏'?'冷藏':t}</button>)}</div><select aria-label="商品分類" value={category} onChange={e=>setCategory(e.target.value)}><option value="全部">所有分類</option>{[...new Set(products.map(p=>p.category))].map(c=><option key={c}>{c}</option>)}</select></div></div>{loading?<div className="empty" role="status">正在載入商品…</div>:!filtered.length?<div className="empty">{products.length?'沒有符合的商品，試試其他關鍵字。':'目前沒有可訂商品。'}<button onClick={()=>{setQuery('');setTemperature('全部');setCategory('全部');}}>重設篩選</button></div>:<div className="product-list">{filtered.map(p=><div key={p.id} className={`product-row ${quantities[p.id]?'is-selected':''}`}><ProductImage product={p}/><div className="product-info"><div className="product-title">{quantities[p.id]>0&&<Check size={15}/>}<strong>{p.name}</strong><span className={`temperature ${p.temperature==='冷藏'?'chilled':''}`}>{p.temperature}</span></div><p>{p.specification}</p></div><div className="quantity-group"><span className="quantity-label">數量（{p.unit}）</span><div className="quantity-control"><Button variant="outline" size="icon" aria-label={`減少${p.name}數量`} disabled={busy||!quantities[p.id]} onClick={()=>setQuantity(p.id,(quantities[p.id]||0)-1)}><Minus size={15}/></Button><Input type="number" min={0} max={9999} step={1} inputMode="numeric" aria-label={`${p.name} ${p.specification}數量`} value={quantities[p.id]||0} disabled={busy} onFocus={e=>e.target.select()} onChange={e=>setQuantity(p.id,Number(e.target.value))}/><Button variant="outline" size="icon" aria-label={`增加${p.name}數量`} disabled={busy||(quantities[p.id]||0)>=9999} onClick={()=>setQuantity(p.id,(quantities[p.id]||0)+1)}><Plus size={15}/></Button></div></div></div>)}</div>}</section><aside className="order-summary"><div className="summary-title"><h2>訂購單</h2><span>{selected.length} 項</span></div>{selected.length?<ul className="selected-list">{selected.map(p=><li key={p.id}><div><strong>{p.name}</strong><small>{p.specification}</small></div><b>{quantities[p.id]} {p.unit}</b><button aria-label={`移除${p.name}`} disabled={busy} onClick={()=>setQuantity(p.id,0)}><Trash2 size={14}/></button></li>)}</ul>:<div className="empty compact"><ClipboardList size={30}/><p>請先選商品數量</p></div>}<div className="total-line"><span>合計</span><strong>{totalUnits}</strong></div><label className="field">攤位／店名 <span>必填</span><Input maxLength={60} value={stall} disabled={busy} onChange={e=>setStall(e.target.value)} placeholder={demo?'測試請用假名':'攤位或店名'}/></label>{demo&&<p className="privacy-hint">測試請勿填真實個資。</p>}<label className="field">備註 <span>選填</span><textarea maxLength={300} value={notes} disabled={busy} onChange={e=>setNotes(e.target.value)} rows={2} placeholder="有需要再填"/></label><Button className="action primary-action" disabled={loading||!selected.length||busy||missing} onClick={()=>{setError('');if(!stall.trim()){setError('請先填寫攤位／店名');return;}setReview(true);}}>下一步：確認<ArrowRight size={17}/></Button><p className="small-hint">送出後可下載 PDF。</p></aside></div><div className="mobile-order-bar"><div aria-live="polite"><b>已選 {selected.length} 項</b></div><Button disabled={!selected.length} onClick={()=>document.querySelector('.order-summary')?.scrollIntoView({behavior:'smooth',block:'start'})}>看訂購單<ArrowRight size={16}/></Button></div></main>{review&&<dialog ref={dialog} onCancel={e=>{if(busy)e.preventDefault();else setReview(false);}} aria-labelledby="confirm-title" className="confirm-modal"><div className="eyebrow">最後確認</div><h2 id="confirm-title">{demo?'送出測試訂單':'確認送出訂單'}？</h2><p>{stall} · 共 {selected.length} 項商品</p><div className="confirm-items">{selected.map(p=><div key={p.id}><span>{p.name}<small>{p.specification}</small></span><b>{quantities[p.id]} {p.unit}</b></div>)}</div><ErrorMessage error={error}/>{demo&&<p className="small-hint">測試訂單，不會實際採購。</p>}<div className="modal-actions"><Button variant="outline" disabled={busy} onClick={()=>setReview(false)}>返回修改</Button><Button disabled={busy} onClick={submit}>{busy?'儲存中…':'送出訂單'}<Check size={17}/></Button></div></dialog>}</>;
}

function Receipt({ id }: {id:string}) {
  const [order,setOrder]=useState<Order|null>(null),[error,setError]=useState(''),[pdfBusy,setPdfBusy]=useState(false);
  useEffect(()=>{api<{order:Order}>(`orders/${encodeURIComponent(id)}`).then(x=>setOrder(x.order)).catch(e=>setError(e.message));},[id]);
  async function download(){if(!order)return;setPdfBusy(true);setError('');try{await (await import('./pdf')).downloadOrderPdf(order);}catch(e){setError(e instanceof Error?e.message:'PDF 產生失敗，請使用列印功能');}finally{setPdfBusy(false);}}
  return <><div className="no-print"><Header active="order"/></div><main className="receipt-page"><div className="success-heading no-print"><CheckCircle2 size={37}/><h1>{order?(order.demo?'測試訂單已儲存':'訂單已儲存'):'訂購單'}</h1><p>{order?'已加入統計。':'讀取中…'}</p></div><ErrorMessage error={error}/>{order&&<><div className="receipt-actions no-print"><Button onClick={download} disabled={pdfBusy}><Download size={18}/>{pdfBusy?'正在產生 PDF…':'下載 PDF'}</Button><Button variant="outline" onClick={()=>window.print()}><Printer size={18}/>列印</Button></div><article className="receipt-sheet"><div className="receipt-top"><Fish size={28}/><div><h2>東門市場・食材訂購單</h2><p>{order.demo?'測試訂單，非正式採購':'商品與數量'}</p></div></div><dl className="receipt-meta"><div><dt>訂單編號</dt><dd>{order.number}</dd></div><div><dt>訂購時間</dt><dd>{new Date(order.createdAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false})}</dd></div><div><dt>攤位／店名</dt><dd>{order.stall}</dd></div></dl><Table><TableHeader><TableRow><TableHead>商品名稱</TableHead><TableHead>規格</TableHead><TableHead className="numeric">數量</TableHead></TableRow></TableHeader><TableBody>{order.items.map((item,index)=><TableRow key={index}><TableCell className="product-name">{item.productName}</TableCell><TableCell>{item.specification}</TableCell><TableCell className="numeric strong">{item.quantity} {item.unit}</TableCell></TableRow>)}</TableBody></Table><div className="receipt-total"><span>共 {order.items.length} 項商品</span><strong>{formatUnits(unitTotals(order.items))}</strong></div>{order.notes&&<p className="receipt-notes">備註：{order.notes}</p>}<div className="receipt-footnote">{order.demo?'測試訂單，不會實際採購。':'請核對商品與數量。'}</div></article><div className="receipt-links no-print"><a href="/order">繼續下單<ArrowRight size={15}/></a><a href="/stats">看統計<Table2 size={16}/></a></div><p className="small-hint no-print">請下載 PDF 留存。此單限本瀏覽器查看。</p></>}</main></>;
}

function StatsPage() {
  const [from,setFrom]=useState(taipeiDay()),[to,setTo]=useState(taipeiDay()),[data,setData]=useState<Summary|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(true),[reload,setReload]=useState(0),[query,setQuery]=useState('');
  useEffect(()=>{const controller=new AbortController();setBusy(true);setError('');api<Summary>(`stats?${new URLSearchParams({from,to})}`,{signal:controller.signal}).then(setData).catch(e=>{if(e.name!=='AbortError')setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setBusy(false);});return()=>controller.abort();},[from,to,reload]);
  useEffect(()=>{const timer=setInterval(()=>{if(document.visibilityState==='visible')setReload(x=>x+1);},30000);const refresh=()=>{if(document.visibilityState==='visible')setReload(x=>x+1);};document.addEventListener('visibilitychange',refresh);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};},[]);
  useEffect(()=>{const showAll=()=>flushSync(()=>setQuery(""));window.addEventListener("beforeprint",showAll);return()=>window.removeEventListener("beforeprint",showAll);},[]);
  const rows=useMemo(()=>data?.rows.filter(row=>`${row.productName} ${row.specification} ${row.sku}`.toLowerCase().includes(query.toLowerCase().trim()))||[],[data,query]);
  return <><div className="no-print"><Header active="stats"/></div><main className="workspace stats-page"><div className="page-heading"><div><h1>統計</h1><p>每項商品，共訂多少</p></div><Button className="no-print" variant="outline" onClick={()=>{flushSync(()=>setQuery(""));window.print();}} disabled={!data||busy||!!error}><Printer size={17}/>列印總表</Button></div>{data?.demo&&<div className="no-print"><DemoNotice/></div>}<section className="stats-filter no-print"><div className="date-range"><label>從<Input type="date" value={from} onChange={e=>setFrom(e.target.value)} aria-label="開始日期"/></label><label>至<Input type="date" value={to} onChange={e=>setTo(e.target.value)} aria-label="結束日期"/></label></div><div className="range-shortcuts"><Button variant="outline" onClick={()=>{setFrom(taipeiDay());setTo(taipeiDay());}}>今天</Button><Button variant="outline" onClick={()=>{setFrom('');setTo('');}}>全部</Button><Button variant="outline" onClick={()=>setReload(x=>x+1)} disabled={busy}><RefreshCw size={16} className={busy?'spinning':''}/>更新</Button></div></section><div className="print-only">統計期間：{from||'不限'} 至 {to||'不限'}</div><ErrorMessage error={error}/>{!error&&<><div className={`stats-cards ${busy?'refreshing':''}`}><div><span>收到訂單</span><strong>{data?.orderCount??'—'}<small> 張</small></strong></div><div><span>商品種類</span><strong>{data?.productCount??'—'}<small> 項</small></strong></div><div className="units-card"><span>總數量</span><strong>{data?formatUnits(data.units):'—'}</strong></div></div><section className="stats-table"><div className="table-toolbar"><div><h2>商品總數量</h2><p>{from||'不限日期'}{to&&` — ${to}`} {data?.demo?'・示範訂單':''}</p></div><label className="search-box no-print"><Search size={17}/><Input aria-label="搜尋統計商品" placeholder="找商品" value={query} onChange={e=>setQuery(e.target.value)}/></label></div><ul className="stats-mobile-list" aria-label="商品總數量">{rows.map(row=><li key={`${row.productId}-${row.specification}-${row.unit}`}><div><strong>{row.productName}</strong><span>{row.specification}</span></div><p><b>{row.quantity.toLocaleString()}</b><span>{row.unit}</span></p></li>)}</ul><div className="stats-desktop-table"><Table><TableHeader><TableRow><TableHead>#</TableHead><TableHead>商品名稱</TableHead><TableHead>規格</TableHead><TableHead className="numeric">總數量</TableHead><TableHead>單位</TableHead><TableHead className="numeric">訂單數</TableHead></TableRow></TableHeader><TableBody>{rows.map((row,index)=><TableRow key={`${row.productId}-${row.specification}-${row.unit}`}><TableCell className="row-number">{String(index+1).padStart(2,'0')}</TableCell><TableCell className="product-name">{row.productName}</TableCell><TableCell>{row.specification}</TableCell><TableCell className="numeric quantity-cell">{row.quantity.toLocaleString()}</TableCell><TableCell>{row.unit}</TableCell><TableCell className="numeric">{row.orderCount}</TableCell></TableRow>)}</TableBody></Table></div>{!rows.length&&<div className="empty">{busy?'正在讀取統計…':query?'找不到符合的商品。':'目前沒有訂單。'}{!busy&&!query&&<a href="/order">前往下單<ArrowRight size={15}/></a>}</div>}<div className="table-note"><span>不同規格分開計算。</span><span>{data?`更新於 ${new Date(data.updatedAt).toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour12:false})}`:''}</span></div></section></>}<p className="small-hint no-print">每 30 秒自動更新。</p></main></>;
}
export default function Portal(){ const path=window.location.pathname; if(path==='/order'||path==='/quick-order')return <OrderPage/>;if(path==='/stats')return <StatsPage/>;if(path.startsWith('/receipt/'))return <Receipt id={path.split('/')[2]}/>;if(path!=='/')return <><Header active=""/><main className="home"><h1>找不到這個頁面</h1><a href="/">回到首頁</a></main></>;return <Home/>; }

