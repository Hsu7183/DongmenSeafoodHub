import { Prisma } from '@prisma/client';
import { db } from './db';
import { ApiError, requireStaff, requireUser, SessionUser } from './auth';
import { amount, decimal, isStaff, legalMissing, money, ownsCustomer, ownsSupplier, resolvePrice } from './domain';

const orderInclude = { customer: true, items: true, payments: true } satisfies Prisma.OrderInclude;
type FullOrder = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
export function orderDTO(order: FullOrder, user: SessionUser) {
  const staff = isStaff(user.role);
  const paidAmount = order.payments.reduce((sum, payment) => sum.plus(payment.amount.toString()), decimal(0));
  const paymentStatus = paidAmount.gte(order.totalAmount.toString()) ? 'PAID' : order.dueDate < new Date() && order.status !== 'CANCELLED' ? 'OVERDUE' : paidAmount.gt(0) ? 'PARTIAL' : 'UNPAID';
  return {
    id: order.id, orderNumber: order.orderNumber, customerId: order.customerId, status: order.status,
    paymentStatus, totalAmount: amount(order.totalAmount), paidAmount: amount(paidAmount), balance: amount(decimal(order.totalAmount).minus(paidAmount)),
    createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString(),
    deliveryMethod: order.deliveryMethod, deliveryDate: order.deliveryDate.toISOString(), deliveryTime: order.deliveryTime,
    deliveryAddress: order.deliveryAddress, driver: order.driver, shippingFee: amount(order.shippingFee), serviceFee: amount(order.serviceFee),
    trackingNote: order.trackingNote, notes: order.notes, paymentTerms: order.paymentTerms, dueDate: order.dueDate.toISOString(),
    customer: { id: order.customer.id, companyName: order.customer.companyName, stallName: order.customer.stallName, marketName: order.customer.marketName, contactName: order.customer.contactName, phone: order.customer.phone, email: order.customer.email, taxId: order.customer.taxId, invoiceTitle: order.customer.invoiceTitle, deliveryAddress: order.customer.deliveryAddress },
    items: order.items.map(item => ({
      id: item.id, variantId: item.variantId, sku: item.sku, productName: item.productName, specification: item.specification,
      packageUnit: item.packageUnit, quantity: item.quantity, customerPrice: amount(item.customerPriceSnapshot), lineTotal: amount(item.lineTotal),
      ...(staff ? { supplierId: item.supplierId, supplierCost: amount(item.supplierCostSnapshot), commissionRate: Number(item.commissionRateSnapshot), commissionAmount: amount(item.commissionAmountSnapshot), grossProfit: amount(decimal(item.lineTotal).minus(decimal(item.supplierCostSnapshot).mul(item.quantity))), rebateAmount: amount(item.rebateAmountSnapshot) } : {}),
    })),
    payments: order.payments.map(payment => ({ id: payment.id, amount: amount(payment.amount), method: payment.method, reference: payment.reference, paidAt: payment.paidAt.toISOString() })),
    ...(staff ? { totalCost: amount(order.totalCost), grossProfit: amount(order.grossProfit), grossMargin: order.totalAmount.gt(0) ? decimal(order.grossProfit).div(order.totalAmount.toString()).toNumber() : 0, commissionAmount: amount(order.commissionAmount), businessModel: order.businessModelSnapshot } : {}),
  };
}
export async function getOrderForUser(id: string, user: SessionUser | null) {
  requireUser(user);
  if (user.role === 'SUPPLIER') throw new ApiError(403, '請使用供應商採購單');
  const order = await db.order.findUnique({ where: { id }, include: orderInclude });
  if (!order || !ownsCustomer(user.role, user.customerId, order.customerId)) throw new ApiError(404, '找不到訂單');
  return orderDTO(order, user);
}
export async function getOrders(user: SessionUser | null) {
  requireUser(user);
  if (user.role === 'SUPPLIER') throw new ApiError(403, '請使用供應商採購單');
  const orders = await db.order.findMany({ where: isStaff(user.role) ? {} : { customerId: user.customerId ?? '__none__' }, include: orderInclude, orderBy: { createdAt: 'desc' }, take: 500 });
  return { orders: orders.map(order => orderDTO(order, user)) };
}

