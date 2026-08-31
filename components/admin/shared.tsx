"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";
import { AlertCircle, Check, LoaderCircle, RefreshCw, Search, X } from "lucide-react";
import styles from "./admin.module.css";

export type Row = Record<string, unknown>;
export const record = (value: unknown): Row => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
export const records = (value: unknown): Row[] => Array.isArray(value) ? value.map(record) : [];
export const txt = (value: unknown, fallback = "—") => value === null || value === undefined || value === "" ? fallback : String(value);
export const numeric = (value: unknown) => Number(value) || 0;
export const money = (value: unknown) => `NT$ ${numeric(value).toLocaleString("zh-TW", { maximumFractionDigits: 2 })}`;
export const count = (value: unknown) => numeric(value).toLocaleString("zh-TW");
export const date = (value: unknown, time = false) => value ? new Date(String(value)).toLocaleString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", ...(time ? { hour: "2-digit", minute: "2-digit" } : {}) }) : "—";
export const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
export const names: Record<string, string> = { DRAFT: "草稿", SUBMITTED: "待確認", CONFIRMED: "已確認", ORDERED_TO_SUPPLIER: "已向供應商下單", PREPARING: "備貨中", SHIPPED: "配送中", DELIVERED: "已送達", COMPLETED: "已完成", CANCELLED: "已取消", UNPAID: "未付款", PARTIAL: "部分付款", PAID: "已收款", OVERDUE: "已逾期", PENDING: "待確認", ACTIVE: "啟用", INACTIVE: "停用", SENT: "已送出", RECEIVED: "已收貨", AVAILABLE: "可供貨", UNAVAILABLE: "暫停供貨", DEMO: "示範資料", PENDING_AUTHORIZATION: "待授權", AUTHORIZED: "已授權", LEVEL_A: "A 級・大量採購", LEVEL_B: "B 級・一般客戶", LEVEL_C: "C 級・新客戶", CUSTOM: "專屬報價", SUPER_ADMIN: "平台管理員", SALES: "業務人員", CUSTOMER: "採購客戶", SUPPLIER: "供應商", MARKET_STALL: "市場攤商", RESTAURANT: "餐飲業者", SEAFOOD_STORE: "水產行", FOOD_VENDOR: "食品業者", OTHER: "其他", CASH: "現金", BANK_TRANSFER: "銀行轉帳", MONTHLY_SETTLEMENT: "月結", COMMISSION: "佣金模式", RESELLER: "進銷價差模式", FIXED: "固定售價", COST_PLUS: "成本加價", MARGIN: "百分比毛利" };

export async function api(path: string, method = "GET", body?: unknown): Promise<Row> {
  const response = await fetch(path, { method, credentials: "same-origin", cache: "no-store", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => ({})) as Row;
  if (!response.ok) throw new Error(txt(data.error ?? data.message, "操作未成功，請稍後再試。"));
  return data;
}

export function useRemote(path: string) {
  const [data, setData] = useState<Row>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(v => v + 1), []);
  useEffect(() => { let live = true; setLoading(true); setError(""); api(path).then(result => { if (live) setData(result); }).catch(err => { if (live) setError(err instanceof Error ? err.message : "讀取失敗"); }).finally(() => { if (live) setLoading(false); }); return () => { live = false; }; }, [path, revision]);
  return { data, loading, error, refresh };
}

export function Status({ value }: { value: unknown }) {
  const status = txt(value, "");
  const color = ["COMPLETED", "DELIVERED", "PAID", "ACTIVE", "AUTHORIZED", "AVAILABLE", "RECEIVED"].includes(status) ? styles.statusGood : ["CANCELLED", "OVERDUE", "INACTIVE", "UNAVAILABLE"].includes(status) ? styles.statusBad : ["SUBMITTED", "PENDING", "UNPAID", "PARTIAL", "PENDING_AUTHORIZATION", "DEMO"].includes(status) ? styles.statusWarning : styles.statusNeutral;
  return <span className={`${styles.status} ${color}`}><i />{names[status] ?? status}</span>;
}

export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div className={`${styles.notice} ${error ? styles.noticeError : ""}`} role={error ? "alert" : "status"}>{error ? <AlertCircle size={17} /> : <Check size={17} />}<span>{children}</span></div>;
}

export function LoadState({ loading, error, children }: { loading: boolean; error: string; children: ReactNode }) {
  if (loading) return <div className={styles.loading}><LoaderCircle size={22} className={styles.spinner} /><span>正在讀取即時資料…</span></div>;
  if (error) return <Notice error>{error}</Notice>;
  return <>{children}</>;
}

