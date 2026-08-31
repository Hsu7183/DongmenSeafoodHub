"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, createContext, useContext } from "react";
import { useRouter } from "next/navigation";
import { Anchor, ArrowDownToLine, ArrowLeft, ArrowRight, BadgeCheck, Boxes, CalendarDays, CheckCircle2, ChevronRight, ClipboardList, Fish, Heart, LayoutDashboard, ListFilter, LockKeyhole, LogIn, LogOut, Menu, Minus, Package, Plus, ReceiptText, Search, Settings, ShieldCheck, ShoppingBag, Snowflake, Store, Truck, Users, Waves, X, Zap } from "lucide-react";
import { api, date, money, statuses, type User, type Product, type Variant, type Order } from "@/lib/client";
import AdminWorkspace from "@/components/admin/AdminWorkspace";
import SupplierWorkspace from "@/components/admin/SupplierWorkspace";

type Cart = Record<string, number>;
type AppState = { user: User | null; demoMode: boolean; cart: Cart; setQuantity: (id: string, quantity: number) => void; replaceCart: (cart: Cart) => void; notify: (message: string, error?: boolean) => void; refreshSession: () => Promise<void> };
const Context = createContext<AppState>({ user: null, demoMode: false, cart: {}, setQuantity: () => {}, replaceCart: () => {}, notify: () => {}, refreshSession: async () => {} });
const useApp = () => useContext(Context);

function useData<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    if (!url) { setLoading(false); return; }
    setLoading(true); setError("");
    try { setData(await api<T>(url)); } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [url]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { data, error, loading, refresh };
}

function Empty({ text, children }: { text: string; children?: React.ReactNode }) {
  return <div className="empty-state"><Package size={32} strokeWidth={1.4} /><h3>{text}</h3>{children}</div>;
}
function ErrorBox({ message }: { message: string }) { return message ? <div role="alert" className="error-message">{message}</div> : null; }
function Loading() { return <div className="loading-state"><span className="spinner" />正在載入採購資料…</div>; }
function Badge({ status }: { status: string }) { return <span className={`badge status-${status.toLowerCase()}`}>{statuses[status] || status}</span>; }
function ProductArt({ product, small = false }: { product: Product; small?: boolean }) {
  const Icon = product.category?.name === "蝦類" ? Waves : Fish;
  return <div className={`product-art ${small ? "small" : ""} tint-${product.name.length % 4}`}>
    {product.imageAuthorized && product.imageUrl && product.imageSource !== "PLACEHOLDER"
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={product.imageUrl} alt={product.name} />
      : <><Icon size={small ? 28 : 66} strokeWidth={1.15} /><span>商品圖片待授權</span></>}
  </div>;
}

const customerNav = [
  { href: "/", icon: LayoutDashboard, name: "採購首頁" },
  { href: "/quick-order", icon: Zap, name: "快速訂貨", badge: "快速" },
  { href: "/products", icon: Fish, name: "商品目錄" },
  { href: "/favorites", icon: Heart, name: "常購與收藏" },
  { href: "/orders", icon: ClipboardList, name: "我的訂單" },
];
const adminNav = [
  { href: "/admin", icon: LayoutDashboard, name: "營運總覽" },
  { href: "/admin/orders", icon: ClipboardList, name: "客戶訂單" },
  { href: "/admin/purchase-orders", icon: Boxes, name: "彙總採購" },
  { href: "/admin/customers", icon: Users, name: "客戶管理" },
  { href: "/admin/suppliers", icon: Truck, name: "供應商管理" },
  { href: "/admin/products", icon: Fish, name: "商品與規格" },
  { href: "/admin/categories", icon: ListFilter, name: "商品分類" },
  { href: "/admin/prices", icon: ReceiptText, name: "價格與階梯" },
  { href: "/admin/import-products", icon: ArrowDownToLine, name: "商品匯入" },
  { href: "/admin/finance", icon: ShoppingBag, name: "帳款與佣金" },
  { href: "/admin/quotations", icon: ReceiptText, name: "報價單" },
  { href: "/admin/audit", icon: ShieldCheck, name: "稽核紀錄" },
  { href: "/admin/settings", icon: Settings, name: "平台設定" },
];