const poInclude = { supplier: true, items: { include: { allocations: { include: { orderItem: { include: { order: { include: { customer: true } } } } } } } } } satisfies Prisma.PurchaseOrderInclude;
type FullPO = Prisma.PurchaseOrderGetPayload<{ include: typeof poInclude }>;
export function purchaseOrderDTO(po: FullPO) {
  return {
    id: po.id, poNumber: po.poNumber, supplierId: po.supplierId, supplier: { id: po.supplier.id, name: po.supplier.name, contactName: po.supplier.contactName, phone: po.supplier.phone },
    status: po.status, totalCost: amount(po.totalCost), notes: po.notes, createdAt: po.createdAt.toISOString(),
    totalQuantity: po.items.reduce((sum, item) => sum + item.quantity, 0),
    items: po.items.map(item => ({ id: item.id, variantId: item.variantId, sku: item.sku, productName: item.productName, specification: item.specification, packageUnit: item.packageUnit, quantity: item.quantity, supplierCost: amount(item.supplierCost), lineTotal: amount(item.lineTotal),
      allocations: item.allocations.map(allocation => ({ quantity: allocation.quantity, orderId: allocation.orderItem.orderId, orderNumber: allocation.orderItem.order.orderNumber, customerName: allocation.orderItem.order.customer.companyName, stallName: allocation.orderItem.order.customer.stallName, contactName: allocation.orderItem.order.customer.contactName, phone: allocation.orderItem.order.customer.phone, deliveryAddress: allocation.orderItem.order.deliveryAddress, deliveryDate: allocation.orderItem.order.deliveryDate.toISOString(), deliveryTime: allocation.orderItem.order.deliveryTime, supplierCost: amount(allocation.orderItem.supplierCostSnapshot) })),
    })),
  };
}
export async function getPurchaseOrderForUser(id: string, user: SessionUser | null) {
  requireUser(user);
  if (user.role === 'CUSTOMER') throw new ApiError(403, '您沒有供應商採購權限');
  const po = await db.purchaseOrder.findUnique({ where: { id }, include: poInclude });
  if (!po || !ownsSupplier(user.role, user.supplierId, po.supplierId)) throw new ApiError(404, '找不到供應商採購單');
  return purchaseOrderDTO(po);
}
export async function getPurchaseOrders(user: SessionUser | null) {
  requireUser(user);
  if (user.role === 'CUSTOMER') throw new ApiError(403, '您沒有供應商採購權限');
  const purchaseOrders = await db.purchaseOrder.findMany({ where: isStaff(user.role) ? {} : { supplierId: user.supplierId ?? '__none__' }, include: poInclude, orderBy: { createdAt: 'desc' }, take: 500 });
  return { purchaseOrders: purchaseOrders.map(purchaseOrderDTO) };
}

