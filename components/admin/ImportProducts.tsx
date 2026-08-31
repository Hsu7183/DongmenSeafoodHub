"use client";
import Link from "next/link";

import { ChangeEvent, useState } from "react";
import { ArrowRight, Check, Download, FileSpreadsheet, FileUp, ShieldCheck } from "lucide-react";
import { api, Heading, LoadState, money, Notice, record, records, Row, txt, useRemote } from "./shared";
import styles from "./admin.module.css";

const mappingFields = [
  { key: "name", label: "商品名稱", required: true, aliases: ["商品名稱", "供應商商品名稱", "品名", "name"] },
  { key: "sku", label: "SKU／規格編號", required: true, aliases: ["sku", "SKU", "商品編號", "規格編號"] },
  { key: "specification", label: "規格", required: true, aliases: ["規格", "specification"] },
  { key: "supplierCost", label: "供應商批發成本", required: true, aliases: ["supplierCost", "supplier_cost", "供應商成本", "批發成本", "進價", "成本"] },
  { key: "baseWholesalePrice", label: "基礎批發售價", required: true, aliases: ["baseWholesalePrice", "base_wholesale_price", "基礎批發价", "基礎批發價", "批發售價", "售價"] },
  { key: "suggestedPrice", label: "建議售價", aliases: ["suggestedPrice", "suggested_price", "建議售價"] },
  { key: "category", label: "分類名稱", aliases: ["category", "分類", "商品分類"] },
  { key: "weight", label: "重量", aliases: ["weight", "重量"] },
  { key: "packageUnit", label: "包裝單位", aliases: ["packageUnit", "package_unit", "單位", "包裝單位"] },
  { key: "caseQuantity", label: "箱入數", aliases: ["caseQuantity", "case_quantity", "箱入數"] },
  { key: "moq", label: "最低訂購量", aliases: ["moq", "MOQ", "最低訂購量"] },
  { key: "brand", label: "品牌", aliases: ["brand", "品牌"] },
  { key: "origin", label: "產地", aliases: ["origin", "產地"] },
  { key: "description", label: "商品介紹", aliases: ["description", "商品介紹", "介紹"] },
  { key: "supplierProductId", label: "供應商商品 ID", aliases: ["supplierProductId", "supplier_product_id", "供應商商品ID"] },
  { key: "supplierProductCode", label: "供應商商品編碼", aliases: ["supplierProductCode", "supplier_product_code", "供應商商品編碼"] },
  { key: "imageUrl", label: "授權圖片網址", aliases: ["imageUrl", "image_url", "圖片", "圖片網址"] },
  { key: "sourceUrl", label: "來源網址", aliases: ["sourceUrl", "source_url", "來源", "來源網址"] },
  { key: "supplierUrl", label: "供應商商品網址", aliases: ["supplierUrl", "supplier_url", "供應商商品網址"] },
];

function downloadTemplate() {
  const csv = "\uFEFFname,sku,specification,supplier_cost,base_wholesale_price,category,package_unit,case_quantity,moq\n自訂示範魚片,DEMO-IMPORT-001,300g,100,125,魚類,包,10,1\n";
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" })); const link = document.createElement("a"); link.href = url; link.download = "DongmenSeafood-示範匯入範本.csv"; link.click(); URL.revokeObjectURL(url);
}

