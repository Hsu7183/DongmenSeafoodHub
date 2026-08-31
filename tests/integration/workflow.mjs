import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const base = process.env.TEST_BASE_URL ?? process.env.APP_URL ?? 'http://localhost:3000';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname) || process.env.DEMO_MODE !== 'true') {
  throw new Error('Integration tests create persistent TEST records; run only against the local DEMO_MODE=true database.');
}
const stamp = new Date().toISOString().replace(/[^0-9]/g, '') + randomUUID().slice(0, 5);
const password = 'DemoOnly!2026';
const results = [];
const artifacts = path.join(root, '.runtime', 'verification');
await mkdir(artifacts, { recursive: true });

function check(name, condition) {
  assert.ok(condition, name);
  results.push({ name, passed: true });
  console.log(`PASS ${name}`);
}
function equal(name, actual, expected) {
  assert.deepEqual(actual, expected, name);
  results.push({ name, passed: true });
  console.log(`PASS ${name}`);
}
function forbiddenKeys(data, patterns) {
  if (!data || typeof data !== 'object') return [];
  return Object.entries(data).flatMap(([key, value]) => [
    ...(patterns.some(pattern => pattern.test(key)) && value !== null ? [key] : []),
    ...forbiddenKeys(value, patterns),
  ]);
}
const costPatterns = [/supplier_?cost/i, /^total_?cost$/i, /commission/i, /gross_?profit/i, /margin/i, /rebate/i, /base_?wholesale/i, /customer_?prices/i, /level_?prices/i];
const supplierPatterns = [/customer_?price/i, /customer_?revenue/i, /commission/i, /gross_?profit/i, /margin/i, /rebate/i, /base_?wholesale/i];

class Session {
  cookie = '';
  constructor(label) { this.label = label; }
  async request(route, method = 'GET', payload, expected = 200) {
    const response = await fetch(`${base}/api/${route}`, {
      method,
      headers: { 'content-type': 'application/json', origin: new URL(base).origin, ...(this.cookie ? { cookie: this.cookie } : {}) },
      ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
    });
    const cookie = response.headers.getSetCookie?.().find(value => value.startsWith('dongmen_session='));
    if (cookie) this.cookie = cookie.split(';')[0];
    const content = await response.text();
    let data;
    try { data = JSON.parse(content); } catch { data = { unexpectedResponse: content.slice(0, 250) }; }
    const acceptable = Array.isArray(expected) ? expected : [expected];
    assert.ok(acceptable.includes(response.status), `${this.label} ${method} /api/${route}: expected ${acceptable.join('/')}, got ${response.status}: ${JSON.stringify(data)}`);
    return data;
  }
  async login(email) {
    const data = await this.request('auth/login', 'POST', { email, password });
    check(`${this.label} signs in with a server session`, Boolean(this.cookie) && Boolean(data.user?.id));
    return data.user;
  }
  async pdf(kind, id, label, expected = 200) {
    const response = await fetch(`${base}/api/documents/${kind}/${id}`, { headers: this.cookie ? { cookie: this.cookie } : {} });
    assert.equal(response.status, expected, `${this.label} ${kind} PDF access`);
    if (expected !== 200) { check(label, true); return; }
    const bytes = Buffer.from(await response.arrayBuffer());
    check(label, response.headers.get('content-type')?.includes('application/pdf') && bytes.subarray(0, 4).toString() === '%PDF' && bytes.length > 1000);
    await writeFile(path.join(artifacts, `${kind}-${id}.pdf`), bytes);
  }
}

const admin = new Session('SUPER_ADMIN');
const customerA = new Session('CUSTOMER A');
const customerB = new Session('CUSTOMER B');
const supplier = new Session('SUPPLIER');
const otherSupplier = new Session('OTHER SUPPLIER');
const guest = new Session('GUEST');