export async function getProducts(user: SessionUser | null, admin = false) {
  if (admin) requireStaff(user);
  const customer = user?.role === 'CUSTOMER' && user.customerId ? await db.customer.findUnique({ where: { id: user.customerId } }) : null;
  const where: Prisma.ProductWhereInput = admin ? {} : { active: true };
  if (user?.role === 'SUPPLIER') where.supplierId = user.supplierId ?? '__none__';
  // Non-demo publication requires administrator's completed release checklist.
  if (!admin && process.env.DEMO_MODE !== 'true') {
    const settings = await db.platformSetting.findUnique({ where: { id: 'main' } });
    if (!settings?.launchReady || legalMissing(settings).length) return { products: [], categories: [], suppliers: [] };
    where.authorizationStatus = { in: ['AUTHORIZED', 'OWN_CONTENT'] };
  }
  const rows = await db.product.findMany({ where, include: { category: true, supplier: true, variants: { where: admin ? {} : { active: true }, include: { levelPrices: true, customerPrices: { where: { customerId: customer?.id ?? '__none__', validFrom: { lte: new Date() }, OR: [{ validTo: null }, { validTo: { gte: new Date() } }] }, orderBy: { validFrom: 'desc' } } } } }, orderBy: { createdAt: 'asc' }, take: 1000 });
  const products = rows.map(product => ({
    id: product.id, name: product.name, shortName: product.shortName, brand: product.brand, origin: product.origin, description: product.description,
    category: { id: product.category.id, name: product.category.name }, categoryId: product.categoryId,
    supplier: { id: product.supplier.id, name: product.supplier.name }, supplierId: product.supplierId,
    storageMethod: product.storageMethod, temperature: product.temperature, imageUrl: product.imageAuthorized || product.imageSource === 'PLACEHOLDER' ? product.imageUrl : '', imageSource: product.imageSource, imageAuthorized: product.imageAuthorized,
    available: product.available && product.supplier.active, active: product.active, supplierStockStatus: product.supplierStockStatus,
    ...(admin ? { supplierProductCode: product.supplierProductCode, supplierProductId: product.supplierProductId, supplierUrl: product.supplierUrl, sourceType: product.sourceType, sourceUpdatedAt: product.sourceUpdatedAt, authorizationStatus: product.authorizationStatus, sourceUrl: product.sourceUrl } : {}),
    variants: product.variants.map(variant => ({
      id: variant.id, sku: variant.sku, specification: variant.specification, weight: variant.weight, packageUnit: variant.packageUnit, caseQuantity: variant.caseQuantity, moq: variant.moq,
      ...(customer ? { customerPrice: amount(resolvePrice({ supplierCost: variant.supplierCost, baseWholesalePrice: variant.baseWholesalePrice, override: variant.customerPrices[0], level: variant.levelPrices.find(level => level.level === customer.priceLevel) })) } : {}),
      ...(admin ? { supplierCost: amount(variant.supplierCost), baseWholesalePrice: amount(variant.baseWholesalePrice), suggestedPrice: amount(variant.suggestedPrice), commissionRate: variant.commissionRate === null ? null : Number(variant.commissionRate), fixedCommission: variant.fixedCommission === null ? null : amount(variant.fixedCommission), active: variant.active } : {}),
      ...(user?.role === 'SUPPLIER' ? { supplierCost: amount(variant.supplierCost) } : {}),
    })),
  }));
  const categories = await db.category.findMany({ where: admin ? {} : { active: true }, orderBy: { sortOrder: 'asc' } });
  const suppliers = user?.role === 'SUPPLIER'
    ? await db.supplier.findMany({ where: { id: user.supplierId ?? '__none__' }, select: { id: true, name: true } })
    : await db.supplier.findMany({ where: { active: true }, select: { id: true, name: true } });
  return { products, categories, suppliers };
}

export async function getQuotationForUser(id: string, user: SessionUser | null) {
  requireUser(user);
  const quote = await db.quotation.findUnique({ where: { id }, include: { customer: true } });
  if (!quote || !ownsCustomer(user.role, user.customerId, quote.customerId)) throw new ApiError(404, '找不到報價單');
  return { id: quote.id, quoteNumber: quote.quoteNumber, customerId: quote.customerId, customer: { id: quote.customer.id, companyName: quote.customer.companyName, stallName: quote.customer.stallName, contactName: quote.customer.contactName, phone: quote.customer.phone, deliveryAddress: quote.customer.deliveryAddress }, validUntil: quote.validUntil.toISOString(), paymentTerms: quote.paymentTerms, deliveryTerms: quote.deliveryTerms, notes: quote.notes, totalAmount: amount(quote.totalAmount), createdAt: quote.createdAt.toISOString(), items: quote.items };
}

