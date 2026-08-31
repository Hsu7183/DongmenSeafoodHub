import { test } from 'vitest';
import assert from 'node:assert/strict';
import { canTransition, decimal, isStaff, legalMissing, lineSnapshot, money, ownsCustomer, ownsSupplier, resolvePrice } from '../lib/server/domain';
import { orderDTO, purchaseOrderDTO } from '../lib/server/data';
import type { SessionUser } from '../lib/server/auth';
import { z } from 'zod';
import { submittedFields } from '../lib/server/validation';

const now = new Date('2026-08-31T01:00:00Z');
const priceInput = { supplierCost: 80, baseWholesalePrice: 110, now };
test('customer valid override wins over price level and base', () => {
  const result = resolvePrice({ ...priceInput, level: { mode: 'FIXED', value: 100 }, override: { price: 92, validFrom: new Date('2026-01-01'), validTo: null } });
  assert.equal(result.toFixed(2), '92.00');
});
test('expired/future override ignored; level precedes base', () => {
  assert.equal(resolvePrice({ ...priceInput, level: { mode: 'FIXED', value: 100 }, override: { price: 1, validFrom: new Date('2026-01-01'), validTo: new Date('2026-02-01') } }).toNumber(), 100);
  assert.equal(resolvePrice({ ...priceInput, override: { price: 1, validFrom: new Date('2027-01-01'), validTo: null } }).toNumber(), 110);
});
test('cost plus and gross margin pricing use correct denominator', () => {
  assert.equal(resolvePrice({ ...priceInput, level: { mode: 'COST_PLUS', value: 15 } }).toNumber(), 95);
  assert.equal(resolvePrice({ ...priceInput, level: { mode: 'MARGIN', value: 0.2 } }).toNumber(), 100);
  assert.throws(() => resolvePrice({ ...priceInput, level: { mode: 'MARGIN', value: 1 } }));
});
test('decimal currency avoids binary floating point loss and rounds half-up', () => {
  assert.equal(money(decimal('0.1').plus('0.2')).toFixed(2), '0.30');
  assert.equal(money('1.005').toFixed(2), '1.01');
  const result = lineSnapshot({ quantity: 3, price: '19.99', cost: '12.35', rate: '0.05' });
  assert.equal(result.lineTotal.toFixed(2), '59.97');
  assert.equal(result.totalCost.toFixed(2), '37.05');
  assert.equal(result.grossProfit.toFixed(2), '22.92');
  assert.equal(result.commission.toFixed(2), '3.00');
});
test('fixed commission per unit and independent rebate are supported', () => {
  const result = lineSnapshot({ quantity: 20, price: 100, cost: 70, rate: 0.05, fixedCommission: 8, rebateRate: 0.01 });
  assert.equal(result.commission.toNumber(), 160);
  assert.equal(result.rebate.toNumber(), 14);
});
test('state machine rejects backwards, skipped and terminal transitions', () => {
  assert.equal(canTransition('SUBMITTED', 'CONFIRMED'), true);
  assert.equal(canTransition('SUBMITTED', 'COMPLETED'), false);
  assert.equal(canTransition('COMPLETED', 'SUBMITTED'), false);
  assert.equal(canTransition('ORDERED_TO_SUPPLIER', 'CANCELLED'), false);
});
test('customer cannot access another customer or supplier and supplier cannot cross scope', () => {
  assert.equal(ownsCustomer('CUSTOMER', 'A', 'A'), true);
  assert.equal(ownsCustomer('CUSTOMER', 'A', 'B'), false);
  assert.equal(ownsCustomer('SUPPLIER', null, 'A'), false);
  assert.equal(ownsSupplier('SUPPLIER', 'A', 'B'), false);
  assert.equal(ownsSupplier('CUSTOMER', null, 'A'), false);
  assert.equal(isStaff('CUSTOMER'), false);
  assert.equal(isStaff('SUPER_ADMIN'), true);
});
test('formal launch cannot pass an incomplete business checklist', () => {
  assert.ok(legalMissing({}).includes('foodRegistrationNumber'));
  assert.ok(legalMissing({ businessName: 'x', legalReviewConfirmed: false }).includes('legalReviewConfirmed'));
});
test('PATCH does not reactivate or reset fields omitted by the administrator', () => {
  const schema = z.object({ name: z.string(), active: z.boolean().default(true), authorizationStatus: z.string().default('PENDING') });
  const input = { name: 'Renamed only' };
  const patch = submittedFields(schema.partial().parse(input), input);
  const existing = { name: 'Previous', active: false, authorizationStatus: 'AUTHORIZED' };
  assert.deepEqual({ ...existing, ...patch }, { name: 'Renamed only', active: false, authorizationStatus: 'AUTHORIZED' });
});

