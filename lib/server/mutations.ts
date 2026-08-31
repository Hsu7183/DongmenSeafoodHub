import { Prisma, OrderStatus } from '@prisma/client';
import { z } from 'zod';
import { db } from './db';
import { ApiError, requireStaff, requireUser, SessionUser } from './auth';
import { amount, canTransition, decimal, isStaff, legalMissing, lineSnapshot, money, ownsCustomer, ownsSupplier, resolvePrice } from './domain';
import { getOrderForUser, getPurchaseOrderForUser, getQuotationForUser } from './data';

export const currency = z.coerce.number().finite().min(0).max(99999999);
export const fraction = z.coerce.number().finite().min(0).max(1);
export const textField = z.string().trim().max(2000);
export const idField = z.string().min(1).max(100);
export const dateField = z.coerce.date();
export type Tx = Prisma.TransactionClient;
export async function audit(tx: Tx, user: SessionUser, action: string, entity: string, entityId: string, oldValue: unknown, newValue: unknown) {
  const safeJson = (value: unknown) => value == null ? Prisma.JsonNull : JSON.parse(JSON.stringify(value));
  await tx.auditLog.create({ data: { userId: user.id, userName: user.name, action, entity, entityId, oldValue: safeJson(oldValue), newValue: safeJson(newValue) } });
}
export async function serializable<T>(callback: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return await db.$transaction(callback, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 }); }
    catch (error) { if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034' || attempt === 3) throw error; }
  }
  throw new ApiError(409, '資料同時被更新，請重試');
}
export async function nextNumber(tx: Tx, prefix: string, date = new Date()) {
  const dateString = new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10).replaceAll('-', '');
  const counter = await tx.dailySequence.upsert({ where: { key: `${prefix}-${dateString}` }, create: { key: `${prefix}-${dateString}`, value: 1 }, update: { value: { increment: 1 } } });
  return `${prefix}-${dateString}-${counter.value.toString().padStart(4, '0')}`;
}