try {
  const publicCatalog = await guest.request('products');
  equal('Public catalog never exposes supplier costs, commission, or margins', forbiddenKeys(publicCatalog, costPatterns), []);
  equal('Public catalog contains no customer selling prices', forbiddenKeys(publicCatalog, [/customer_?price/i, /^price$/i]), []);
  await guest.request('orders', 'GET', undefined, 401);
  check('Anonymous order access is denied', true);
  await guest.request('checkout-context', 'GET', undefined, 401);
  check('Anonymous checkout-context access is denied', true);

  await admin.login(process.env.TEST_ADMIN_EMAIL ?? 'admin@dongmen.test');
  const testSupplierEmail = `supplier-${stamp}@example.test`;
  const supplierCreated = await admin.request('admin/suppliers', 'POST', { name: `TEST 測試供應商 ${stamp}`, contactName: '測試窗口', phone: '0900000000', negotiationTargetAmount: 10000, email: testSupplierEmail, password }, [200, 201]);
  const testSupplier = supplierCreated.supplier ?? supplierCreated;
  check('Admin creates a supplier in PostgreSQL', Boolean(testSupplier.id));
  await admin.request('admin/import-products', 'POST', {
    supplierId: testSupplier.id, sourceType: 'WEBSITE', demo: false, authorizationConfirmed: true,
    rows: [{ name: 'TEST 未授權網站商品', sku: `UNAUTHORIZED-${stamp}`, specification: 'TEST', supplierCost: 100, baseWholesalePrice: 170, sourceUrl: 'https://www.haodingfisheries.com/products/example' }],
  }, 403);
  check('Formal supplier import stays blocked while SUPPLIER_CONTENT_AUTHORIZED=false', true);

  const sku = `TEST-${stamp}`;
  const importResult = await admin.request('admin/import-products', 'POST', {
    supplierId: testSupplier.id, sourceType: 'CSV', demo: true, authorizationConfirmed: false,
    rows: [{ name: `TEST 流程驗證水產 ${stamp}`, sku, specification: '500g / 測試用', packageUnit: '包', supplierCost: 100, baseWholesalePrice: 170, suggestedPrice: 190, moq: 1 }],
  }, [200, 201]);
  check('Admin imports a product through the authorized import API', !importResult.error);
  const adminCatalog = await admin.request('admin/products');
  const product = adminCatalog.products.find(item => item.variants?.some(variant => variant.sku === sku));
  const variant = product?.variants.find(item => item.sku === sku);
  check('Imported product and independent SKU exist', Boolean(product?.id && variant?.id));
  equal('Imported supplier cost is the explicit wholesale input', Number(variant.supplierCost), 100);
  equal('Demo import cannot publish external images', product.imageUrl ?? '', '');

  const createdCustomers = [];
  for (const [index, price] of [[0, 150], [1, 160]]) {
    const email = `test-${stamp}-${index}@example.test`;
    const created = await admin.request('admin/customers', 'POST', {
      companyName: `TEST 東門市場 ${index ? 'B' : 'A'}攤 ${stamp}`, stallName: `TEST ${index ? 'B' : 'A'}攤`,
      marketName: '東門市場', contactName: '整合測試', phone: '0900000000',
      deliveryAddress: `TEST ${index ? 'B' : 'A'} 配送地址，非真實訂單`, email, password, priceLevel: 'LEVEL_B', paymentTerms: '7天',
    }, [200, 201]);
    const customer = created.customer ?? created;
    check(`Admin creates customer ${index ? 'B' : 'A'} with login`, Boolean(customer.id));
    await admin.request('admin/prices', 'POST', { customerId: customer.id, variantId: variant.id, price }, [200, 201]);
    createdCustomers.push({ ...customer, email, price });
  }
  await customerA.login(createdCustomers[0].email);
  await customerB.login(createdCustomers[1].email);
  const checkout = await customerA.request('checkout-context');
  equal('Checkout context contains only customer-safe fields', Object.keys(checkout).sort(), ['customer', 'serviceFee', 'shippingFee']);
  equal('Checkout context never exposes internal pricing or commission', forbiddenKeys(checkout, costPatterns), []);
  equal('Checkout delivery address belongs to the signed-in customer', checkout.customer.deliveryAddress, createdCustomers[0].deliveryAddress);
  equal('Checkout service fee matches the administrator setting', Number(checkout.serviceFee), Number((await admin.request('admin/settings')).settings.serviceFee));
  equal('Checkout shipping fee is explicitly zero in this drop-ship MVP', Number(checkout.shippingFee), 0);
  const ownCatalog = await customerA.request('products');
  equal('Customer product API removes every confidential price field', forbiddenKeys(ownCatalog, costPatterns), []);
  const ownVariant = ownCatalog.products.flatMap(item => item.variants).find(item => item.id === variant.id);
  equal('Customer-specific price overrides wholesale and price levels', Number(ownVariant.customerPrice), 150);
  const otherCatalog = await customerB.request('products');
  const otherVariant = otherCatalog.products.flatMap(item => item.variants).find(item => item.id === variant.id);
  equal('A second customer gets only their own price', Number(otherVariant.customerPrice), 160);
  const favorites = await customerA.request('favorites', 'POST', { variantId: variant.id });
  check('Customer can save a frequently ordered SKU', favorites.variantIds.includes(variant.id));
  equal('Favorites are scoped to the customer', (await customerB.request('favorites')).variantIds.includes(variant.id), false);
  await customerA.request('admin/prices', 'GET', undefined, 403);
  await customerA.request('admin/dashboard', 'GET', undefined, 403);
  await customerA.request('admin/audit', 'GET', undefined, 403);
  check('Customer cannot access customer pricing administration, financial dashboard, or audit data', true);

  const deliveryDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const bodyA = { items: [{ variantId: variant.id, quantity: 20, customerPrice: 1, supplierCost: 0 }], customerId: createdCustomers[1].id, deliveryDate, deliveryAddress: 'TEST A 配送地址', idempotencyKey: `integration-A-${stamp}`, expectedTotal: 3000 };
  const bodyB = { items: [{ variantId: variant.id, quantity: 30 }], deliveryDate, deliveryAddress: 'TEST B 配送地址', idempotencyKey: `integration-B-${stamp}`, expectedTotal: 4800 };
  await customerA.request('orders', 'POST', { ...bodyA, idempotencyKey: `integration-stale-${stamp}`, expectedTotal: 2999 }, 409);
  check('Checkout rejects a stale expected total before creating an order', true);
  equal('Rejected stale checkout leaves no order behind', (await customerA.request('orders')).orders.length, 0);
  const orderA = (await customerA.request('orders', 'POST', bodyA, [200, 201])).order;
  const orderB = (await customerB.request('orders', 'POST', bodyB, [200, 201])).order;
  check('Two customers submit real database orders', Boolean(orderA?.id && orderB?.id));
  check('Orders use DM-YYYYMMDD-sequence numbers', /^DM-\d{8}-\d{4,}$/.test(orderA.orderNumber));
  equal('Customer A order totals 20 × 150', Number(orderA.totalAmount), 3000);
  equal('Customer cannot override their server-side customer ownership', orderA.customerId, createdCustomers[0].id);
  equal('Customer-supplied fake item prices are ignored by the server', Number(orderA.items[0].customerPrice), 150);
  equal('Customer B order totals 30 × 160', Number(orderB.totalAmount), 4800);
  equal('Order submission response does not leak internal financial snapshots', forbiddenKeys(orderA, costPatterns), []);
  const replay = (await customerA.request('orders', 'POST', bodyA, [200, 201])).order;
  equal('Repeated submit with same idempotency key never creates a duplicate', replay.id, orderA.id);
  await customerA.request(`orders/${orderB.id}`, 'GET', undefined, [403, 404]);
  check('Customer cannot read another customer order by guessed ID', true);
  const customerOrder = (await customerA.request(`orders/${orderA.id}`)).order;
  equal('Customer print-source data contains no costs or commission', forbiddenKeys(customerOrder, costPatterns), []);
  await customerA.pdf('order', orderA.id, 'Customer can export a real A4 order PDF');
  await customerA.pdf('admin-order', orderA.id, 'Customer cannot export the internal financial PDF', 403);
  await customerA.pdf('order', orderB.id, 'Customer cannot export another customer order PDF', 404);
  const orderListA = await customerA.request('orders');
  check('Customer order listing excludes the second customer order', !JSON.stringify(orderListA).includes(orderB.id));
  const reorder = await customerA.request(`orders/${orderA.id}/reorder`, 'POST', {});
  equal('Last-order refill returns the purchased SKU and quantity', reorder.items, [{ variantId: variant.id, quantity: 20 }]);
  const frequent = await customerA.request('frequent');
  check('Order history feeds the customer frequent-products list', frequent.variantIds.includes(variant.id));
  const adminOrderBefore = (await admin.request(`orders/${orderA.id}`)).order;
  equal('Admin order snapshot preserves unit supplier cost', Number(adminOrderBefore.items[0].supplierCost), 100);
  equal('Admin order snapshot preserves customer unit price', Number(adminOrderBefore.items[0].customerPrice), 150);
  equal('Admin gross profit is customer amount minus supplier cost', Number(adminOrderBefore.grossProfit), 1000);
  equal('Commission uses the snapshotted transaction amount and rate', Number(adminOrderBefore.commissionAmount), Math.round(3000 * Number(adminOrderBefore.items[0].commissionRate) * 100) / 100);
  await admin.pdf('admin-order', orderA.id, 'Admin can export a separate internal financial PDF');
  const quote = (await admin.request('quotations', 'POST', {
    customerId: createdCustomers[0].id, validUntil: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    paymentTerms: '7天', deliveryTerms: 'TEST 供應商直送', items: [{ variantId: variant.id, quantity: 20, price: 150 }],
  }, [200, 201])).quotation;
  equal('Admin creates a customer quotation with a validity period', Number(quote.totalAmount), 3000);
  await customerA.pdf('quotation', quote.id, 'Customer can export their own quotation PDF');
  await customerB.pdf('quotation', quote.id, 'Another customer cannot export the quotation PDF', 404);

  for (const order of [orderA, orderB]) await admin.request(`orders/${order.id}`, 'PATCH', { status: 'CONFIRMED' });
  const aggregates = await admin.request('purchase-orders', 'POST', { orderIds: [orderA.id, orderB.id] }, [200, 201]);
  const purchaseOrder = aggregates.purchaseOrders.find(item => item.supplierId === testSupplier.id);
  check('Admin aggregates customer orders into one supplier PO', Boolean(purchaseOrder?.id));
  equal('Supplier PO has one merged SKU with 50 units', purchaseOrder.items.length === 1 ? Number(purchaseOrder.items[0].quantity) : -1, 50);
  equal('Supplier PO wholesale total is 50 × 100', Number(purchaseOrder.totalCost), 5000);
  equal('PO allocation preserves each customer quantity', purchaseOrder.items[0].allocations.map(item => Number(item.quantity)).sort((a, b) => a - b), [20, 30]);
  equal('Supplier-facing PO omits customer selling prices and commission', forbiddenKeys(purchaseOrder, supplierPatterns), []);
  await admin.pdf('po', purchaseOrder.id, 'Admin can export an aggregated supplier purchase-order PDF');
  await customerA.pdf('po', purchaseOrder.id, 'Customer cannot export supplier cost documents', 403);
  await admin.request('purchase-orders', 'POST', { orderIds: [orderA.id, orderB.id] }, [400, 409]);
  check('Already allocated order items cannot be aggregated twice', true);

  // Catalog edits must never rewrite historical trade terms.
  await admin.request(`admin/products/${product.id}`, 'PATCH', {
    ...product, variants: [{ ...variant, supplierCost: 125, baseWholesalePrice: 180 }],
  });
  await admin.request('admin/prices', 'POST', { customerId: createdCustomers[0].id, variantId: variant.id, price: 175 }, [200, 201]);
  const adminOrderAfter = (await admin.request(`orders/${orderA.id}`)).order;
  for (const field of ['supplierCost', 'customerPrice', 'commissionRate', 'commissionAmount']) {
    equal(`Historical ${field} remains immutable after catalog price changes`, adminOrderAfter.items[0][field], adminOrderBefore.items[0][field]);
  }
  equal('Historical revenue does not change after catalog edits', adminOrderAfter.totalAmount, adminOrderBefore.totalAmount);
  equal('Historical gross profit does not change after catalog edits', adminOrderAfter.grossProfit, adminOrderBefore.grossProfit);

  const supplierUser = await supplier.login(testSupplierEmail);
  await supplier.request('checkout-context', 'GET', undefined, 403);
  check('Supplier cannot retrieve a customer checkout context', true);
  for (const status of ['CONFIRMED', 'PREPARING', 'SHIPPED', 'DELIVERED', 'COMPLETED']) {
    await supplier.request(`purchase-orders/${purchaseOrder.id}`, 'PATCH', { status });
  }
  equal('Supplier fulfillment advances allocated customer orders to completion', (await customerB.request(`orders/${orderB.id}`)).order.status, 'COMPLETED');
  await admin.request('payments', 'POST', { orderId: orderA.id, amount: 0.001, method: 'CASH' }, 400);
  check('Subcent payment that would round to zero is rejected', true);
  await admin.request('payments', 'POST', { orderId: orderA.id, amount: 1000, method: 'BANK_TRANSFER', reference: `TEST-PARTIAL-${stamp}` }, [200, 201]);
  equal('Partial receipt sets PARTIAL payment status', (await admin.request(`orders/${orderA.id}`)).order.paymentStatus, 'PARTIAL');
  await admin.request('payments', 'POST', { orderId: orderA.id, amount: 2000, method: 'BANK_TRANSFER', reference: `TEST-FINAL-${stamp}` }, [200, 201]);
  const completeOrder = (await admin.request(`orders/${orderA.id}`)).order;
  equal('Completed fulfillment is reflected in the admin order', completeOrder.status, 'COMPLETED');
  equal('Full receipt sets PAID payment status', completeOrder.paymentStatus, 'PAID');
  await admin.request('payments', 'POST', { orderId: orderA.id, amount: 1, method: 'CASH' }, [400, 409, 422]);
  check('Overpayment is rejected', true);
  const ledger = (await admin.request('commissions')).commissions.filter(item => item.orderId === orderA.id);
  check('Fulfillment completion confirms the commission ledger', ledger.length === 1 && ledger[0].status === 'CONFIRMED');
  equal('Commission ledger agrees with the immutable order snapshot', Number(ledger[0].commissionAmount), Number(adminOrderBefore.commissionAmount));
  await admin.request(`commissions/${ledger[0].id}`, 'PATCH', { status: 'PAID' });
  equal('Admin records commission settlement', (await admin.request('commissions')).commissions.find(item => item.id === ledger[0].id).status, 'PAID');
  await customerA.request('commissions', 'GET', undefined, 403);
  await customerA.request('payments', 'GET', undefined, 403);
  check('Customers cannot query the platform commission ledger or other receipts', true);

  const supplierCatalog = await supplier.request('products');
  equal('Supplier catalog never exposes customer selling prices or platform commission', forbiddenKeys(supplierCatalog, supplierPatterns), []);
  check('Supplier catalog contains only its own products', supplierCatalog.products.every(item => item.supplierId === supplierUser.supplierId));
  const foreignProduct = adminCatalog.products.find(item => item.supplierId !== testSupplier.id);
  check('Supplier catalog hides another supplier product', Boolean(foreignProduct) && !JSON.stringify(supplierCatalog).includes(foreignProduct.id));
  await otherSupplier.login(process.env.TEST_SUPPLIER_EMAIL ?? 'supplier@dongmen.test');
  await otherSupplier.request(`purchase-orders/${purchaseOrder.id}`, 'GET', undefined, [403, 404]);
  await otherSupplier.pdf('po', purchaseOrder.id, 'Supplier cannot export another supplier purchase-order PDF', 404);
  await supplier.request('admin/dashboard', 'GET', undefined, 403);
  check('Supplier cannot access another supplier PO or platform financial dashboard', true);
  const supplierOrders = await supplier.request('purchase-orders');
  equal('Supplier PO API never includes customer transaction prices', forbiddenKeys(supplierOrders, supplierPatterns), []);
  if (supplierOrders.purchaseOrders[0]) await supplier.pdf('po', supplierOrders.purchaseOrders[0].id, 'Supplier can export its own supplier PO PDF');

  const dashboard = await admin.request('admin/dashboard');
  const metrics = dashboard.dashboard ?? dashboard;
  const skuMetric = metrics.skuVolumes.find(item => item.sku === sku);
  equal('Dashboard counts 50 units of the tested SKU', skuMetric.quantity, 50);
  equal('Dashboard customer revenue uses immutable order prices', Number(skuMetric.revenue), 7800);
  equal('Dashboard supplier cost uses immutable order costs', Number(skuMetric.supplierCost), 5000);
  equal('Dashboard gross profit is 7800 minus 5000', Number(skuMetric.grossProfit), 2800);
  const supplierMetric = metrics.supplierVolumes.find(item => item.supplierId === testSupplier.id);
  equal('Dashboard supplier purchasing volume is 50', supplierMetric.quantity, 50);
  equal('Dashboard supplier purchasing amount is 5000', Number(supplierMetric.amount), 5000);
  equal('Dashboard uses the supplier-specific negotiation amount target', Number(supplierMetric.targetAmount), 10000);
  equal('Dashboard remaining amount is target minus snapshotted purchase cost', Number(supplierMetric.remainingAmount), 5000);
  equal('Dashboard amount target progress is 50 percent', Number(supplierMetric.amountProgress), 50);
  const audits = await admin.request('admin/audit');
  for (const entity of ['Supplier', 'Product', 'Customer', 'CustomerPrice', 'Order', 'PurchaseOrder', 'Payment', 'Commission', 'Quotation']) {
    check(`${entity} operations have an audit record`, audits.auditLogs.some(item => item.entity === entity));
  }
  const priceAudit = audits.auditLogs.find(item => item.entity === 'Product' && item.entityId === product.id && item.action === 'UPDATE');
  check('Supplier cost edit audit preserves both old and new values', Number(priceAudit?.oldValue?.variants?.[0]?.supplierCost) === 100 && Number(priceAudit?.newValue?.variants?.[0]?.supplierCost) === 125);
  await admin.request('admin/audit', 'PATCH', { id: audits.auditLogs[0].id, newValue: {} }, 404);
  check('Audit history has no update API even for administrators', true);
  await admin.request('admin/settings', 'PATCH', { launchReady: true }, 400);
  check('Formal publication is blocked while legal data and Demo mode are unresolved', true);
  const settings = await admin.request('admin/settings');
  check('Demo platform has not bypassed the launch/legal review gate', (settings.settings ?? settings).launchReady === false);
  await admin.request(`admin/products/${product.id}`, 'PATCH', { active: false });
  check('Successful test product is softly disabled to keep the catalog clean', !(await admin.request('products')).products.some(item => item.id === product.id));
  equal('Test catalog cleanup preserves historical order snapshots', (await admin.request(`orders/${orderA.id}`)).order.totalAmount, adminOrderBefore.totalAmount);

  const report = {
    passed: true, completedAt: new Date().toISOString(), checks: results.length,
    records: { supplierId: testSupplier.id, productId: product.id, variantId: variant.id, orderIds: [orderA.id, orderB.id], purchaseOrderId: purchaseOrder.id },
    totals: { units: 50, customerRevenue: 7800, supplierCost: 5000, grossProfit: 2800, commissionA: Number(adminOrderBefore.commissionAmount) },
    results,
  };
  await writeFile(path.join(artifacts, 'integration-report.json'), JSON.stringify(report, null, 2));
  console.log(`\nIntegration workflow passed: ${results.length} checks. Report: .runtime/verification/integration-report.json`);
} catch (error) {
  await writeFile(path.join(artifacts, 'integration-report.json'), JSON.stringify({ passed: false, completedAt: new Date().toISOString(), checks: results.length, results, error: String(error) }, null, 2));
  console.error(error);
  process.exitCode = 1;
}