export default function ClientApp({ path }: { path: string[] }) {
  const route = "/" + path.join("/");
  const [user, setUser] = useState<User | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [cart, setCart] = useState<Cart>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);
  const router = useRouter();
  const refreshSession = useCallback(async () => {
    try { const result = await api<{ user: User | null; demoMode: boolean }>("/api/session"); setUser(result.user); setDemoMode(result.demoMode); }
    finally { setSessionReady(true); }
  }, []);
  useEffect(() => { void refreshSession().catch(() => {}); }, [refreshSession]);
  useEffect(() => {
    try { setCart(user?.role === "CUSTOMER" ? JSON.parse(localStorage.getItem(`dongmen-procurement-${user.id}`) || "{}") : {}); }
    catch { setCart({}); }
  }, [user?.id, user?.role]);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(null), 5000); return () => clearTimeout(timer); } }, [toast]);
  const replaceCart = useCallback((value: Cart) => {
    setCart(value);
    if (user) localStorage.setItem(`dongmen-procurement-${user.id}`, JSON.stringify(value));
  }, [user]);
  const setQuantity = useCallback((id: string, qty: number) => {
    const next = { ...cart };
    const quantity = Number.isFinite(qty) ? Math.max(0, Math.min(99999, Math.trunc(qty))) : 0;
    if (quantity) next[id] = quantity; else delete next[id];
    replaceCart(next);
  }, [cart, replaceCart]);
  const notify = useCallback((message: string, error = false) => setToast({ message, error }), []);
  const isAdmin = user?.role === "SUPER_ADMIN" || user?.role === "SALES";
  const isAdminRoute = path[0] === "admin";
  const isSupplierRoute = path[0] === "supplier";
  const isPrint = path[0] === "print";
  const isLegal = ["terms", "privacy", "business-info", "food-information"].includes(path[0]);
  const needsCustomer = ["quick-order", "favorites", "procurement", "orders"].includes(path[0]);
  let content: React.ReactNode;
  if (path[0] === "login") content = <Login />;
  else if (!sessionReady) content = <Loading />;
  else if (isPrint) content = <PrintPage kind={path[1]} id={path[2]} />;
  else if (isAdminRoute) content = isAdmin ? <AdminWorkspace section={path[1] || "dashboard"} /> : <AccessGate />;
  else if (isSupplierRoute) content = user?.role === "SUPPLIER" ? <SupplierWorkspace /> : <AccessGate />;
  else if (isLegal) content = <LegalPage section={path[0]} />;
  else if (needsCustomer && user?.role !== "CUSTOMER") content = <AccessGate customer />;
  else if (path[0] === "quick-order") content = <Catalog quick />;
  else if (path[0] === "favorites") content = <Catalog favoritesOnly />;
  else if (path[0] === "procurement") content = <Procurement />;
  else if (path[0] === "orders") content = path[1] ? <OrderDetail id={path[1]} /> : <Orders />;
  else if (path[0] === "products" && path[1]) content = <ProductDetail id={path[1]} />;
  else if (!path.length || path[0] === "products") content = <Catalog home={!path.length} />;
  else content = <Empty text="找不到這個頁面"><Link className="button button-primary" href="/">回到採購首頁</Link></Empty>;
  const nav = isAdminRoute && isAdmin ? adminNav.filter(item => user?.role === "SUPER_ADMIN" || !["/admin/settings", "/admin/audit", "/admin/import-products"].includes(item.href)) : isSupplierRoute ? [{ href: "/supplier", icon: Boxes, name: "供貨工作台" }] : customerNav;
  const roleName = { SUPER_ADMIN: "平台管理員", SALES: "業務人員", CUSTOMER: "採購會員", SUPPLIER: "供應商" };
  return <Context.Provider value={{ user, demoMode, cart, setQuantity, replaceCart, notify, refreshSession }}>
    {isPrint ? content : <div className="app-layout">
      {menuOpen && <button className="sidebar-overlay" aria-label="關閉導覽" onClick={() => setMenuOpen(false)} />}
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <Link className="brand" href="/"><span className="brand-mark"><Fish size={29} /></span><span><b>東門採購<span className="brand-dot">.</span></b><small>DONGMEN SEAFOOD HUB</small></span></Link>
        <div className="workspace-label">{isAdminRoute ? "營運管理工作台" : isSupplierRoute ? "供應商工作台" : "市場採購工作台"}</div>
        <nav className="main-nav" aria-label="主要導覽">{nav.map(({ href, icon: Icon, name, ...rest }) => <Link onClick={() => setMenuOpen(false)} key={href} href={href} className={route === href || (href === "/orders" && path[0] === "orders") ? "active" : ""}><Icon size={19} /><span>{name}</span>{"badge" in rest && <em>{String(rest.badge)}</em>}</Link>)}</nav>
        {!isAdminRoute && <div className="sidebar-note"><div className="sidebar-note-icon"><Anchor size={23} /></div><b>讓採購簡單一點</b><p>彙整市場需求，集中向上游訂貨。<br />每一份採購，都更有力量。</p><span><span className="live-dot" />零庫存 · 供應商出貨</span></div>}
        <div className="sidebar-bottom">
          {isAdmin && !isAdminRoute && <Link className="workspace-switch" href="/admin"><Settings size={16} />進入營運後台<ArrowRight size={15} /></Link>}
          {user?.role === "SUPPLIER" && !isSupplierRoute && <Link className="workspace-switch" href="/supplier"><Boxes size={16} />供應商工作台<ArrowRight size={15} /></Link>}
          {(isAdminRoute || isSupplierRoute) && <Link className="workspace-switch" href="/"><Store size={16} />查看商品目錄<ArrowRight size={15} /></Link>}
          <div className="account"><span className="avatar">{user?.name?.slice(0, 1) || "訪"}</span><div><b>{user?.name || "歡迎來到東門市場"}</b><small>{user ? roleName[user.role] : "登入查看專屬採購價"}</small></div>{user ? <button className="icon-button" aria-label="登出" onClick={async () => { try { await api("/api/auth/logout", {}); setUser(null); replaceCart({}); router.push("/"); } catch (e) { notify((e as Error).message, true); } }}><LogOut size={17} /></button> : <Link className="icon-button" aria-label="會員登入" href="/login"><LogIn size={18} /></Link>}</div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" aria-label="開啟導覽" onClick={() => setMenuOpen(true)}><Menu size={23} /></button><Store size={17} /><span>東門市場</span><span className="topbar-divider" /><span className="topbar-context">B2B 食材採購平台</span></div><div className="topbar-actions">{demoMode && <span className="demo-pill">DEMO 測試環境</span>}{user?.role === "CUSTOMER" ? <Link className="topbar-order" href="/procurement"><ShoppingBag size={18} /><span>採購單</span><b>{Object.keys(cart).length}</b></Link> : !user ? <Link className="button button-primary small-button" href="/login">會員登入<ArrowRight size={14} /></Link> : <span className="role-pill"><ShieldCheck size={15} />{roleName[user.role]}</span>}</div></header>
        <main id="main-content" className="main-content">{content}</main>
        <footer className="footer"><span>© 2026 東門採購 · Dongmen Seafood Hub</span><div><Link href="/terms">交易條款</Link><Link href="/privacy">隱私權政策</Link><Link href="/business-info">營業資訊</Link><Link href="/food-information">食品資訊</Link></div><small>{demoMode ? "僅供測試，非正式報價或交易承諾。" : "所有金額為新台幣，採購條件依確認訂單為準。"}</small></footer>
      </div>
      {user?.role === "CUSTOMER" && !["procurement", "orders", "login"].includes(path[0]) && <ProcurementBar />}
    </div>}
    {toast && <div role="status" className={`toast ${toast.error ? "error" : ""}`}>{toast.error ? <X size={19} /> : <CheckCircle2 size={19} />}{toast.message}<button aria-label="關閉通知" onClick={() => setToast(null)}><X size={15} /></button></div>}
  </Context.Provider>;
}