const orderSchema = z.object({
  items: z.array(z.object({ variantId: idField, quantity: z.coerce.number().int().min(1).max(100000) })).min(1).max(200),
  deliveryDate: dateField, deliveryTime: textField.default('06:00–10:00'), deliveryAddress: textField.min(1),
  deliveryMethod: z.enum(['supplier_delivery', 'platform_delivery', 'customer_pickup']).default('supplier_delivery'),
  notes: textField.default(''), idempotencyKey: z.string().min(8).max(150), customerId: idField.optional(),
  expectedTotal: currency.optional(),
});
export async function createOrder(raw: unknown, user: SessionUser | null) {
  requireUser(user);
  if (user.role === 'SUPPLIER') throw new ApiError(403, '供應商不能建立客戶訂單');
  const data = orderSchema.parse(raw);
  const customerId = isStaff(user.role) ? data.customerId : user.customerId;
  if (!customerId) throw new ApiError(400, '請指定客戶');
  if (data.deliveryDate.getTime() < Date.now() - 86400000 || data.deliveryDate.getTime() > Date.now() + 366 * 86400000) throw new ApiError(400, '配送日期不在有效範圍');
  const existing = await db.order.findUnique({ where: { customerId_idempotencyKey: { customerId, idempotencyKey: data.idempotencyKey } } });
  if (existing) return { order: await getOrderForUser(existing.id, user), duplicate: true };
  try {
    const id = await serializable(async tx => {
      const customer = await tx.customer.findUnique({ where: { id: customerId } });
      if (!customer || customer.status !== 'ACTIVE') throw new ApiError(403, '客戶帳戶尚未啟用');
      const settings = await tx.platformSetting.upsert({ where: { id: 'main' }, create: {}, update: {} });
      if (process.env.DEMO_MODE !== 'true' && (!settings.launchReady || legalMissing(settings).length)) throw new ApiError(403, '正式交易尚未開放：請先完成上線檢核');
      const quantities = new Map<string, number>();
      for (const item of data.items) quantities.set(item.variantId, (quantities.get(item.variantId) ?? 0) + item.quantity);
      const now = new Date();
      const variants = await tx.productVariant.findMany({ where: { id: { in: [...quantities.keys()] } }, include: { product: { include: { supplier: true } }, levelPrices: true, customerPrices: { where: { customerId, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gte: now } }] }, orderBy: { validFrom: 'desc' } } } });
      if (variants.length !== quantities.size) throw new ApiError(400, '採購單含不存在的商品');
      const supplierIds = [...new Set(variants.map(v => v.product.supplierId))];
      const monthTaipei = new Date(now.getTime() + 8 * 3600000);
      const monthStart = new Date(Date.UTC(monthTaipei.getUTCFullYear(), monthTaipei.getUTCMonth(), 1) - 8 * 3600000);
      const [tiers, historical] = await Promise.all([
        tx.volumeTier.findMany({ where: { supplierId: { in: supplierIds } }, orderBy: { minQuantity: 'desc' } }),
        tx.orderItem.groupBy({ by: ['supplierId'], where: { supplierId: { in: supplierIds }, order: { createdAt: { gte: monthStart }, status: { notIn: ['DRAFT', 'CANCELLED'] } } }, _sum: { quantity: true } }),
      ]);
      const items = variants.map(variant => {
        const quantity = quantities.get(variant.id)!;
        if (!variant.active || !variant.product.active || !variant.product.available || !variant.product.supplier.active) throw new ApiError(400, `${variant.product.name} 目前無法供貨`);
        if (process.env.DEMO_MODE !== 'true' && !['AUTHORIZED', 'OWN_CONTENT'].includes(variant.product.authorizationStatus)) throw new ApiError(403, `${variant.product.name} 尚未完成正式商品授權`);
        if (quantity < variant.moq || quantity > 100000) throw new ApiError(400, `${variant.product.name} 最低訂購量為 ${variant.moq}`);
        const accumulated = historical.find(h => h.supplierId === variant.product.supplierId)?._sum.quantity ?? 0;
        const tier = tiers.find(t => t.supplierId === variant.product.supplierId && t.minQuantity <= accumulated && (t.maxQuantity === null || accumulated <= t.maxQuantity));
        const cost = money(decimal(variant.supplierCost).mul(decimal(1).minus(tier?.supplierDiscount.toString() ?? '0')));
        const price = resolvePrice({ supplierCost: variant.supplierCost, baseWholesalePrice: variant.baseWholesalePrice, override: variant.customerPrices[0], level: variant.levelPrices.find(level => level.level === customer.priceLevel), now });
        const rate = settings.businessModel === 'COMMISSION' ? decimal(variant.commissionRate ?? tier?.commissionRate ?? settings.commissionRate) : decimal(0);
        const totals = lineSnapshot({ quantity, price, cost, rate, fixedCommission: settings.businessModel === 'COMMISSION' ? variant.fixedCommission : null, rebateRate: tier?.rebateRate ?? 0 });
        return { variantId: variant.id, supplierId: variant.product.supplierId, sku: variant.sku, productName: variant.product.name, specification: variant.specification, packageUnit: variant.packageUnit, quantity,
          supplierCostSnapshot: cost.toFixed(2), customerPriceSnapshot: price.toFixed(2), commissionRateSnapshot: rate.toFixed(4), commissionAmountSnapshot: totals.commission.toFixed(2), rebateRateSnapshot: (tier?.rebateRate ?? decimal(0)).toString(), rebateAmountSnapshot: totals.rebate.toFixed(2), lineTotal: totals.lineTotal.toFixed(2) };
      });
      const merchandise = items.reduce((sum, item) => sum.plus(item.lineTotal), decimal(0));
      const totalAmount = money(merchandise.plus(settings.serviceFee.toString()));
      if (data.expectedTotal !== undefined && !money(data.expectedTotal).eq(totalAmount)) throw new ApiError(409, '商品價格或服務費已更新，請重新確認採購單金額');
      const totalCost = items.reduce((sum, item) => sum.plus(decimal(item.supplierCostSnapshot).mul(item.quantity)), decimal(0));
      const commissionAmount = items.reduce((sum, item) => sum.plus(item.commissionAmountSnapshot), decimal(0));
      const termsDays = customer.paymentTerms.includes('現金') ? 0 : customer.paymentTerms.includes('月結') ? 30 : Number(customer.paymentTerms.match(/\d+/)?.[0] ?? 7);
      if (customer.creditLimit.gt(0)) {
        const outstanding = await tx.order.findMany({ where: { customerId, status: { not: 'CANCELLED' }, paymentStatus: { not: 'PAID' } }, include: { payments: true } });
        const balance = outstanding.reduce((sum, order) => sum.plus(order.totalAmount.toString()).minus(order.payments.reduce((n, p) => n.plus(p.amount.toString()), decimal(0))), decimal(0));
        if (balance.plus(totalAmount).gt(customer.creditLimit.toString())) throw new ApiError(400, '超過客戶信用額度，請聯繫業務');
      }
      const order = await tx.order.create({ data: {
        orderNumber: await nextNumber(tx, 'DM'), customerId, idempotencyKey: data.idempotencyKey, businessModelSnapshot: settings.businessModel,
        totalAmount: totalAmount.toFixed(2), totalCost: money(totalCost).toFixed(2), grossProfit: money(totalAmount.minus(totalCost)).toFixed(2), commissionAmount: money(commissionAmount).toFixed(2), serviceFee: settings.serviceFee,
        deliveryMethod: data.deliveryMethod, deliveryDate: data.deliveryDate, deliveryTime: data.deliveryTime, deliveryAddress: data.deliveryAddress, notes: data.notes, paymentTerms: customer.paymentTerms, dueDate: new Date(data.deliveryDate.getTime() + termsDays * 86400000), items: { create: items },
      } });
      for (const supplierId of supplierIds) {
        const supplierItems = items.filter(item => item.supplierId === supplierId);
        const revenue = supplierItems.reduce((sum, item) => sum.plus(item.lineTotal), decimal(0));
        const commission = supplierItems.reduce((sum, item) => sum.plus(item.commissionAmountSnapshot), decimal(0));
        const rebate = supplierItems.reduce((sum, item) => sum.plus(item.rebateAmountSnapshot), decimal(0));
        await tx.commission.create({ data: { supplierId, orderId: order.id, customerId, orderAmount: money(revenue).toFixed(2), commissionRate: revenue.gt(0) ? commission.div(revenue).toFixed(4) : '0', commissionAmount: money(commission).toFixed(2), rebateAmount: money(rebate).toFixed(2) } });
      }
      await audit(tx, user, 'CREATE', 'Order', order.id, null, { orderNumber: order.orderNumber, customerId, totalAmount: order.totalAmount, items });
      await tx.notificationOutbox.create({ data: { event: 'ORDER_SUBMITTED', entityId: order.id, payload: { orderNumber: order.orderNumber, customerId } } });
      return order.id;
    });
    return { order: await getOrderForUser(id, user) };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const duplicate = await db.order.findUnique({ where: { customerId_idempotencyKey: { customerId, idempotencyKey: data.idempotencyKey } } });
      if (duplicate) return { order: await getOrderForUser(duplicate.id, user), duplicate: true };
    }
    throw error;
  }
}