export default function ImportProducts() {
  const settings = useRemote("/api/admin/settings"); const suppliers = useRemote("/api/admin/suppliers");
  const [raw, setRaw] = useState<Row[]>([]); const [headers, setHeaders] = useState<string[]>([]); const [mapping, setMapping] = useState<Record<string, string>>({}); const [sourceType, setSourceType] = useState<"CSV" | "EXCEL" | "JSON">("CSV"); const [fileName, setFileName] = useState(""); const [supplierId, setSupplierId] = useState(""); const [demo, setDemo] = useState(true); const [authorized, setAuthorized] = useState(false); const [step, setStep] = useState(1); const [error, setError] = useState(""); const [feedback, setFeedback] = useState(""); const [busy, setBusy] = useState(false);
  const supplierList = records(suppliers.data.suppliers); const selectedSupplierId = supplierId || txt(supplierList[0]?.id, "");
  const parseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return; setBusy(true); setError(""); setFeedback("");
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("檔案大小上限為 10 MB。請分批匯入。");
      let parsed: Row[] = []; const extension = file.name.split(".").pop()?.toLowerCase();
      if (extension === "csv") {
        const Papa = (await import("papaparse")).default; const result = Papa.parse<Row>(await file.text(), { header: true, skipEmptyLines: "greedy", transformHeader: header => header.trim().replace(/^\uFEFF/, "") });
        if (result.errors.length) throw new Error(`CSV 格式不正確：${result.errors[0].message}`); parsed = result.data; setSourceType("CSV");
      } else if (extension === "xlsx") {
        const ExcelJS = (await import("exceljs")).default; const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await file.arrayBuffer()); const sheet = workbook.worksheets[0];
        if (!sheet) throw new Error("Excel 中沒有可讀取的工作表。"); const keys: string[] = [];
        sheet.getRow(1).eachCell((cell, col) => { keys[col - 1] = cell.text.trim(); });
        sheet.eachRow((row, index) => { if (index === 1) return; const item: Row = {}; keys.forEach((key, col) => { if (key) { const cell = row.getCell(col + 1); item[key] = typeof cell.value === "number" ? cell.value : cell.text; } }); if (Object.values(item).some(v => String(v).trim())) parsed.push(item); }); setSourceType("EXCEL");
      } else if (extension === "json") {
        const json = JSON.parse(await file.text()) as unknown; const input = Array.isArray(json) ? json : record(json).products ?? record(json).rows;
        if (!Array.isArray(input) || input.some(item => !item || typeof item !== "object" || Array.isArray(item))) throw new Error("JSON 請使用商品物件陣列，或含 products／rows 陣列的物件。"); parsed = records(input); setSourceType("JSON");
      } else throw new Error("請選擇 CSV、Excel .xlsx 或 JSON 檔案。舊版 .xls 請先另存為 .xlsx。");
      if (!parsed.length) throw new Error("檔案沒有商品資料，請檢查第一列欄位名稱與內容。"); if (parsed.length > 1000) throw new Error("單次最多匯入 1,000 列，請分批處理。");
      const keys = [...new Set(parsed.flatMap(item => Object.keys(item)))]; const guessed: Record<string, string> = {}; mappingFields.forEach(field => { guessed[field.key] = keys.find(key => field.aliases.some(alias => alias.toLowerCase() === key.toLowerCase())) ?? ""; });
      setRaw(parsed); setHeaders(keys); setMapping(guessed); setFileName(file.name); setStep(2);
    } catch (err) { setError(err instanceof Error ? err.message : "無法讀取檔案。"); } finally { setBusy(false); }
  };
  const normalized = raw.map(row => { const output: Row = {}; mappingFields.forEach(field => { if (mapping[field.key]) { const value = row[mapping[field.key]]; if (value !== "" && value != null) output[field.key] = value; } }); return output; });
  const missing = mappingFields.filter(field => field.required && !mapping[field.key]);
  const validate = () => {
    setError(""); if (!selectedSupplierId) { setError("請先建立並選擇供應商。"); return; } if (missing.length) { setError(`請對應必要欄位：${missing.map(field => field.label).join("、")}。`); return; }
    const invalid = normalized.findIndex(row => mappingFields.some(field => field.required && (row[field.key] == null || String(row[field.key]).trim() === "")) || !Number.isFinite(Number(row.supplierCost)) || !Number.isFinite(Number(row.baseWholesalePrice)) || Number(row.supplierCost) < 0 || Number(row.baseWholesalePrice) < 0);
    if (invalid >= 0) { setError(`第 ${invalid + 1} 列缺少必填欄位或價格無效，請先修正原始檔案。`); return; }
    if (demo && normalized.some(row => row.imageUrl || row.sourceUrl || row.supplierUrl)) { setError("示範匯入不可包含第三方圖片或來源網址。請取消這些欄位對應，或在取得授權後使用正式匯入。"); return; }
    setStep(3);
  };
  const canImport = demo ? settings.data.demoMode === true : settings.data.supplierContentAuthorized === true && authorized;
  const submit = async () => { setBusy(true); setError(""); try { const result = await api("/api/admin/import-products", "POST", { rows: normalized, sourceType, supplierId: selectedSupplierId, authorizationConfirmed: authorized, demo }); setFeedback(`成功匯入 ${txt(result.imported)} 筆商品。來源資訊及操作紀錄已保存。${demo ? "所有品項均標記為示範資料。" : "已標記為授權商品。"}`); setStep(1); setRaw([]); setFileName(""); } catch (err) { setError(err instanceof Error ? err.message : "匯入失敗，資料未完成寫入。"); } finally { setBusy(false); } };
  return <><Heading title="商品資料匯入" description="上傳供應商提供的檔案，對應欄位後預覽，再匯入商品目錄。" actions={<button className="button button-secondary" onClick={downloadTemplate}><Download size={15} />下載 CSV 範本</button>} />{feedback && <Notice>{feedback} <Link href="/admin/products" style={{ color: "inherit", fontWeight: 600 }}>前往商品管理 →</Link></Notice>}{error && <Notice error>{error}</Notice>}<LoadState loading={settings.loading || suppliers.loading} error={settings.error || suppliers.error}><div className={styles.steps}>{[[1, "選擇來源檔案"], [2, "對應資料欄位"], [3, "預覽與確認匯入"]].map(([number, label]) => <div key={number} className={`${styles.step} ${step === number ? styles.stepActive : ""}`}><span>{step > Number(number) ? <Check size={13} /> : String(number).padStart(2, "0")}</span><strong>{label}</strong></div>)}</div><div className={styles.settingsGrid}><section className={styles.panel}><div className={styles.panelHeading}><div><h2>{step === 1 ? "準備您的商品檔案" : step === 2 ? "欄位 Mapping" : "確認匯入內容"}</h2><p>{fileName ? `${fileName} · ${raw.length} 筆商品 · ${sourceType}` : "支援 CSV、Excel (.xlsx)、JSON · 每批最多 1,000 筆"}</p></div><FileSpreadsheet size={21} color="#709b8f" /></div><div className={styles.formCard}><div className={styles.formGrid}><label className={styles.formField}><span>資料所屬供應商</span><select value={selectedSupplierId} onChange={e => setSupplierId(e.target.value)} required>{!supplierList.length && <option value="">請先建立供應商</option>}{supplierList.map(s => <option key={txt(s.id)} value={txt(s.id)}>{txt(s.name)}</option>)}</select></label><label className={styles.formField}><span>匯入用途</span><select value={demo ? "demo" : "formal"} onChange={e => { setDemo(e.target.value === "demo"); setAuthorized(false); setStep(raw.length ? 2 : 1); }}><option value="demo" disabled={!settings.data.demoMode}>示範資料（不含第三方內容）</option><option value="formal">正式授權商品資料</option></select></label></div>{step === 1 && <label className={`${styles.upload} ${styles.spaced}`}><FileUp size={32} strokeWidth={1.4} /><strong>{busy ? "正在讀取檔案…" : "選擇供應商商品檔案"}</strong><span>資料只在您確認匯入後寫入資料庫</span><input aria-label="商品匯入檔案" type="file" accept=".csv,.xlsx,.json" disabled={busy} onChange={parseFile} /></label>}{step === 2 && <div className={styles.spaced}><div className={styles.mappingGrid}><strong>平台欄位</strong><span /><strong>檔案來源欄位</strong></div>{mappingFields.map(field => <div className={styles.mappingGrid} key={field.key}><span>{field.label}{field.required && " *"}<small style={{ display: "block", color: "#a0aeb4", fontSize: 10, marginTop: 3 }}>{field.key}</small></span><small><ArrowRight size={14} /></small><select aria-label={`對應${field.label}`} value={mapping[field.key] ?? ""} onChange={e => setMapping(prev => ({ ...prev, [field.key]: e.target.value }))}><option value="">{field.required ? "請選擇欄位" : "略過此欄位"}</option>{headers.map(header => <option key={header} value={header}>{header}</option>)}</select></div>)}<div className={styles.formActions}><button className="button button-secondary" onClick={() => setStep(1)}>更換檔案</button><button className="button button-primary" onClick={validate}>預覽 {raw.length} 筆資料<ArrowRight size={14} /></button></div></div>}{step === 3 && <div className={styles.spaced}><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>商品／SKU</th><th>規格</th><th>成本</th><th>批發價</th></tr></thead><tbody>{normalized.slice(0, 12).map((row, i) => <tr key={i}><td>{txt(row.name)}<small>{txt(row.sku)}</small></td><td>{txt(row.specification)}</td><td>{money(row.supplierCost)}</td><td>{money(row.baseWholesalePrice)}</td></tr>)}</tbody></table></div><p className={styles.metaText}>顯示前 {Math.min(12, raw.length)} 筆，共 {raw.length} 筆。相同 SKU 將更新既有商品；歷史訂單價格不變。</p>{!demo && <label className={`${styles.formField} ${styles.checkboxField} ${styles.spaced}`}><span>我確認已取得供應商圖片、商品資料及文案之有效使用授權。</span><input type="checkbox" checked={authorized} onChange={e => setAuthorized(e.target.checked)} /></label>}{!canImport && <Notice error>{demo ? "目前環境已關閉示範匯入。" : "正式匯入需啟用 SUPPLIER_CONTENT_AUTHORIZED 並確認已取得供應商授權。"}</Notice>}<div className={styles.formActions}><button className="button button-secondary" onClick={() => setStep(2)}>返回欄位對應</button><button className="button button-primary" disabled={!canImport || busy} onClick={submit}>{busy ? "匯入中…" : `確認匯入 ${raw.length} 筆商品`}</button></div></div>}</div></section><div><div className={styles.guide}><h3><ShieldCheck size={18} />供應商內容保護</h3><p><strong>{settings.data.supplierContentAuthorized ? "環境允許授權匯入" : "正式資料匯入尚未啟用"}</strong></p><p>未取得授權時，不可將供應商官網圖片與文案下載後重新公開。</p><ul><li>優先使用供應商正式 CSV／Excel</li><li>供應商成本須為獨立批發報價</li><li>官網零售價格不得視為採購成本</li><li>來源網址、授權狀態與時間會保留</li><li>有錯誤的批次不會部分寫入</li></ul></div><div className={`${styles.guide} ${styles.spaced}`}><h3><FileSpreadsheet size={18} />第一次匯入？</h3><p>下載示範範本，確認「商品名稱、SKU、規格、供應商成本、基礎批發價」五個必要欄位，再使用欄位對應完成匯入。</p><p>示範價格僅供測試，請勿用於正式交易。</p></div></div></div></LoadState></>;
}