const customer: SessionUser = { id: 'u1', name: 'demo', email: 'customer@dongmen.test', role: 'CUSTOMER', customerId: 'c1', supplierId: null };
const staff: SessionUser = { ...customer, role: 'SUPER_ADMIN', customerId: null };
const fullOrder = {
  id: 'o1', orderNumber: 'DM-20260831-0001', customerId: 'c1', status: 'SUBMITTED', paymentStatus: 'UNPAID', totalAmount: decimal(200), totalCost: decimal(120), grossProfit: decimal(80), commissionAmount: decimal(10), serviceFee: decimal(0), shippingFee: decimal(0), businessModelSnapshot: 'COMMISSION', createdAt: now, updatedAt: now, dueDate: new Date('2099-01-01'), deliveryDate: now, deliveryMethod: 'supplier_delivery', deliveryTime: '06:00', deliveryAddress: 'Demo address', driver: '', trackingNote: '', notes: '', paymentTerms: '7天', idempotencyKey: 'secret-key',
  customer: { id: 'c1', companyName: 'A', stallName: 'A1', marketName: '東門', contactName: 'demo', phone: '0', email: '', taxId: '', invoiceTitle: '', deliveryAddress: 'Demo address' }, payments: [],
  items: [{ id: 'i1', orderId: 'o1', variantId: 'v1', supplierId: 's1', sku: 'SKU1', productName: 'Demo product', specification: '300g', packageUnit: '包', quantity: 2, supplierCostSnapshot: decimal(60), customerPriceSnapshot: decimal(100), commissionRateSnapshot: decimal(0.05), commissionAmountSnapshot: decimal(10), rebateRateSnapshot: decimal(0), rebateAmountSnapshot: decimal(0), lineTotal: decimal(200) }],
} as unknown as Parameters<typeof orderDTO>[0];
test('CUSTOMER order serializer excludes supplier_cost, commission and margin at every depth', () => {
  const payload = JSON.stringify(orderDTO(fullOrder, customer));
  for (const forbidden of ['supplierCost', 'supplier_cost', 'totalCost', 'grossProfit', 'grossMargin', 'commission', 'rebate', 'idempotencyKey']) assert.equal(payload.includes(forbidden), false, `leaked ${forbidden}`);
  assert.equal(JSON.parse(payload).items[0].customerPrice, 100);
});
test('staff order retains frozen financial snapshots for financial print', () => {
  const payload = orderDTO(fullOrder, staff);
  assert.equal(payload.totalCost, 120);
  assert.equal(payload.items[0].supplierCost, 60);
  assert.equal(payload.commissionAmount, 10);
});
test('supplier PO serializer includes cost but excludes customer sales and platform finance', () => {
  const po = {
    id: 'po1', poNumber: 'PO1', supplierId: 's1', supplier: { id: 's1', name: 'Demo supplier', contactName: 'Demo', phone: '0' }, status: 'SUBMITTED', totalCost: decimal(120), notes: '', createdAt: now,
    items: [{ id: 'pi1', variantId: 'v1', sku: 'SKU1', productName: 'Demo product', specification: '300g', packageUnit: '包', quantity: 2, supplierCost: decimal(60), lineTotal: decimal(120), allocations: [{ quantity: 2, orderItem: { ...fullOrder.items[0], order: fullOrder } }] }],
  } as unknown as Parameters<typeof purchaseOrderDTO>[0];
  const payload = JSON.stringify(purchaseOrderDTO(po));
  assert.ok(payload.includes('supplierCost'));
  for (const forbidden of ['customerPrice', 'customer_price', 'commission', 'grossProfit', 'margin', 'totalAmount', 'priceLevel', 'creditLimit']) assert.equal(payload.includes(forbidden), false, `leaked ${forbidden}`);
});