export async function updateOrder(id: string, raw: unknown, user: SessionUser | null) {
  requireUser(user);
  const data = z.object({ status: z.nativeEnum(OrderStatus).optional(), deliveryDate: dateField.optional(), deliveryTime: textField.optional(), deliveryAddress: textField.min(1).optional(), driver: textField.optional(), trackingNote: textField.optional(), notes: textField.optional() }).parse(raw);
  await serializable(async tx => {
    const old = await tx.order.findUnique({ where: { id }, include: { items: { include: { allocation: true } }, payments: true } });
    if (!old || !ownsCustomer(user.role, user.customerId, old.customerId)) throw new ApiError(404, '找不到訂單');
    if (!isStaff(user.role) && (data.status !== 'CANCELLED' || Object.keys(data).some(k => k !== 'status'))) throw new ApiError(403, '客戶僅能取消尚未備貨的訂單');
    if (data.status && data.status !== old.status && !canTransition(old.status, data.status)) throw new ApiError(400, '不允許跳過或回復訂單狀態');
    if (data.status === 'ORDERED_TO_SUPPLIER' && old.items.some(item => !item.allocation)) throw new ApiError(400, '請先建立供應商彙總採購單');
    if (data.status === 'CANCELLED' && (old.items.some(item => item.allocation) || old.payments.length)) throw new ApiError(400, '已採購或已有收款的訂單不能直接取消');
    const updated = await tx.order.update({ where: { id }, data });
    await audit(tx, user, 'UPDATE', 'Order', id, { status: old.status, notes: old.notes, deliveryDate: old.deliveryDate, deliveryAddress: old.deliveryAddress }, data);
    if (updated.status === 'COMPLETED') await tx.commission.updateMany({ where: { orderId: id, status: 'PENDING' }, data: { status: 'CONFIRMED' } });
    if (data.status) await tx.notificationOutbox.create({ data: { event: `ORDER_${data.status}`, entityId: id, payload: { customerId: old.customerId } } });
  });
  return { order: await getOrderForUser(id, user) };
}