function AccessGate({ customer }: { customer?: boolean }) {
  const { user } = useApp();
  return <div className="access-gate"><span className="gate-icon"><LockKeyhole size={32} /></span><div className="eyebrow">MEMBERS ONLY</div><h1>{!user ? "您的採購，專屬的價格。" : "此帳號沒有這個頁面的權限"}</h1><p>{!user ? "登入您的 B2B 帳號，即可查看成交價、快速叫貨與追蹤訂單。" : customer ? "請使用客戶帳號進行採購。管理員與供應商請至各自的工作台。" : "不同角色的資料與權限已分開保護。"}</p><Link className="button button-primary" href={user?.role === "SUPPLIER" ? "/supplier" : user?.role === "SUPER_ADMIN" || user?.role === "SALES" ? "/admin" : "/login"}>{user ? "前往我的工作台" : "登入會員"}<ArrowRight size={17} /></Link><Link href="/products" className="text-link">先逛逛商品目錄</Link></div>;
}

function Login() {
  const { refreshSession } = useApp();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const demo = useData<{ demoMode?: boolean; user: User | null }>("/api/session");
  const login = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      await api("/api/auth/login", { email, password });
      const session = await api<{ user: User }>("/api/session");
      await refreshSession();
      router.push(session.user.role === "CUSTOMER" ? "/quick-order" : session.user.role === "SUPPLIER" ? "/supplier" : "/admin");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <div className="login-layout"><section className="login-story"><span className="eyebrow">MADE FOR THE MARKET</span><h1>生意的每一天，<br />從好食材開始<span>。</span></h1><p>為東門市場而生的採購工作台。<br />常用的食材、熟悉的供應商，<br />一次訂好，安心開市。</p><div className="login-benefits"><span><Zap size={20} />快速叫貨</span><span><BadgeCheck size={20} />專屬報價</span><span><Truck size={20} />供應商出貨</span></div><div className="login-story-bottom"><Waves size={42} strokeWidth={1.4} /><span>一起採購，讓每份生意更有底氣。</span></div></section><section className="login-form card"><span className="eyebrow">WELCOME BACK</span><h2>登入採購工作台</h2><p className="muted">歡迎回來，今天需要哪些食材？</p><form onSubmit={login}><label className="field">帳號 Email<input autoComplete="username" type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="your@email.com" /></label><label className="field">密碼<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="請輸入密碼" /></label><ErrorBox message={error} /><button className="button button-primary full-width" disabled={busy}>{busy ? "登入中…" : "登入工作台"}<ArrowRight size={18} /></button></form>{demo.data?.demoMode === true && <div className="demo-accounts"><b>體驗測試帳號</b><p>以下僅供本機展示，所有價格均為虛構測試值。</p><div>{[{ text: "客戶", email: "customer@dongmen.test" }, { text: "管理員", email: "admin@dongmen.test" }, { text: "供應商", email: "supplier@dongmen.test" }, { text: "業務", email: "sales@dongmen.test" }].map(a => <button key={a.email} type="button" onClick={() => { setEmail(a.email); setPassword("DemoOnly!2026"); }}>{a.text}</button>)}</div><small>選擇角色會填入帳密，再按登入即可。</small></div>}<div className="login-security"><ShieldCheck size={16} />您的成交價僅對您的帳號公開</div></section></div>;
}

function Quantity({ variant, compact = false }: { variant: Variant; compact?: boolean }) {
  const { cart, setQuantity } = useApp();
  const quantity = cart[variant.id] || 0;
  const add = (n: number) => setQuantity(variant.id, quantity ? quantity + n : Math.max(n, variant.moq));
  return <div className={`quantity-block ${compact ? "compact" : ""}`}><div className="quantity-input"><button type="button" aria-label={`${variant.sku} 減少數量`} disabled={!quantity} onClick={() => setQuantity(variant.id, quantity - 1)}><Minus size={15} /></button><input aria-label={`${variant.sku} 數量`} type="number" min="0" max="99999" value={quantity} onChange={e => setQuantity(variant.id, Number(e.target.value))} /><button type="button" aria-label={`${variant.sku} 增加數量`} onClick={() => add(1)}><Plus size={15} /></button></div>{!compact && <div className="quantity-fast">{[1, 5, 10].map(n => <button type="button" key={n} onClick={() => add(n)}>+{n}</button>)}</div>}</div>;
}

