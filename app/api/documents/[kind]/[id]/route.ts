import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { existsSync } from "node:fs";
import { ApiError, getSession, requireStaff, requireUser } from "@/lib/server/auth";
import { getOrderForUser, getPurchaseOrderForUser, getQuotationForUser } from "@/lib/server/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const money = (v: unknown) => `NT$${Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const day = (v: unknown) => v ? new Date(String(v)).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" }) : "—";

export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  try {
    const { kind, id } = await params;
    if (!["order", "admin-order", "po", "quotation"].includes(kind)) throw new ApiError(404, "查無此文件類型");
    const user = await getSession(request);
    requireUser(user);
    if (kind === "admin-order") requireStaff(user);
    const source = kind === "po" ? await getPurchaseOrderForUser(id, user) : kind === "quotation" ? await getQuotationForUser(id, user) : await getOrderForUser(id, user);
    const data = source as any;
    const fontPath = process.env.PDF_FONT_PATH;
    if (!fontPath || !existsSync(fontPath)) throw new ApiError(503, "PDF 中文字型尚未設定。請設定 PDF_FONT_PATH，或使用瀏覽器列印／儲存 PDF。");
    const doc = new PDFDocument({ size: "A4", margins: { top: 42, right: 42, bottom: 42, left: 42 }, bufferPages: true, info: { Title: `東門採購 ${data.orderNumber || data.poNumber || data.quotationNumber || data.quoteNumber || id}`, Author: "DongmenSeafoodHub" } });
    const chunks: Buffer[] = [];
    const finished = new Promise<Buffer>((resolve, reject) => { doc.on("data", c => chunks.push(c)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
    if (fontPath.toLowerCase().endsWith(".ttc")) doc.font(fontPath, process.env.PDF_FONT_FAMILY || "MicrosoftJhengHeiRegular"); else doc.font(fontPath);
    const pageWidth = 511;
    const title = kind === "po" ? "供應商彙總採購單" : kind === "quotation" ? "客戶報價單" : kind === "admin-order" ? "內部訂單成本明細" : "B2B 採購單";
    doc.fillColor("#087f83").fontSize(23).text("東門採購", 42, 42);
    doc.fillColor("#72838e").fontSize(9).text("DONGMEN SEAFOOD HUB", 250, 50, { align: "right", width: 303 });
    doc.moveTo(42, 81).lineTo(553, 81).lineWidth(1.5).strokeColor("#087f83").stroke();
    doc.fillColor("#193b48").fontSize(19).text(`東門市場 ${title}`, 42, 99, { width: pageWidth, align: "center" });
    doc.fillColor("#87979d").fontSize(9).text(process.env.DEMO_MODE === "true" ? "測試文件 · 非正式報價或交易憑證" : "商品規格、價格與條件依本單記載", 42, 132, { width: pageWidth, align: "center" });
    let y = 163;
    const fields = [
      ["單據編號", data.orderNumber || data.poNumber || data.quotationNumber || data.quoteNumber || data.number || id],
      ["建立日期", day(data.createdAt)],
      [kind === "po" ? "供應商" : "客戶 / 攤位", kind === "po" ? data.supplier?.name : `${data.customer?.companyName || ""} ${data.customer?.stallName || ""}`],
      ["聯絡人 / 電話", `${data.customer?.contactName || data.supplier?.contactName || ""} ${data.customer?.phone || data.supplier?.phone || ""}`],
      ...(kind === "quotation" ? [["有效日期", day(data.validUntil || data.validTo)]] : [])
    ];
    for (const [label, value] of fields) {
      const text = `${label}：${value || "—"}`;
      doc.fontSize(10).fillColor("#4a6672").text(text, 42, y, { width: pageWidth });
      y += doc.heightOfString(text, { width: pageWidth }) + 7;
    }
    y += 12;
    const staff = kind === "admin-order";
    const widths = staff ? [115, 71, 43, 64, 74, 72, 72] : [151, 105, 55, 95, 105];
    const labels = staff ? ["商品 / SKU", "規格", "數量", "單價", "小計", "單位成本", "佣金"] : ["商品 / SKU", "規格", "數量", kind === "po" ? "供應商成本" : "單價", "小計"];
    const tableHeader = () => {
      doc.rect(42, y, pageWidth, 28).fill("#eaf2ef");
      let x = 42;
      labels.forEach((label, idx) => { doc.fillColor("#496b6e").fontSize(8).text(label, x + 5, y + 9, { width: widths[idx] - 10, lineBreak: false }); x += widths[idx]; });
      y += 28;
    };
    const room = (height: number, header = false) => { if (y + height > 754) { doc.addPage(); y = 45; if (header) tableHeader(); } };
    tableHeader();
    for (const item of data.items || []) {
      const unitPrice = kind === "po" ? item.supplierCost ?? item.unitCost : item.customerPrice ?? item.price;
      const lineTotal = item.lineTotal ?? Number(unitPrice) * item.quantity;
      const cells = [String(item.productName || item.name || ""), String(item.specification || ""), `${item.quantity} ${item.packageUnit || ""}`, money(unitPrice), money(lineTotal), ...(staff ? [money(item.supplierCost), money(item.commissionAmount)] : [])];
      doc.fontSize(9);
      const heights = cells.map((c, i) => doc.heightOfString(c, { width: widths[i] - 10 }));
      const height = Math.max(48, ...heights.map(h => h + 22));
      room(height, true);
      let x = 42;
      cells.forEach((cell, idx) => { doc.fillColor("#294957").fontSize(9).text(cell, x + 5, y + 10, { width: widths[idx] - 10 }); x += widths[idx]; });
      doc.fontSize(6).fillColor("#93a4ab").text(String(item.sku || ""), 47, y + height - 11, { width: widths[0] - 10, lineBreak: false });
      y += height;
      doc.moveTo(42, y).lineTo(553, y).lineWidth(.4).strokeColor("#dce5e7").stroke();
    }
    room(90);
    y += 17;
    doc.fontSize(16).fillColor("#183b44").text(`總金額  ${money(data.totalAmount ?? data.totalCost)}`, 42, y, { width: pageWidth, align: "right" });
    y += 32;
    if (staff) {
      room(50);
      const grossProfit = Number(data.grossProfit || 0);
      const margin = Number(data.totalAmount) > 0 ? grossProfit / Number(data.totalAmount) * 100 : 0;
      doc.fontSize(10).text(`總成本：${money(data.totalCost)}   毛利：${money(grossProfit)}   毛利率：${margin.toFixed(2)}%`, 42, y, { width: pageWidth });
      y += 23;
      doc.text(`佣金：${money(data.commissionAmount)}   （僅供內部使用）`, 42, y, { width: pageWidth });
      y += 28;
    }
    const notes = [`配送地址：${data.deliveryAddress || data.customer?.deliveryAddress || "依配貨明細配送"}`, `希望到貨：${day(data.deliveryDate)} ${data.deliveryTime || ""}`, `付款條件：${data.paymentTerms || "依確認訂單約定"}`, `配送條件：${data.deliveryTerms || "供應商直接出貨"}`, `備註：${data.notes || "無"}`];
    for (const note of notes) { doc.fontSize(9); const h = doc.heightOfString(note, { width: pageWidth }); room(h + 10); doc.fillColor("#6b808c").text(note, 42, y, { width: pageWidth }); y += h + 9; }
    if (kind === "po") {
      room(60); y += 15; doc.fontSize(13).fillColor("#214957").text("配貨明細", 42, y); y += 30;
      for (const item of data.items || []) for (const allocation of item.allocations || []) {
        const line = `${item.sku} · ${allocation.customerName || allocation.stallName || allocation.customer?.stallName || allocation.orderNumber || ""} · ${allocation.quantity} ${item.packageUnit || ""}`;
        doc.fontSize(9); const h = doc.heightOfString(line, { width: pageWidth }); room(h + 15); doc.fillColor("#55707b").text(line, 42, y, { width: pageWidth }); y += h + 10;
      }
    }
    const range = doc.bufferedPageRange();
    for (let index = 0; index < range.count; index++) {
      doc.switchToPage(index);
      doc.fontSize(8).fillColor("#a0adb2").text(`所有金額為新台幣 · 第 ${index + 1} / ${range.count} 頁`, 42, 783, { width: pageWidth, align: "center", lineBreak: false });
    }
    doc.end();
    const buffer = await finished;
    const number = data.orderNumber || data.poNumber || data.quotationNumber || data.quoteNumber || id;
    return new NextResponse(new Uint8Array(buffer), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${kind}-${String(number).replace(/[^a-zA-Z0-9_-]/g, "")}.pdf"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("PDF generation failed", error);
    return NextResponse.json({ error: error instanceof ApiError ? error.message : "PDF 產生失敗，請使用瀏覽器列印或確認中文字型設定。" }, { status: error instanceof ApiError ? error.status : 500, headers: { "Cache-Control": "no-store" } });
  }
}