export async function createPurchaseOrders(raw: unknown, user: SessionUser | null) {
  requireStaff(user);
  const { orderIds } = z.object({ orderIds: z.array(idField).min(1).max(500) }).parse(raw);
  const ids = await serializable(async tx => {
    const orders = await tx.order.findMany({ where: { id: { in: [...new Set(orderIds)] } }, include: { items: { include: { allocation: true } } } });
    if (orders.length !== new Set(orderIds).size) throw new ApiError(404, '部分訂單不存在');
    if (orders.some(order => !['SUBMITTED', 'CONFIRMED', 'ORDERED_TO_SUPPLIER'].includes(order.status))) throw new ApiError(400, '僅能彙總已提交或確認的訂單');
    const pending = orders.flatMap(order => order.items).filter(item => !item.allocation);
    if (!pending.length) throw new ApiError(409, '這些訂單已全部建立採購單，不會重複採購');
    const result: string[] = [];
    for (const supplierId of [...new Set(pending.map(item => item.supplierId))]) {
      const supplierItems = pending.filter(item => item.supplierId === supplierId);
      const po = await tx.purchaseOrder.create({ data: { poNumber: await nextNumber(tx, 'PO'), supplierId, totalCost: money(supplierItems.reduce((sum, item) => sum.plus(decimal(item.supplierCostSnapshot).mul(item.quantity)), decimal(0))).toFixed(2) } });
      for (const variantId of [...new Set(supplierItems.map(item => item.variantId))]) {
        const sources = supplierItems.filter(item => item.variantId === variantId);
        const quantity = sources.reduce((sum, item) => sum + item.quantity, 0);
        const lineTotal = money(sources.reduce((sum, item) => sum.plus(decimal(item.supplierCostSnapshot).mul(item.quantity)), decimal(0)));
        await tx.purchaseOrderItem.create({ data: {
          purchaseOrderId: po.id, variantId, sku: sources[0].sku, productName: sources[0].productName, specification: sources[0].specification, packageUnit: sources[0].packageUnit, quantity,
          supplierCost: money(lineTotal.div(quantity)).toFixed(2), lineTotal: lineTotal.toFixed(2), allocations: { create: sources.map(item => ({ orderItemId: item.id, quantity: item.quantity })) },
        } });
      }
      await audit(tx, user, 'AGGREGATE', 'PurchaseOrder', po.id, null, { poNumber: po.poNumber, supplierId, orderIds, totalCost: po.totalCost });
      result.push(po.id);
    }
    for (const order of orders) {
      await tx.order.update({ where: { id: order.id }, data: { status: 'ORDERED_TO_SUPPLIER' } });
      await audit(tx, user, 'UPDATE', 'Order', order.id, { status: order.status }, { status: 'ORDERED_TO_SUPPLIER' });
    }
    return result;
  });
  return { purchaseOrders: await Promise.all(ids.map(id => getPurchaseOrderForUser(id, user))) };
}

export async function updatePurchaseOrder(id: string, raw: unknown, user: SessionUser | null) {
  requireUser(user);
  const data = z.object({ status: z.enum(['SUBMITTED', 'CONFIRMED', 'PREPARING', 'SHIPPED', 'DELIVERED', 'COMPLETED']).optional(), notes: textField.optional() }).parse(raw);
  const ranks = ['SUBMITTED', 'CONFIRMED', 'PREPARING', 'SHIPPED', 'DELIVERED', 'COMPLETED'];
  await serializable(async tx => {
    const old = await tx.purchaseOrder.findUnique({ where: { id } });
    if (!old || !ownsSupplier(user.role, user.supplierId, old.supplierId)) throw new ApiError(404, '找不到供應商採購單');
    if (data.status && data.status !== old.status && ranks.indexOf(data.status) !== ranks.indexOf(old.status) + 1) throw new ApiError(400, '請依供應商履約順序更新狀態');
    await tx.purchaseOrder.update({ where: { id }, data });
    await audit(tx, user, 'UPDATE', 'PurchaseOrder', id, { status: old.status, notes: old.notes }, data);
    if (data.status) {
      const allocations = await tx.purchaseAllocation.findMany({ where: { purchaseOrderItem: { purchaseOrderId: id } }, include: { orderItem: true } });
      for (const orderId of [...new Set(allocations.map(a => a.orderItem.orderId))]) {
        const allItems = await tx.orderItem.findMany({ where: { orderId }, include: { allocation: { include: { purchaseOrderItem: { include: { purchaseOrder: true } } } } } });
        if (allItems.some(item => !item.allocation)) continue;
        const leastRank = Math.min(...allItems.map(item => ranks.indexOf(item.allocation!.purchaseOrderItem.purchaseOrder.status)));
        const status = leastRank <= 1 ? 'ORDERED_TO_SUPPLIER' : ranks[leastRank] as OrderStatus;
        const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
        const orderRanks = ['DRAFT', 'SUBMITTED', 'CONFIRMED', 'ORDERED_TO_SUPPLIER', 'PREPARING', 'SHIPPED', 'DELIVERED', 'COMPLETED'];
        if (orderRanks.indexOf(status) > orderRanks.indexOf(order.status)) {
          await tx.order.update({ where: { id: orderId }, data: { status } });
          await audit(tx, user, 'SUPPLIER_FULFILLMENT', 'Order', orderId, { status: order.status }, { status });
          if (status === 'COMPLETED') await tx.commission.updateMany({ where: { orderId, status: 'PENDING' }, data: { status: 'CONFIRMED' } });
        }
      }
    }
  });
  return { purchaseOrder: await getPurchaseOrderForUser(id, user) };
}

