import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Preview deliberately persists structure only: no product descriptions, prices,
// image URLs, images, or publishable catalog content.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = 'https://www.haodingfisheries.com/products';
const response = await fetch(source, {
  redirect: 'manual',
  signal: AbortSignal.timeout(20_000),
  headers: { 'user-agent': 'DongmenSeafoodHub/0.1 (single-page structure preview; no image download)' },
});
if (!response.ok) {
  throw new Error(`Preview returned HTTP ${response.status}; no automatic redirects, crawling, or publication performed.`);
}
if (!response.headers.get('content-type')?.includes('text/html')) throw new Error('Expected a public HTML page.');
const chunks = [];
let bytes = 0;
for await (const chunk of response.body) {
  bytes += chunk.byteLength;
  if (bytes > 2_000_000) throw new Error('Preview exceeds the 2 MB safety limit.');
  chunks.push(chunk);
}
const html = Buffer.concat(chunks).toString('utf8');
const links = new Set();
for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)) {
  if (match[1].includes('{{') || match[1].includes('}}')) continue;
  try {
    const url = new URL(match[1].replaceAll('&amp;', '&'), source);
    if (url.origin === new URL(source).origin && /^\/products\//.test(url.pathname)) {
      url.search = '';
      url.hash = '';
      links.add(url.toString());
    }
  } catch { /* Invalid public hrefs are irrelevant to the preview. */ }
}
const metadata = {
  supplier: '昊鼎水產', supplier_url: source, source_type: 'WEBSITE_STRUCTURE_PREVIEW',
  source_updated_at: new Date().toISOString(), authorization_status: 'NOT_AUTHORIZED_PREVIEW_ONLY',
  http_status: response.status, received_bytes: bytes,
  structure: {
    anchor_count: (html.match(/<a\b/gi) ?? []).length,
    product_link_count: links.size,
    json_ld_blocks: (html.match(/application\/ld\+json/gi) ?? []).length,
    image_element_count: (html.match(/<img\b/gi) ?? []).length,
  },
  sample_product_urls: [...links].slice(0, 12),
  images_downloaded: 0, products_imported: 0, prices_extracted: 0,
  note: '僅供人工確認公開網站結構。不是商品匯入檔，不包含可發布圖片或文案。官網售價不可作為供應商成本。',
};
const output = path.join(root, '.runtime', 'haoding');
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'preview.json'), JSON.stringify(metadata, null, 2));
console.log(JSON.stringify(metadata, null, 2));
