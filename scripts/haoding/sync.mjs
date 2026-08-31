import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// No website price is read by this program. The approved content manifest and
// the separately negotiated wholesale workbook have different trust roles.
const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifestPath = option('--manifest');
const wholesalePath = option('--wholesale');
if (process.env.SUPPLIER_CONTENT_AUTHORIZED !== 'true') {
  throw new Error('SUPPLIER_CONTENT_AUTHORIZED is not true. Formal sync is blocked; only haoding:preview is allowed.');
}
if (!args.includes('--confirm-authorization')) throw new Error('An administrator must explicitly pass --confirm-authorization after obtaining supplier rights.');
if (!manifestPath || !wholesalePath) throw new Error('Provide --manifest authorized-products.json --wholesale HaodingWholesalePrice.xlsx.');
if (path.basename(wholesalePath).toLowerCase() !== 'haodingwholesaleprice.xlsx') throw new Error('Costs must come from the separately supplied HaodingWholesalePrice.xlsx workbook.');
const { default: ExcelJS } = await import('exceljs');
const manifest = JSON.parse(await readFile(path.resolve(manifestPath), 'utf8'));
if (!manifest.authorizationReference?.trim() || manifest.authorizationConfirmed !== true || !manifest.supplierId) {
  throw new Error('Manifest requires supplierId, authorizationConfirmed:true, and the reference to the supplier authorization record.');
}
if (!Array.isArray(manifest.rows) || !manifest.rows.length || manifest.rows.length > 500) throw new Error('Approved content manifest must contain 1–500 rows.');

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(path.resolve(wholesalePath));
const sheet = workbook.worksheets[0];
if (!sheet) throw new Error('Wholesale workbook has no worksheet.');
const headers = new Map();
sheet.getRow(1).eachCell((cell, column) => headers.set(String(cell.value).trim().toLowerCase(), column));
for (const key of ['sku', 'supplier_cost', 'base_wholesale_price']) if (!headers.has(key)) throw new Error(`Wholesale workbook is missing ${key}.`);
const costs = new Map();
sheet.eachRow((row, rowNumber) => {
  if (rowNumber === 1) return;
  const sku = String(row.getCell(headers.get('sku')).value ?? '').trim();
  if (!sku) return;
  if (costs.has(sku)) throw new Error(`Duplicate wholesale SKU at row ${rowNumber}.`);
  const values = {};
  for (const [column, field] of [['supplier_cost', 'supplierCost'], ['base_wholesale_price', 'baseWholesalePrice'], ['suggested_price', 'suggestedPrice']]) {
    const raw = headers.has(column) ? row.getCell(headers.get(column)).value : null;
    if (raw === null && field === 'suggestedPrice') continue;
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) throw new Error(`Wholesale row ${rowNumber} ${column} must be a nonnegative numeric cell (no formulas).`);
    values[field] = raw;
  }
  costs.set(sku, values);
});

const seenSkus = new Set();
const rows = manifest.rows.map((content) => {
  if (!content.sku || !content.name || !content.specification) throw new Error('Each approved row requires sku, name, and specification.');
  if (seenSkus.has(content.sku)) throw new Error(`Duplicate approved content SKU ${content.sku}.`);
  seenSkus.add(content.sku);
  const sourceUrl = new URL(content.sourceUrl);
  if (sourceUrl.protocol !== 'https:' || !['www.haodingfisheries.com', 'haodingfisheries.com'].includes(sourceUrl.hostname)) throw new Error('Each approved row must retain its original HTTPS Haoding sourceUrl.');
  const wholesale = costs.get(content.sku);
  if (!wholesale) throw new Error(`Missing negotiated wholesale cost for SKU ${content.sku}; retail prices are never a fallback.`);
  if (content.imageUrl) {
    const imageUrl = new URL(content.imageUrl);
    if (imageUrl.protocol !== 'https:' || !(manifest.authorizedImageHosts ?? []).includes(imageUrl.hostname)) throw new Error(`Image host for ${content.sku} is not listed in authorizedImageHosts.`);
  }
  // Whitelist content fields so an untrusted manifest cannot smuggle prices.
  const selected = Object.fromEntries(['sku', 'name', 'shortName', 'brand', 'categoryId', 'description', 'origin', 'specification', 'weight', 'packageUnit', 'caseQuantity', 'moq', 'storageMethod', 'temperature', 'imageUrl', 'sourceUrl', 'supplierProductCode', 'supplierProductId'].filter(key => content[key] !== undefined).map(key => [key, content[key]]));
  return { ...selected, ...wholesale, suggestedPrice: wholesale.suggestedPrice ?? wholesale.baseWholesalePrice, supplierUrl: sourceUrl.toString(), authorizationStatus: 'AUTHORIZED', imageSource: content.imageUrl ? 'AUTHORIZED_URL' : 'PLACEHOLDER', imageAuthorized: Boolean(content.imageUrl) };
});
const payload = { supplierId: manifest.supplierId, sourceType: 'WEBSITE', authorizationConfirmed: true, demo: false, authorizationReference: manifest.authorizationReference, rows };
const output = path.join(root, '.runtime', 'haoding');
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'authorized-import.json'), JSON.stringify(payload, null, 2));
console.log(`Prepared ${rows.length} reviewed records in .runtime/haoding/authorized-import.json. Downloaded images: 0.`);
if (!args.includes('--apply')) {
  console.log('No database changes. Review the manifest and use --apply only when an administrator is ready to import.');
} else {
  const base = process.env.APP_URL ?? 'http://localhost:3000';
  const url = new URL(base);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Admin authentication requires HTTPS outside localhost.');
  if (!process.env.SYNC_ADMIN_EMAIL || !process.env.SYNC_ADMIN_PASSWORD) throw new Error('Supply SYNC_ADMIN_EMAIL and SYNC_ADMIN_PASSWORD through the environment, never CLI arguments.');
  const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: url.origin }, body: JSON.stringify({ email: process.env.SYNC_ADMIN_EMAIL, password: process.env.SYNC_ADMIN_PASSWORD }) });
  if (!login.ok) throw new Error(`Admin authentication failed with HTTP ${login.status}.`);
  const user = (await login.json()).user;
  if (user?.role !== 'SUPER_ADMIN') throw new Error('Official supplier synchronization requires a SUPER_ADMIN account.');
  const cookie = login.headers.getSetCookie().find(value => value.startsWith('dongmen_session='))?.split(';')[0];
  if (!cookie) throw new Error('The login response did not set an administrator session.');
  try {
    const response = await fetch(`${base}/api/admin/import-products`, { method: 'POST', headers: { 'content-type': 'application/json', origin: url.origin, cookie }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error(`Authorized import failed with HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    console.log('Authorized import completed through the audited administrator API.');
  } finally {
    await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { 'content-type': 'application/json', origin: url.origin, cookie }, body: '{}' });
  }
}