export async function createPayment(raw: unknown, user: SessionUser | null) {
  requireStaff(user);
  const data = z.object({ orderId: idField, amount: currency.positive(), method: z.enum(['CASH', 'BANK_TRANSFER', 'MONTHLY_SETTLEMENT', 'OTHER']).default('BANK_TRANSFER'), reference: textField.default(''), notes: textField.default(''), paidAt: dateField.optional() }).parse(raw);
  if (!money(data.amount).gt(0)) throw new ApiError(400, '收款金額至少為 NT$0.01');
  const payment = await serializable(async tx => {
    const order = await tx.order.findUnique({ where: { id: data.orderId }, include: { payments: true } });
    if (!order || order.status === 'CANCELLED') throw new ApiError(400, '訂單不存在或已取消');
    const paid = order.payments.reduce((sum, p) => sum.plus(p.amount.toString()), decimal(0));
    const nextPaid = paid.plus(money(data.amount));
    if (nextPaid.gt(order.totalAmount.toString())) throw new ApiError(400, '收款金額不能超過未收款餘額');
    const record = await tx.payment.create({ data: { ...data, amount: money(data.amount).toFixed(2) } });
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus: nextPaid.eq(order.totalAmount.toString()) ? 'PAID' : 'PARTIAL' } });
    await audit(tx, user, 'CREATE', 'Payment', record.id, null, record);
    return record;
  });
  return { payment, order: await getOrderForUser(data.orderId, user) };
}

export async function createQuotation(raw: unknown, user: SessionUser | null) {
  requireStaff(user);
  const data = z.object({ customerId: idField, validUntil: dateField, paymentTerms: textField.optional(), deliveryTerms: textField.default('供應商直送；交貨日期另行確認'), notes: textField.default(''), items: z.array(z.object({ variantId: idField, quantity: z.coerce.number().int().positive().max(100000), price: currency })).min(1).max(200) }).parse(raw);
  if (data.validUntil < new Date()) throw new ApiError(400, '報價效期不能早於今天');
  const id = await serializable(async tx => {
    const customer = await tx.customer.findUnique({ where: { id: data.customerId } });
    if (!customer) throw new ApiError(404, '找不到客戶');
    const variants = await tx.productVariant.findMany({ where: { id: { in: data.items.map(item => item.variantId) } }, include: { product: true } });
    const items = data.items.map(item => { const variant = variants.find(v => v.id === item.variantId); if (!variant) throw new ApiError(400, '商品規格不存在'); return { variantId: variant.id, sku: variant.sku, productName: variant.product.name, specification: variant.specification, packageUnit: variant.packageUnit, quantity: item.quantity, price: amount(item.price), customerPrice: amount(item.price), lineTotal: amount(decimal(item.price).mul(item.quantity)) }; });
    const quote = await tx.quotation.create({ data: { quoteNumber: await nextNumber(tx, 'Q'), customerId: data.customerId, validUntil: data.validUntil, paymentTerms: data.paymentTerms ?? customer.paymentTerms, deliveryTerms: data.deliveryTerms, notes: data.notes, totalAmount: money(items.reduce((sum, item) => sum.plus(item.lineTotal), decimal(0))).toFixed(2), items } });
    await audit(tx, user, 'CREATE', 'Quotation', quote.id, null, quote);
    return quote.id;
  });
  return { quotation: await getQuotationForUser(id, user) };
}
