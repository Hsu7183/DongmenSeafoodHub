"use client";

import { useState } from "react";
import { Fish, ShieldCheck } from "lucide-react";
import { count, Empty, LoadState, money, records, RowIdentity, SearchField, SectionCard, Status, Table, txt, useRemote } from "./shared";
import { PurchaseOrdersAdmin } from "./OperationsAdmin";
import styles from "./admin.module.css";

export default function SupplierWorkspace() {
  const products = useRemote("/api/products"); const [query, setQuery] = useState("");
  const list = records(products.data.products).filter(product => JSON.stringify(product).toLowerCase().includes(query.toLowerCase()));
  return <><PurchaseOrdersAdmin supplierMode /><div className={styles.supplierIntro}><ShieldCheck size={23} /><div><strong>您的供應商專屬工作區</strong>此工作區僅提供您所屬供應商的採購單、商品與配貨需求。履約狀態更新後，平台將同步相關訂單進度。</div></div><LoadState loading={products.loading} error={products.error}><SectionCard title="您的供貨商品" subtitle="供貨狀態與規格由平台管理員維護"><div className={styles.toolbar}><SearchField value={query} onChange={setQuery} placeholder="搜尋商品名稱或規格" /><span className={styles.metaText}>{list.length} 款商品</span></div>{list.length ? <Table headers={["商品", "SKU／規格", "箱入數", "最低採購量", "供應價格", "供貨狀態"]}>{list.flatMap(product => records(product.variants).map(variant => <tr key={txt(variant.id)}><td><RowIdentity title={product.name} subtitle={`${txt(product.origin)} · ${txt(product.storageMethod)}`} icon={<Fish size={17} />} /></td><td>{txt(variant.sku)}<small>{txt(variant.specification)}</small></td><td>{count(variant.caseQuantity)} {txt(variant.packageUnit)}</td><td>{count(variant.moq)} {txt(variant.packageUnit)}</td><td className={styles.money}>{money(variant.supplierCost)}</td><td><Status value={product.available ? "AVAILABLE" : "UNAVAILABLE"} /></td></tr>))}</Table> : <Empty title="目前沒有符合的供貨商品" description="如需更新品項資訊，請聯絡平台管理員。" />}</SectionCard></LoadState></>;
}