function Catalog({ quick = false, home = false, favoritesOnly = false }: { quick?: boolean; home?: boolean; favoritesOnly?: boolean }) {
  const { user, notify, replaceCart, cart } = useApp();
  const data = useData<{ products: Product[]; categories: { id: string; name: string }[]; suppliers: { id: string; name: string }[] }>("/api/products");
  const favorites = useData<any>(user?.role === "CUSTOMER" ? "/api/favorites" : null);
  const frequent = useData<{ variantIds: string[] }>(user?.role === "CUSTOMER" ? "/api/frequent" : null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [supplier, setSupplier] = useState("");
  const [origin, setOrigin] = useState("");
  const [brand, setBrand] = useState("");
  const [temperature, setTemperature] = useState("");
  const [available, setAvailable] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [listMode, setListMode] = useState("all");
  const [repeatBusy, setRepeatBusy] = useState(false);
  const favoriteIds: string[] = favorites.data?.variantIds || favorites.data?.favorites?.map((f: any) => f.variantId || f.productVariantId || f.id) || [];
  const products = data.data?.products || [];
  const toggleFavorite = async (id: string) => { try { await api("/api/favorites", { variantId: id }); await favorites.refresh(); } catch (e) { notify((e as Error).message, true); } };
  const repeat = async (yesterday: boolean) => {
    setRepeatBusy(true);
    try {
      const { orders } = await api<{ orders: Order[] }>("/api/orders");
      const previousDate = new Date(); previousDate.setDate(previousDate.getDate() - 1);
      const order = orders.find(o => o.status !== "CANCELLED" && (!yesterday || date(o.createdAt) === date(previousDate.toISOString())));
      if (!order) throw new Error(yesterday ? "昨天尚無採購紀錄，可改用「上次一樣」。" : "目前還沒有採購紀錄，先建立第一張採購單吧。");
      const result = await api<{ items: { variantId: string; quantity: number }[] }>(`/api/orders/${order.id}/reorder`, {});
      replaceCart(Object.fromEntries(result.items.map(i => [i.variantId, i.quantity])));
      notify("已載入上次的品項與數量；請確認目前價格及供貨狀態。");
    } catch (e) { notify((e as Error).message, true); } finally { setRepeatBusy(false); }
  };
  const filtered = products.filter(p => {
    const match = `${p.name} ${p.brand} ${p.origin} ${p.variants.map(v => `${v.sku} ${v.specification}`).join(" ")}`.toLowerCase().includes(search.toLowerCase());
    return match && (!category || p.category?.id === category) && (!supplier || p.supplier?.id === supplier) && (!origin || p.origin === origin) && (!brand || p.brand === brand) && (!temperature || p.storageMethod?.includes(temperature)) && (!available || (available === "yes" ? p.available : !p.available)) && (!(favoritesOnly || listMode === "favorites") || p.variants.some(v => favoriteIds.includes(v.id))) && (listMode !== "frequent" || p.variants.some(v => frequent.data?.variantIds?.includes(v.id)));
  });
  const member = user?.role === "CUSTOMER";
  return <div className="catalog-page">
    <div className="page-heading"><div><div className="eyebrow">{quick ? "QUICK ORDER" : favoritesOnly ? "YOUR FAVORITES" : "YOUR DAILY PROCUREMENT"}</div><h1>{quick ? "快速訂貨" : favoritesOnly ? "常購與收藏" : home ? "好食材，今天一起採購。" : "水產・食材目錄"}</h1><p>{quick ? "找到食材、填入數量，一張採購單就搞定。" : favoritesOnly ? "熟悉的食材，留在最順手的位置。" : "東門市場 B2B 食材採購 · 彙整需求，供應商直接出貨。"}</p></div><div className="heading-actions">{member ? <><button disabled={repeatBusy} className="button button-secondary" onClick={() => repeat(false)}><ClipboardList size={16} />上次一樣</button><button disabled={repeatBusy} className="button button-primary" onClick={() => repeat(true)}><Zap size={16} />昨天一樣</button></> : <span className="heading-date"><CalendarDays size={17} />{date(new Date().toISOString())}</span>}</div></div>
    {home && <div className="market-summary"><div><span className="summary-icon"><Fish size={22} /></span><div><small>精選採購食材</small><b>{products.length}<em>款商品</em></b></div></div><div><span className="summary-icon"><Truck size={22} /></span><div><small>供應商直供</small><b>零庫存<em>集中訂貨</em></b></div></div><div><span className="summary-icon"><ShieldCheck size={22} /></span><div><small>價格分級保護</small><b>專屬報價<em>僅本人可見</em></b></div></div><Link href={member ? "/quick-order" : "/login"}><span><b>10 秒完成日常叫貨</b><small>{member ? "進入快速訂貨工作台" : "登入後，開始您的第一張採購單"}</small></span><ArrowRight size={21} /></Link></div>}
    <div className="catalog-toolbar"><label className="search-box"><Search size={20} /><input aria-label="搜尋商品" placeholder="搜尋商品、魚種、品牌或規格…" value={search} onChange={e => setSearch(e.target.value)} /><kbd>搜尋</kbd></label><button className={`button button-secondary filter-button ${showFilters ? "selected" : ""}`} onClick={() => setShowFilters(v => !v)}><ListFilter size={18} />篩選條件{[supplier, origin, brand, temperature, available].filter(Boolean).length > 0 && <b>{[supplier, origin, brand, temperature, available].filter(Boolean).length}</b>}</button></div>
    {showFilters && <div className="filter-panel card">{[{ label: "供應商", value: supplier, set: setSupplier, options: (data.data?.suppliers || []).map(s => ({ value: s.id, label: s.name })) }, { label: "品牌", value: brand, set: setBrand, options: [...new Set(products.map(p => p.brand))].map(v => ({ value: v, label: v })) }, { label: "產地", value: origin, set: setOrigin, options: [...new Set(products.map(p => p.origin))].map(v => ({ value: v, label: v })) }, { label: "保存方式", value: temperature, set: setTemperature, options: [{ value: "冷凍", label: "冷凍" }, { value: "冷藏", label: "冷藏" }] }, { label: "供貨狀態", value: available, set: setAvailable, options: [{ value: "yes", label: "可供貨" }, { value: "no", label: "暫停供貨" }] }].map(f => <label className="field" key={f.label}>{f.label}<select value={f.value} onChange={e => f.set(e.target.value)}><option value="">全部</option>{f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>)}<button className="text-link" onClick={() => { setSupplier(""); setOrigin(""); setBrand(""); setTemperature(""); setAvailable(""); setCategory(""); setSearch(""); }}>清除篩選</button></div>}
    <div className="category-tabs" aria-label="商品分類"><button className={!category ? "active" : ""} onClick={() => setCategory("")}><Boxes size={16} />全部食材<span>{products.length}</span></button>{data.data?.categories.map(c => <button key={c.id} className={category === c.id ? "active" : ""} onClick={() => setCategory(c.id)}>{c.name}</button>)}</div>
    <div className="results-heading"><div><h2>{favoritesOnly ? "您的收藏清單" : category ? data.data?.categories.find(c => c.id === category)?.name : "全部食材"}</h2><span>{filtered.length} 款商品</span></div>{member && !favoritesOnly ? <div className="segmented">{[{ v: "all", t: "全部" }, { v: "frequent", t: "常購商品" }, { v: "favorites", t: "收藏" }].map(t => <button key={t.v} className={listMode === t.v ? "active" : ""} onClick={() => setListMode(t.v)}>{t.t}</button>)}</div> : <span className="quiet-note"><Snowflake size={14} />依供應商實際供貨狀態</span>}</div>
    <ErrorBox message={data.error} />
    {data.loading ? <Loading /> : !filtered.length ? <Empty text="目前沒有符合條件的商品"><p>調整搜尋或篩選條件，或先把常用食材加入收藏。</p></Empty> : quick ? <div className="card table-wrap quick-table-wrap"><table className="data-table quick-table"><thead><tr><th>商品 / 規格</th><th>單位</th><th>專屬單價</th><th>訂購數量</th><th>小計</th><th><Heart size={15} /></th></tr></thead><tbody>{filtered.flatMap(p => p.variants.map(v => <tr key={v.id} className={cart[v.id] ? "has-quantity" : ""}><td><div className="table-product"><ProductArt product={p} small /><div><Link href={`/products/${p.id}`}><b>{p.name}</b></Link><span>{v.specification} <i>·</i> {v.sku}</span><small>{!p.available ? "暫停供貨" : `最低訂購 ${v.moq} ${v.packageUnit}`}</small></div></div></td><td>{v.packageUnit}<small className="cell-small">每箱 {v.caseQuantity} 入</small></td><td className="price-cell">{v.customerPrice === undefined ? "待報價" : money(v.customerPrice)}</td><td>{p.available && v.customerPrice !== undefined ? <Quantity variant={v} /> : <span className="muted">暫無法訂購</span>}</td><td className="subtotal">{cart[v.id] && v.customerPrice !== undefined ? money(cart[v.id] * v.customerPrice) : "—"}</td><td><button className={`icon-button favorite-button ${favoriteIds.includes(v.id) ? "is-favorite" : ""}`} aria-label={`${favoriteIds.includes(v.id) ? "取消收藏" : "收藏"} ${v.sku}`} onClick={() => toggleFavorite(v.id)}><Heart size={18} fill={favoriteIds.includes(v.id) ? "currentColor" : "none"} /></button></td></tr>))}</tbody></table></div> : <div className="product-grid">{filtered.map(p => <ProductCard key={p.id} product={p} favorite={favoriteIds.includes(p.variants[0]?.id)} onFavorite={() => toggleFavorite(p.variants[0].id)} />)}</div>}
    <div className="catalog-disclaimer"><ShieldCheck size={16} /><span>展示品項與價格皆為測試資料。未使用未授權供應商圖片，正式採購請以確認訂單為準。</span></div>
  </div>;
}

function ProductCard({ product: p, favorite, onFavorite }: { product: Product; favorite: boolean; onFavorite: () => void }) {
  const { user, cart, setQuantity, notify } = useApp();
  const [variantId, setVariantId] = useState(p.variants[0]?.id);
  const v = p.variants.find(v => v.id === variantId) || p.variants[0];
  const member = user?.role === "CUSTOMER";
  return <article className="product-card"><div className="product-image-wrap"><Link href={`/products/${p.id}`}><ProductArt product={p} /></Link><span className={`availability ${p.available ? "" : "unavailable"}`}><span />{p.available ? "可供貨" : "暫停供貨"}</span>{member && <button className={`card-favorite ${favorite ? "is-favorite" : ""}`} aria-label={`收藏 ${p.name}`} onClick={onFavorite}><Heart size={18} fill={favorite ? "currentColor" : "none"} /></button>}<span className="product-category">{p.category?.name}</span></div><div className="product-card-body"><div className="product-origin">{p.origin} <span>·</span> {p.brand || "示範商品"}</div><Link href={`/products/${p.id}`}><h3>{p.name}</h3></Link>{v && <><label className="variant-select"><select aria-label={`${p.name} 規格`} value={v.id} onChange={e => setVariantId(e.target.value)}>{p.variants.map(v => <option key={v.id} value={v.id}>{v.specification} / {v.packageUnit}</option>)}</select></label><div className="product-meta"><span><Snowflake size={13} />{p.storageMethod || "冷凍保存"}</span><span>每箱 {v.caseQuantity} 入</span></div><div className="product-card-bottom">{member ? <><div><small>您的採購價 / {v.packageUnit}</small><strong>{v.customerPrice === undefined ? "待報價" : money(v.customerPrice)}</strong></div><button aria-label={`加入採購單 ${p.name}`} className="add-product" disabled={!p.available || v.customerPrice === undefined} onClick={() => { setQuantity(v.id, (cart[v.id] || 0) + v.moq); notify(`${p.name} 已加入採購單`); }}><Plus size={21} /></button></> : <Link href="/login" className="locked-price"><LockKeyhole size={15} />登入查看專屬採購價<ArrowRight size={15} /></Link>}</div></>}</div></article>;
}

function ProcurementBar() {
  const { cart } = useApp();
  const units = Object.values(cart).reduce((a, b) => a + b, 0);
  if (!units) return null;
  return <div className="procurement-bar"><div><span className="procurement-bar-icon"><ShoppingBag size={21} /></span><div><b>已選 {Object.keys(cart).length} 項食材</b><small>共 {units} 個訂購單位 · 數量已儲存在此裝置</small></div></div><Link href="/procurement" className="button button-primary">查看採購單<ArrowRight size={17} /></Link></div>;
}

function ProductDetail({ id }: { id: string }) {
  const data = useData<{ products: Product[] }>("/api/products");
  const { user } = useApp();
  if (data.loading) return <Loading />;
  const p = data.data?.products.find(p => p.id === id);
  if (!p) return <Empty text={data.error || "查無商品或商品已下架"} />;
  return <><Link className="back-link" href="/products"><ArrowLeft size={16} />商品目錄</Link><div className="product-detail card"><ProductArt product={p} /><div><span className="eyebrow">{p.category?.name} / {p.origin}</span><h1>{p.name}</h1><p className="muted">{p.description}</p><dl className="detail-facts"><div><dt>品牌</dt><dd>{p.brand}</dd></div><div><dt>供應商</dt><dd>{p.supplier?.name}</dd></div><div><dt>保存方式</dt><dd>{p.storageMethod} {p.temperature}</dd></div><div><dt>供貨狀態</dt><dd>{p.available ? "可供貨（依供應商確認）" : "暫停供貨"}</dd></div></dl><h3>選擇規格與訂購數量</h3>{p.variants.map(v => <div key={v.id} className="detail-variant"><div><b>{v.specification}</b><small>{v.sku} · 每箱 {v.caseQuantity} 入 · MOQ {v.moq}</small></div>{user?.role === "CUSTOMER" ? <><strong>{v.customerPrice !== undefined ? money(v.customerPrice) : "待報價"}<small> / {v.packageUnit}</small></strong>{p.available && v.customerPrice !== undefined && <Quantity variant={v} compact />}</> : <Link href="/login" className="text-link">登入後查看您的專屬採購價</Link>}</div>)}</div></div></>;
}

function Procurement() {
  const { cart, replaceCart, user, notify, setQuantity } = useApp();
  const data = useData<{ products: Product[] }>("/api/products");
  const context = useData<{ serviceFee: number; shippingFee: number; customer: { deliveryAddress: string; paymentTerms: string } }>("/api/checkout-context");
  const [deliveryDate, setDeliveryDate] = useState(() => new Date(Date.now() + 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }));
  const [deliveryTime, setDeliveryTime] = useState("上午 06:00–10:00");
  const [address, setAddress] = useState("");
  useEffect(() => { if (context.data?.customer.deliveryAddress) setAddress(previous => previous || context.data!.customer.deliveryAddress); }, [context.data]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const router = useRouter();
  const rows = (data.data?.products || []).flatMap(p => p.variants.filter(v => cart[v.id]).map(v => ({ p, v, quantity: cart[v.id] })));
  const merchandise = rows.reduce((sum, r) => sum + Math.round((r.v.customerPrice || 0) * 100) * r.quantity, 0) / 100;
  const total = Math.round((merchandise + (context.data?.serviceFee || 0) + (context.data?.shippingFee || 0)) * 100) / 100;
  const invalid = rows.some(r => !r.p.available || r.v.customerPrice === undefined || r.quantity < r.v.moq) || Object.keys(cart).length !== rows.length;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try { const result = await api<{ order: Order }>("/api/orders", { items: rows.map(r => ({ variantId: r.v.id, quantity: r.quantity })), deliveryDate, deliveryTime, deliveryAddress: address, notes, idempotencyKey, expectedTotal: total }); replaceCart({}); notify("叫貨成功！訂單已送出等待確認。"); router.push(`/orders/${result.order.id}`); }
    catch (e) { setError((e as Error).message); await data.refresh(); await context.refresh(); } finally { setBusy(false); }
  };
  return <><div className="page-heading"><div><div className="eyebrow">PURCHASE REQUEST</div><h1>確認您的採購單</h1><p>最後確認食材與配送資訊，就可以安心開市。</p></div><Link className="button button-secondary" href="/quick-order"><Plus size={17} />繼續選購</Link></div>{data.loading ? <Loading /> : !Object.keys(cart).length ? <Empty text="採購單還沒有食材"><p>到快速訂貨加入今天需要的商品。</p><Link className="button button-primary" href="/quick-order">開始訂貨<ArrowRight size={16} /></Link></Empty> : <form className="checkout-layout" onSubmit={submit}><div><div className="card table-wrap"><table className="data-table"><thead><tr><th>商品</th><th>單價</th><th>數量</th><th>小計</th><th /></tr></thead><tbody>{rows.map(({ p, v, quantity }) => <tr key={v.id}><td><div className="table-product"><ProductArt product={p} small /><div><b>{p.name}</b><span>{v.specification} / {v.packageUnit}</span><small>{!p.available ? "暫停供貨" : quantity < v.moq ? `至少需要 ${v.moq} ${v.packageUnit}` : `MOQ ${v.moq}`}</small></div></div></td><td>{money(v.customerPrice)}</td><td><Quantity variant={v} compact /></td><td><b>{money((v.customerPrice || 0) * quantity)}</b></td><td><button type="button" className="icon-button" aria-label={`移除 ${p.name}`} onClick={() => setQuantity(v.id, 0)}><X size={16} /></button></td></tr>)}</tbody></table></div>{Object.keys(cart).length !== rows.length && <div className="error-message">採購單中有已下架的商品，請清空後重新選購。<button type="button" onClick={() => replaceCart({})}>清空採購單</button></div>}<div className="card delivery-card"><h2><Truck size={20} />配送資訊</h2><p className="muted">供應商直接出貨，指定日期需經供應商確認。</p><div className="form-grid"><label className="field">希望到貨日期<input type="date" min={new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" })} required value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} /></label><label className="field">希望配送時段<select value={deliveryTime} onChange={e => setDeliveryTime(e.target.value)}><option>上午 06:00–10:00</option><option>上午 10:00–12:00</option><option>下午 13:00–17:00</option><option>請先電話聯絡</option></select></label></div><label className="field">配送地址<input required maxLength={250} value={address} onChange={e => setAddress(e.target.value)} placeholder="請填寫完整地址與市場攤位" autoComplete="street-address" /></label><label className="field">採購備註<textarea value={notes} maxLength={1000} onChange={e => setNotes(e.target.value)} placeholder="例如：到貨前請先電話聯絡、攤位位置等" rows={3} /></label></div></div><aside className="checkout-summary card"><span className="eyebrow">ORDER SUMMARY</span><h2>本次採購</h2><div><span>採購人</span><b>{user?.name}</b></div><div><span>商品項數</span><b>{rows.length} 項</b></div><div><span>商品金額</span><b>{money(merchandise)}</b></div><div><span>固定服務費</span><b>{money(context.data?.serviceFee)}</b></div><div><span>付款條件</span><span>{context.data?.customer.paymentTerms || "—"}</span></div><div><span>配送費用</span><span>{money(context.data?.shippingFee)}</span></div><div className="checkout-total"><span>總計</span><strong>{money(total)}</strong></div><ErrorBox message={error || data.error || context.error} />{invalid && <ErrorBox message="部分品項已停止供貨、數量未達最低訂購量或尚未報價，請先調整。" />}<button disabled={busy || invalid || !rows.length || context.loading || !!context.error} className="button button-primary full-width" type="submit">{busy ? "正在送出…" : "確認叫貨"}<ArrowRight size={18} /></button><p><ShieldCheck size={15} />價格將在下單時鎖定保存。正式價格、配送與付款條件依確認內容為準。</p></aside></form>}</>;
}

function Orders() {
  const data = useData<{ orders: Order[] }>("/api/orders");
  const [filter, setFilter] = useState("all");
  const orders = data.data?.orders || [];
  const filtered = orders.filter(o => filter === "all" || (filter === "active" ? !["COMPLETED", "CANCELLED"].includes(o.status) : o.status === filter));
  return <><div className="page-heading"><div><div className="eyebrow">MY ORDERS</div><h1>每一張訂單，都有進度。</h1><p>查看採購內容、配送狀態，或再次訂購熟悉的食材。</p></div><Link href="/quick-order" className="button button-primary"><Plus size={17} />建立採購單</Link></div><div className="category-tabs">{[{ v: "all", t: `全部訂單 (${orders.length})` }, { v: "active", t: "進行中" }, { v: "COMPLETED", t: "已完成" }, { v: "CANCELLED", t: "已取消" }].map(f => <button className={filter === f.v ? "active" : ""} key={f.v} onClick={() => setFilter(f.v)}>{f.t}</button>)}</div><ErrorBox message={data.error} />{data.loading ? <Loading /> : !filtered.length ? <Empty text="目前沒有這類訂單" /> : <div className="orders-list">{filtered.map(o => <Link href={`/orders/${o.id}`} className="order-card card" key={o.id}><div className="order-card-top"><div><b>{o.orderNumber}</b><small>{date(o.createdAt)} 建立</small></div><Badge status={o.status} /></div><div className="order-items-preview">{o.items.slice(0, 3).map(i => `${i.productName} × ${i.quantity}`).join("、")}{o.items.length > 3 ? ` 等 ${o.items.length} 項` : ""}</div><div className="order-card-bottom"><span><Truck size={16} />希望到貨 {date(o.deliveryDate)}</span><div><strong>{money(o.totalAmount)}</strong><ChevronRight size={19} /></div></div></Link>)}</div>}</>;
}

function OrderDetail({ id }: { id: string }) {
  const data = useData<{ order: Order }>(`/api/orders/${id}`);
  const { replaceCart, notify } = useApp();
  const router = useRouter();
  if (data.loading) return <Loading />;
  const o = data.data?.order;
  if (!o) return <Empty text={data.error || "查無訂單"} />;
  return <><Link className="back-link" href="/orders"><ArrowLeft size={16} />我的訂單</Link><div className="page-heading"><div><div className="eyebrow">ORDER DETAILS</div><h1>{o.orderNumber}</h1><p>{date(o.createdAt)} 建立 · 價格已保存，不受後續調價影響</p></div><div className="heading-actions"><a className="button button-secondary" href={`/print/order/${id}`} target="_blank" rel="noreferrer"><ReceiptText size={16} />列印訂購單</a><button className="button button-primary" onClick={async () => { try { const result = await api<{ items: { variantId: string; quantity: number }[] }>(`/api/orders/${id}/reorder`, {}); replaceCart(Object.fromEntries(result.items.map(i => [i.variantId, i.quantity]))); router.push("/procurement"); } catch (e) { notify((e as Error).message, true); } }}><Zap size={16} />再次訂購</button></div></div><div className="order-status-card card"><div><CheckCircle2 size={28} /><div><b>{statuses[o.status]}</b><p>配送與備貨進度由平台及供應商更新。</p></div></div><Badge status={o.paymentStatus} /></div><div className="card table-wrap"><table className="data-table"><thead><tr><th>商品</th><th>規格</th><th>數量</th><th>單價</th><th>小計</th></tr></thead><tbody>{o.items.map(i => <tr key={i.id}><td><b>{i.productName}</b><small className="cell-small">{i.sku}</small></td><td>{i.specification}</td><td>{i.quantity} {i.packageUnit}</td><td>{money(i.customerPrice)}</td><td>{money(i.lineTotal)}</td></tr>)}</tbody><tfoot><tr><td colSpan={4}>採購總金額</td><td><strong>{money(o.totalAmount)}</strong></td></tr></tfoot></table></div><div className="card order-delivery"><h2>配送與備註</h2><dl className="detail-facts"><div><dt>希望到貨</dt><dd>{date(o.deliveryDate)} {o.deliveryTime}</dd></div><div><dt>配送地址</dt><dd>{o.deliveryAddress}</dd></div><div><dt>備註</dt><dd>{o.notes || "無"}</dd></div></dl></div></>;
}

function PrintPage({ kind, id }: { kind: string; id: string }) {
  const path = kind === "po" ? `/api/purchase-orders/${id}` : kind === "quotation" ? `/api/quotations/${id}` : `/api/orders/${id}`;
  const data = useData<any>(id ? path : null);
  const { user } = useApp();
  if (data.loading) return <Loading />;
  const document = data.data?.order || data.data?.purchaseOrder || data.data?.quotation;
  if (!document) return <Empty text={data.error || "無法載入列印資料"} />;
  if (kind === "admin-order" && !["SUPER_ADMIN", "SALES"].includes(user?.role || "")) return <AccessGate />;
  const isPO = kind === "po";
  const isAdmin = kind === "admin-order";
  const title = isPO ? "供應商彙總採購單" : kind === "quotation" ? "客戶報價單" : isAdmin ? "內部訂單成本明細" : "B2B 採購單";
  return <div className="print-page"><div className="print-actions"><Link href={isPO ? "/supplier" : "/orders"}><ArrowLeft size={16} />返回工作台</Link><button className="button button-primary" onClick={() => window.print()}><ReceiptText size={17} />列印 / 儲存 PDF</button><a className="button button-secondary" href={`/api/documents/${kind}/${id}`} download><ArrowDownToLine size={17} />下載 PDF</a></div><article className="print-sheet"><header><div><Fish size={30} /><b>東門採購</b></div><span>DONGMEN SEAFOOD HUB</span></header><h1>東門市場 {title}</h1><p className="print-demo">測試文件 · 非正式報價或交易憑證 {isAdmin && "· 僅限平台內部使用"}</p><div className="print-meta"><div><b>單據編號</b>{document.orderNumber || document.poNumber || document.quotationNumber || document.quoteNumber || document.number}</div><div><b>建立日期</b>{date(document.createdAt)}</div><div><b>{isPO ? "供應商" : "客戶 / 攤位"}</b>{isPO ? document.supplier?.name : `${document.customer?.companyName || ""} ${document.customer?.stallName || ""}`}</div><div><b>聯絡人 / 電話</b>{document.customer?.contactName || document.supplier?.contactName} {document.customer?.phone || document.supplier?.phone}</div>{document.validUntil && <div><b>有效日期</b>{date(document.validUntil)}</div>}</div><table><thead><tr><th>商品 / SKU</th><th>規格</th><th>數量</th><th>{isPO ? "供應商成本" : "單價"}</th><th>小計</th>{isAdmin && <><th>成本</th><th>毛利</th><th>佣金</th></>}</tr></thead><tbody>{document.items?.map((i: any, index: number) => <tr key={i.id || index}><td>{i.productName || i.name}<small>{i.sku}</small></td><td>{i.specification}</td><td>{i.quantity} {i.packageUnit}</td><td>{money(isPO ? i.supplierCost ?? i.unitCost : i.customerPrice ?? i.price)}</td><td>{money(i.lineTotal ?? Number(isPO ? i.supplierCost ?? i.unitCost : i.customerPrice ?? i.price) * i.quantity)}</td>{isAdmin && <><td>{money(i.supplierCost)}</td><td>{money(i.grossProfit)}</td><td>{money(i.commissionAmount)}</td></>}</tr>)}</tbody></table><div className="print-total">總金額 <strong>{money(document.totalAmount ?? document.totalCost)}</strong></div><div className="print-notes"><p><b>配送地址：</b>{document.deliveryAddress || "依配貨明細配送"}</p><p><b>配送時間：</b>{date(document.deliveryDate)} {document.deliveryTime}</p><p><b>付款條件：</b>{document.paymentTerms || "依確認訂單約定"}</p><p><b>備註：</b>{document.notes || "無"}</p></div>{isPO && <><h2>配貨明細</h2><table><thead><tr><th>SKU</th><th>客戶 / 攤位</th><th>配貨數量</th></tr></thead><tbody>{document.items?.flatMap((i: any) => (i.allocations || []).map((a: any, index: number) => <tr key={`${i.id}-${index}`}><td>{i.sku}</td><td>{a.customerName || a.stallName || a.customer?.stallName || a.orderNumber}</td><td>{a.quantity}</td></tr>))}</tbody></table></>}<footer>所有金額為新台幣。商品規格與價格依本單快照保存。<br />測試環境尚未完成營業與食品資訊，請勿作為正式交易文件。</footer></article></div>;
}

function LegalPage({ section }: { section: string }) {
  const data = useData<any>("/api/business-info");
  const labels: Record<string, string> = { terms: "交易條款", privacy: "隱私權政策", "business-info": "營業資訊", "food-information": "食品與冷鏈資訊" };
  const value = data.data?.businessInfo || data.data?.settings || data.data || {};
  return <div className="legal-page card"><span className="eyebrow">INFORMATION & POLICIES</span><h1>{labels[section]}</h1><div className="legal-warning"><ShieldCheck size={21} /><div><b>待管理員填寫與專業審閱</b><p>NEEDS PROFESSIONAL REVIEW · 此頁為占位資訊，不代表已取得法律合規確認。</p></div></div><p>本平台目前為本機測試 MVP。正式發布前須完成營業、交易、食品、個資與供應商授權資訊。</p><dl className="detail-facts">{(section === "business-info" ? [["營業人名稱", "businessName"], ["統一編號", "taxId"], ["客服電話", "customerServicePhone"], ["營業地址", "address"], ["交易主體", "tradingEntity"]] : section === "food-information" ? [["食品業者登錄字號", "foodRegistrationNumber"], ["供應商資訊", "supplierDisclosure"], ["冷鏈與配送責任", "coldChainPolicy"], ["食品責任", "foodResponsibility"]] : section === "terms" ? [["付款方式", "paymentMethods"], ["退換貨政策", "returnsPolicy"], ["交易條款", "terms"]] : [["個資政策", "privacyPolicy"], ["個資聯絡窗口", "privacyContact"]]).map(([label, key]) => <div key={key}><dt>{label}</dt><dd>{value[key] || "尚待管理員填寫"}</dd></div>)}</dl><ErrorBox message={data.error} /></div>;
}
