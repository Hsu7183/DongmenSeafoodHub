import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { formatUnits, unitTotals, statusLabels, type Order } from './types';

export async function makeOrderPdf(order: Order, fontBytes: ArrayBuffer | Uint8Array) {
  const items=order.items.filter(i=>i.quantity>0);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  // Keep original glyph IDs; fontkit subsetting loses glyph mappings for this CJK font.
  // Disable contextual locale alternates: this font's Latin/CJK substitutions
  // render digits but lose their Unicode mapping when an order name starts in Latin.
  const font = await pdf.embedFont(fontBytes, { subset: false, features: { locl: false } });
  pdf.setTitle(`東門市場訂購單 ${order.number}`);
  pdf.setAuthor('東門市場食材訂購');
  const ink = rgb(.10,.24,.21), muted = rgb(.39,.46,.42), line = rgb(.83,.87,.83);
  const width = 595.28, height = 841.89, left = 42, tableWidth = width - 84;
  let page: PDFPage; let y = 0;
  function text(value: string, x: number, top: number, size = 10, color = ink) { page.drawText(value, { x, y: top, size, font, color }); }
  function newPage() { page = pdf.addPage([width,height]); y = height - 52; }
  function header() { page.drawRectangle({ x:left, y:y-26, width:tableWidth, height:30, color:rgb(.91,.94,.90) }); text('商品名稱',left+9,y-15); text('規格',left+245,y-15); text('訂購量',left+426,y-15); y -= 40; }
  function ensureRoom(space: number, withHeader = true) { if(y-space < 64) { newPage(); if(withHeader) header(); } }
  function wrapped(value: string, limit: number, size: number) { return wrapText(value, font, limit, size); }
  newPage();
  text('東門市場・食材訂購單',left,y,21); y -= 30;
  text(order.demo ? '示範訂單，不向供應商採購' : '商品名稱與數量明細',left,y,10,muted); y -= 28;
  if(order.status){text(`狀態：${statusLabels[order.status]} · 第 ${order.revision||1} 版`,left,y,11);y-=22;}
  if(order.status==='CANCELLED'){text('本單已取消，不列入採購需求。',left,y,11);y-=22;}
  text(`訂單編號：${order.number}`,left,y); y -= 20;
  const printedDate = new Date(new Date(order.createdAt).getTime() + 8*60*60*1000).toISOString().slice(0,19).replace('T',' ');
  text(`訂購日期：${printedDate}`,left,y); y -= 20;
  for(const value of wrapped(`攤位／店名：${order.stall}`,tableWidth,10)) { text(value,left,y); y-=17; }
  y-=18; header();
  for (const item of items) {
    const names = wrapped(item.productName,220,11), specs = wrapped(item.specification,168,10);
    const rowHeight = Math.max(names.length,specs.length)*18+18;
    ensureRoom(rowHeight);
    names.forEach((value,i)=>text(value,left+9,y-i*18,11));
    specs.forEach((value,i)=>text(value,left+245,y-i*18,10,muted));
    text(`${item.quantity.toLocaleString()} ${item.unit}`,left+426,y,12);
    y -= rowHeight;
    page!.drawLine({start:{x:left,y:y+15},end:{x:width-left,y:y+15},thickness:.5,color:line});
  }
  ensureRoom(75,false); y -= 14;
  text(`共 ${items.length} 項商品`,left,y,12);
  y-=24;
  for(const value of wrapped(`訂購數量：${formatUnits(unitTotals(order.items))}`,tableWidth,11)) { ensureRoom(22,false); text(value,left,y,11); y-=19; }
  if(items.some(i=>i.allocatedQuantity!=null)){
    ensureRoom(48,false);y-=14;text(order.fulfillmentConfirmation==='PENDING'?'配貨異動：待客戶確認':'目前配貨數量',left,y,12);y-=24;
    for(const item of items){for(const line of wrapped(`${item.productName}：原訂 ${item.quantity}，可配 ${item.allocatedQuantity??'待確認'} ${item.unit}`,tableWidth,11)){ensureRoom(22,false);text(line,left,y,11);y-=20;}}
  }
  if(order.notes){ y-=14; for(const value of wrapped(`備註：${order.notes}`,tableWidth,10)){ensureRoom(20,false);text(value,left,y,10,muted);y-=17;} }
  const pages = pdf.getPages();
  pages.forEach((p,i)=>p.drawText(`${order.demo ? '流程示範，非實際交易' : '請依商品規格核對數量'}   |   第 ${i+1} / ${pages.length} 頁`,{x:left,y:33,size:9,font,color:muted}));
  return pdf.save();
}
function wrapText(text: string, font: PDFFont, width: number, size: number) {
  const lines: string[] = []; let line = '';
  for(const char of text) { if(char === '\n'){ lines.push(line);line='';continue; } if(line && font.widthOfTextAtSize(line+char,size)>width){lines.push(line);line=char;}else line+=char; }
  lines.push(line); return lines;
}
export async function downloadOrderPdf(order: Order) {
  const response = await fetch('/fonts/DongmenSansTC-Regular.ttf');
  if(!response.ok) throw new Error('中文字型載入失敗，請稍後重試，或使用列印功能');
  const bytes = await makeOrderPdf(order, await response.arrayBuffer());
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/pdf'}));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${order.number}.pdf`; anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