export function Heading({ eyebrow = "營運管理", title, description, actions }: { eyebrow?: string; title: string; description: string; actions?: ReactNode }) {
  return <header className={styles.heading}><div><div className={styles.eyebrow}>{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{actions && <div className={styles.headingActions}>{actions}</div>}</header>;
}

export function Reload({ onClick }: { onClick: () => void }) { return <button className="button button-secondary" onClick={onClick}><RefreshCw size={15} />重新整理</button>; }

export function SearchField({ value, onChange, placeholder = "搜尋名稱、編號或聯絡資訊" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <label className={styles.search}><Search size={17} /><input aria-label={placeholder} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} /></label>;
}

export function Empty({ title = "目前沒有資料", description = "新增第一筆資料，即可開始管理您的採購業務。" }: { title?: string; description?: string }) {
  return <div className={styles.empty}><div className={styles.emptySymbol}>＋</div><h3>{title}</h3><p>{description}</p></div>;
}

export function Modal({ title, subtitle, children, onClose }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key); }, [onClose]);
  return <div className={styles.modalBackdrop} onClick={e => { if (e.target === e.currentTarget) onClose(); }}><section className={styles.modal} role="dialog" aria-modal="true" aria-label={title}><div className={styles.modalHead}><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className={styles.iconButton} aria-label="關閉視窗" onClick={onClose}><X size={21} /></button></div>{children}</section></div>;
}

export type Option = { value: string; label: string };
export type Field = { key: string; label: string; type?: "text" | "number" | "email" | "date" | "textarea" | "select" | "checkbox" | "password"; required?: boolean; options?: Option[]; defaultValue?: unknown; hint?: string; span?: boolean; min?: number; step?: string };
export const options = (...values: string[]) => values.map(value => ({ value, label: names[value] ?? value }));

export function EntityForm({ fields, initial = {}, onSubmit, onCancel, submitLabel = "儲存資料" }: { fields: Field[]; initial?: Row; onSubmit: (values: Row) => Promise<void>; onCancel?: () => void; submitLabel?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const form = new FormData(e.currentTarget); const values: Row = {};
    fields.forEach(field => { const raw = form.get(field.key); values[field.key] = field.type === "checkbox" ? raw === "on" : field.type === "number" ? raw === "" ? null : Number(raw) : raw ?? ""; });
    setBusy(true); setError(""); try { await onSubmit(values); } catch (err) { setError(err instanceof Error ? err.message : "儲存失敗"); } finally { setBusy(false); }
  };
  return <form onSubmit={submit}><div className={styles.formGrid}>{fields.map(field => {
    const initialValue = initial[field.key] ?? field.defaultValue ?? "";
    return <label key={field.key} className={`${styles.formField} ${field.span ? styles.fullWidth : ""} ${field.type === "checkbox" ? styles.checkboxField : ""}`}><span>{field.label}{field.required && <b> *</b>}</span>{field.type === "select" ? <select name={field.key} defaultValue={String(initialValue)} required={field.required}>{!field.required && <option value="">未設定</option>}{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.type === "textarea" ? <textarea name={field.key} rows={3} defaultValue={String(initialValue)} required={field.required} /> : field.type === "checkbox" ? <input name={field.key} type="checkbox" defaultChecked={Boolean(initialValue)} /> : <input name={field.key} type={field.type ?? "text"} defaultValue={field.type === "date" && initialValue ? String(initialValue).slice(0, 10) : String(initialValue)} required={field.required} min={field.min ?? (field.type === "number" ? 0 : undefined)} step={field.step ?? (field.type === "number" ? "any" : undefined)} />}{field.hint && <small>{field.hint}</small>}</label>;
  })}</div>{error && <Notice error>{error}</Notice>}<div className={styles.formActions}>{onCancel && <button type="button" className="button button-secondary" onClick={onCancel}>取消</button>}<button type="submit" disabled={busy} className="button button-primary">{busy && <LoaderCircle size={16} className={styles.spinner} />}{busy ? "處理中…" : submitLabel}</button></div></form>;
}

export function Metric({ title, value, icon, detail, accent = false }: { title: string; value: ReactNode; icon: ReactNode; detail?: ReactNode; accent?: boolean }) { return <div className={`${styles.metric} ${accent ? styles.metricAccent : ""}`}><div className={styles.metricTop}><span>{title}</span><span className={styles.metricIcon}>{icon}</span></div><strong>{value}</strong>{detail && <small>{detail}</small>}</div>; }

export function Table({ headers, children }: { headers: string[]; children: ReactNode }) { return <div className={styles.tableWrap}><table className={styles.table}><thead><tr>{headers.map((header, i) => <th key={`${header}-${i}`}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }

export function RowIdentity({ title, subtitle, icon }: { title: unknown; subtitle?: unknown; icon?: ReactNode }) { return <div className={styles.identity}>{icon && <div className={styles.identityIcon}>{icon}</div>}<div><strong>{txt(title)}</strong>{Boolean(subtitle) && <small>{txt(subtitle)}</small>}</div></div>; }

export function SectionCard({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) { return <section className={styles.panel}><div className={styles.panelHeading}><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>{children}</section>; }