export async function getDashboard(user: SessionUser | null) {
  requireStaff(user);
  const now = new Date();
  const taipei = new Date(now.getTime() + 8 * 3600000);
  const today = new Date(Date.UTC(taipei.getUTCFullYear(), taipei.getUTCMonth(), taipei.getUTCDate()) - 8 * 3600000);
  const month = new Date(Date.UTC(taipei.getUTCFullYear(), taipei.getUTCMonth(), 1) - 8 * 3600000);
  const week = new Date(today.getTime() - ((taipei.getUTCDay() + 6) % 7) * 86400000);
  const [orders, customers, commissions, tiers] = await Promise.all([
    db.order.findMany({ where: { status: { notIn: ['CANCELLED', 'DRAFT'] } }, include: orderInclude }),
    db.customer.findMany(), db.commission.findMany({ where: { order: { status: { not: 'CANCELLED' } } }, include: { supplier: true } }),
    db.volumeTier.findMany({ include: { supplier: true }, orderBy: { minQuantity: 'asc' } }),
  ]);
  const monthly = orders.filter(order => order.createdAt >= month);
  const sum = (rows: typeof orders, key: 'totalAmount' | 'totalCost' | 'grossProfit' | 'commissionAmount') => amount(rows.reduce((n, row) => n.plus(row[key].toString()), decimal(0)));
  const monthRevenue = sum(monthly, 'totalAmount');
  const monthCost = sum(monthly, 'totalCost');
  const monthProfit = sum(monthly, 'grossProfit');
  const bySku = new Map<string, { sku: string; productName: string; specification: string; quantity: number; revenue: number; supplierCost: number; grossProfit: number }>();
  const bySupplier = new Map<string, { supplierId: string; name: string; quantity: number; amount: number }>();
  const byMarket = new Map<string, { marketName: string; orders: number; revenue: number }>();
  const byCustomer = new Map<string, { customerId: string; companyName: string; stallName: string; orders: number; revenue: number }>();
  const allSuppliers = await db.supplier.findMany({ select: { id: true, name: true, negotiationTargetAmount: true } });
  for (const order of monthly) {
    const market = byMarket.get(order.customer.marketName) ?? { marketName: order.customer.marketName, orders: 0, revenue: 0 };
    market.orders++; market.revenue = amount(decimal(market.revenue).plus(order.totalAmount.toString())); byMarket.set(market.marketName, market);
    const customer = byCustomer.get(order.customerId) ?? { customerId: order.customerId, companyName: order.customer.companyName, stallName: order.customer.stallName, orders: 0, revenue: 0 };
    customer.orders++; customer.revenue = amount(decimal(customer.revenue).plus(order.totalAmount.toString())); byCustomer.set(order.customerId, customer);
    for (const item of order.items) {
      const cost = decimal(item.supplierCostSnapshot).mul(item.quantity);
      const sku = bySku.get(item.sku) ?? { sku: item.sku, productName: item.productName, specification: item.specification, quantity: 0, revenue: 0, supplierCost: 0, grossProfit: 0 };
      sku.quantity += item.quantity; sku.revenue = amount(decimal(sku.revenue).plus(item.lineTotal.toString())); sku.supplierCost = amount(decimal(sku.supplierCost).plus(cost)); sku.grossProfit = amount(decimal(sku.revenue).minus(sku.supplierCost)); bySku.set(item.sku, sku);
      const supplier = bySupplier.get(item.supplierId) ?? { supplierId: item.supplierId, name: allSuppliers.find(s => s.id === item.supplierId)?.name ?? '', quantity: 0, amount: 0 };
      supplier.quantity += item.quantity; supplier.amount = amount(decimal(supplier.amount).plus(cost)); bySupplier.set(item.supplierId, supplier);
    }
  }
  const receivables = orders.map(order => { const paid = order.payments.reduce((n, p) => n.plus(p.amount.toString()), decimal(0)); return { order, balance: money(decimal(order.totalAmount).minus(paid)) }; }).filter(row => row.balance.gt(0));
  const activeCustomers = byCustomer.size;
  const repeatCustomers = [...byCustomer.values()].filter(customer => customer.orders > 1).length;
  const supplierVolumes = allSuppliers.map(supplier => {
    const volume = bySupplier.get(supplier.id) ?? { supplierId: supplier.id, name: supplier.name, quantity: 0, amount: 0 };
    const supplierTiers = tiers.filter(t => t.supplierId === supplier.id);
    const currentTier = [...supplierTiers].reverse().find(t => t.minQuantity <= volume.quantity);
    const nextTier = supplierTiers.find(t => t.minQuantity > volume.quantity);
    const targetAmount = amount(supplier.negotiationTargetAmount);
    return { ...volume, targetAmount, remainingAmount: targetAmount > 0 ? Math.max(0, amount(decimal(targetAmount).minus(volume.amount))) : 0, amountProgress: targetAmount > 0 ? Math.min(100, volume.amount / targetAmount * 100) : 0, currentTier: currentTier?.name ?? '尚未達門檻', nextTier: nextTier?.name ?? null, nextThreshold: nextTier?.minQuantity ?? null, remainingQuantity: nextTier ? nextTier.minQuantity - volume.quantity : 0, progress: nextTier ? Math.min(100, volume.quantity / nextTier.minQuantity * 100) : 100, commissionRate: Number(currentTier?.commissionRate ?? 0), rebateRate: Number(currentTier?.rebateRate ?? 0) };
  });
  const monthlyCommissions = commissions.filter(c => c.createdAt >= month);
  const commissionSum = (rows: typeof commissions) => amount(rows.reduce((n, c) => n.plus(c.commissionAmount.toString()), decimal(0)));
  const revenueTrend = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today.getTime() - (6 - index) * 86400000);
    const end = new Date(date.getTime() + 86400000);
    return { date: new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10), revenue: sum(orders.filter(o => o.createdAt >= date && o.createdAt < end), 'totalAmount'), orders: orders.filter(o => o.createdAt >= date && o.createdAt < end).length };
  });
  return { todayOrders: orders.filter(o => o.createdAt >= today).length, todayRevenue: sum(orders.filter(o => o.createdAt >= today), 'totalAmount'), weekRevenue: sum(orders.filter(o => o.createdAt >= week), 'totalAmount'), monthRevenue, monthCost, monthGrossProfit: monthProfit, monthCommission: commissionSum(monthlyCommissions),
    gmv: monthRevenue, grossProfit: monthProfit, grossMargin: monthRevenue ? decimal(monthProfit).div(monthRevenue).toNumber() : 0, commissionRevenue: commissionSum(monthlyCommissions), totalOrders: monthly.length, averageOrderValue: monthly.length ? amount(decimal(monthRevenue).div(monthly.length)) : 0,
    customerCount: customers.length, activeCustomers, repeatCustomers, repeatPurchaseRate: activeCustomers ? repeatCustomers / activeCustomers : 0,
    outstandingReceivables: amount(receivables.reduce((n, r) => n.plus(r.balance), decimal(0))), overdueReceivables: amount(receivables.filter(r => r.order.dueDate < now).reduce((n, r) => n.plus(r.balance), decimal(0))), todayReceivables: amount(receivables.filter(r => r.order.dueDate >= today && r.order.dueDate < new Date(today.getTime() + 86400000)).reduce((n, r) => n.plus(r.balance), decimal(0))),
    pendingCommission: commissionSum(commissions.filter(c => c.status !== 'PAID')), paidCommission: commissionSum(commissions.filter(c => c.status === 'PAID')),
    weekPurchaseAmount: sum(orders.filter(o => o.createdAt >= week), 'totalCost'), monthPurchaseAmount: monthCost,
    topProducts: [...bySku.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10), skuVolumes: [...bySku.values()], topCustomers: [...byCustomer.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10), markets: [...byMarket.values()], supplierVolumes, volumeTierProgress: supplierVolumes, revenueTrend,
    recentOrders: orders.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 8).map(order => orderDTO(order, user)),
  };
}
