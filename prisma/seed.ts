import 'dotenv/config';
import { PrismaClient, Prisma, OrderStatus, Customer, Product, ProductVariant, Category } from '@prisma/client';
import { hash } from 'bcryptjs';
import { decimal, money, lineSnapshot } from '../lib/server/domain';

const db = new PrismaClient();
const demoPassword = 'DemoOnly!2026';
async function main() {
  if (process.env.DEMO_MODE !== 'true' || process.env.NODE_ENV === 'production') throw new Error('Seed is demo-only. DEMO_MODE=true and a non-production runtime are required.');
  const demoExists = await db.user.findUnique({ where: { email: 'admin@dongmen.test' } });
  if (demoExists) { console.log('Demo accounts already exist; existing data preserved.'); return; }
  const passwordHash = await hash(demoPassword, 12);
  await db.$transaction(async tx => {
    await tx.platformSetting.upsert({ where: { id: 'main' }, update: {}, create: { businessModel: 'COMMISSION', inventoryMode: 'DROP_SHIP', commissionRate: '0.05', serviceFee: 0 } });
    const categoryNames = ['魚類', '蝦類', '蟹類', '貝類', '軟體類', '冷凍水產', '生鮮水產', '調理食品', '火鍋料', '肉品', '其他冷凍食品'];
    const categories: Category[] = [];
    for (let index = 0; index < categoryNames.length; index++) categories.push(await tx.category.upsert({ where: { name: categoryNames[index] }, update: {}, create: { id: `category-${index + 1}`, name: categoryNames[index], sortOrder: index } }));
    const supplier = await tx.supplier.create({ data: { id: 'supplier-haoding-demo', name: '昊鼎水產（示範佔位）', contactName: '供應商示範窗口', phone: '待供應商填寫', authorizationStatus: 'DEMO', negotiationTargetAmount: 500000 } });
    const supplier2 = await tx.supplier.create({ data: { id: 'supplier-second-demo', name: '第二示範供應商', contactName: '示範窗口 B', phone: '待供應商填寫', authorizationStatus: 'DEMO', negotiationTargetAmount: 100000 } });
    await tx.user.createMany({ data: [
      { id: 'user-admin-demo', name: '平台管理員', email: 'admin@dongmen.test', passwordHash, role: 'SUPER_ADMIN' },
      { id: 'user-sales-demo', name: '東門採購業務', email: 'sales@dongmen.test', passwordHash, role: 'SALES' },
      { id: 'user-supplier-demo', name: '供應商示範帳號', email: 'supplier@dongmen.test', passwordHash, role: 'SUPPLIER', supplierId: supplier.id },
      { id: 'user-supplier2-demo', name: '第二供應商帳號', email: 'supplier2@dongmen.test', passwordHash, role: 'SUPPLIER', supplierId: supplier2.id },
    ] });
    const customers: Customer[] = [];
    for (let index = 0; index < 10; index++) {
      const letter = String.fromCharCode(65 + index);
      const customer = await tx.customer.create({ data: {
        id: `customer-demo-${index + 1}`, companyName: `${index < 8 ? '東門市場' : index === 8 ? '南門市場' : '示範餐廳'} ${letter}攤`, stallName: `${letter} 區 ${String(index + 1).padStart(2, '0')} 號（示範）`, marketName: index < 8 ? '東門市場' : index === 8 ? '南門市場' : '餐飲通路',
        contactName: `示範客戶 ${letter}`, phone: '0900-000-000（示範）', email: `customer${index === 0 ? '' : index + 1}@dongmen.test`, deliveryAddress: `台北市東門市場 ${letter} 區 ${index + 1} 號攤位（測試地址）`, address: '台北市（示範地址）',
        customerType: index === 9 ? 'RESTAURANT' : 'MARKET_STALL', priceLevel: ['LEVEL_A', 'LEVEL_B', 'LEVEL_C'][index % 3], salesOwner: '東門採購業務', paymentTerms: ['7天', '15天', '30天'][index % 3], creditLimit: 0,
      } });
      await tx.user.create({ data: { id: `user-customer-demo-${index + 1}`, name: customer.contactName, email: customer.email, passwordHash, role: 'CUSTOMER', customerId: customer.id } });
      customers.push(customer);
    }
    for (const s of [supplier, supplier2]) {
      const tiers = [{ name: '一般採購', min: 0, max: 49, discount: 0, rate: 0.05, rebate: 0 }, { name: '小量集中', min: 50, max: 99, discount: 0.01, rate: 0.055, rebate: 0 }, { name: '穩定採購', min: 100, max: 299, discount: 0.02, rate: 0.06, rebate: 0.005 }, { name: '大量議價', min: 300, max: 499, discount: 0.03, rate: 0.065, rebate: 0.01 }, { name: '策略合作', min: 500, max: null, discount: 0.04, rate: 0.07, rebate: 0.015 }];
      for (const tier of tiers) await tx.volumeTier.create({ data: { supplierId: s.id, name: tier.name, minQuantity: tier.min, maxQuantity: tier.max, supplierDiscount: tier.discount, commissionRate: tier.rate, rebateRate: tier.rebate } });
    }
    const definitions = [
      { id: 'mackerel', name: '薄鹽鯖魚', short: '鯖魚', category: 0, origin: '挪威（示範）', specs: ['300g／片', '400g／片', '500g／片'], cost: 58, price: 78, unit: '片' },
      { id: 'salmon', name: '厚切鮭魚', short: '鮭魚', category: 0, origin: '智利（示範）', specs: ['250g／片', '350g／片'], cost: 125, price: 168, unit: '片' },
      { id: 'tilapia', name: '台灣鯛魚片', short: '鯛魚片', category: 0, origin: '台灣（示範）', specs: ['200g／片', '300g／片'], cost: 48, price: 65, unit: '片' },
      { id: 'tiger-shrimp', name: '冷凍草蝦', short: '草蝦', category: 1, origin: '越南（示範）', specs: ['20/30・600g', '30/40・600g', '40/50・600g'], cost: 210, price: 268, unit: '盒' },
      { id: 'white-shrimp', name: '白蝦', short: '白蝦', category: 1, origin: '台灣（示範）', specs: ['30/40・600g', '40/50・600g'], cost: 165, price: 208, unit: '盒' },
      { id: 'squid', name: '透抽', short: '透抽', category: 4, origin: '台灣（示範）', specs: ['300–400g／尾', '400–500g／尾'], cost: 115, price: 148, unit: '尾' },
      { id: 'fish-belly', name: '魚肚', short: '魚肚', category: 0, origin: '台灣（示範）', specs: ['150g／片', '200g／片'], cost: 70, price: 95, unit: '片' },
      { id: 'whitebait', name: '吻仔魚', short: '吻仔魚', category: 5, origin: '台灣（示範）', specs: ['300g／包', '600g／包'], cost: 90, price: 118, unit: '包' },
    ];
    const variants: (ProductVariant & { product: Product; price: number })[] = [];
    for (let index = 0; index < definitions.length; index++) {
      const definition = definitions[index];
      const product = await tx.product.create({ data: { id: `product-${definition.id}`, supplierId: index === 7 ? supplier2.id : supplier.id, name: definition.name, shortName: definition.short, brand: '東門示範選品', categoryId: categories[definition.category].id, origin: definition.origin, description: '此為平台自建示範資料，非任何供應商正式商品文案。商品規格、來源、食品標示與批發條件均待授權後由管理員確認。', sourceType: 'DEMO', authorizationStatus: 'DEMO', imageSource: 'PLACEHOLDER', imageAuthorized: false, storageMethod: '冷凍', temperature: '-18°C 以下', available: true } });
      for (let specIndex = 0; specIndex < definition.specs.length; specIndex++) {
        const cost = definition.cost + specIndex * 12;
        const price = definition.price + specIndex * 18;
        const variant = await tx.productVariant.create({ data: { id: `variant-${definition.id}-${specIndex + 1}`, productId: product.id, sku: `DM-${String(index + 1).padStart(3, '0')}-${specIndex + 1}`, specification: definition.specs[specIndex], weight: definition.specs[specIndex], packageUnit: definition.unit, caseQuantity: index === 3 || index === 4 ? 12 : 10, moq: 1, supplierCost: cost, baseWholesalePrice: price, suggestedPrice: price + 20 } });
        for (const [level, factor] of [['LEVEL_A', 0.92], ['LEVEL_B', 1], ['LEVEL_C', 1.06]] as const) await tx.priceLevel.create({ data: { level, variantId: variant.id, mode: 'FIXED', value: money(decimal(price).mul(factor)).toFixed(2) } });
        variants.push({ ...variant, product, price });
      }
    }
    await tx.customerPrice.create({ data: { customerId: customers[0].id, variantId: variants[0].id, price: '69.00', validFrom: new Date('2026-01-01T00:00:00Z'), validTo: new Date('2030-12-31T23:59:59Z') } });
    await tx.favorite.createMany({ data: [0, 3, 7, 10].map(index => ({ customerId: customers[0].id, variantId: variants[index].id })) });
    const now = new Date();
    const todayTaipei = new Date(now.getTime() + 8 * 3600000);
    const dayStart = new Date(Date.UTC(todayTaipei.getUTCFullYear(), todayTaipei.getUTCMonth(), todayTaipei.getUTCDate()) - 8 * 3600000);
    for (let orderIndex = 0; orderIndex < 36; orderIndex++) {
      const customer = customers[orderIndex % customers.length];
      const daysAgo = orderIndex < 4 ? 0 : Math.floor((orderIndex - 4) / 2) + 1;
      const createdAt = new Date(dayStart.getTime() - daysAgo * 86400000 + (1 + orderIndex % 5) * 3600000);
      const deliveryDate = new Date(createdAt.getTime() + 86400000);
      const chosen = [variants[orderIndex % variants.length], variants[(orderIndex + 5) % variants.length], ...(orderIndex % 3 === 0 ? [variants[variants.length - 1]] : [])];
      const distinct = [...new Map(chosen.map(v => [v.id, v])).values()];
      const items = distinct.map((variant, itemIndex) => {
        const factor = customer.priceLevel === 'LEVEL_A' ? 0.92 : customer.priceLevel === 'LEVEL_C' ? 1.06 : 1;
        const price = customer.id === customers[0].id && variant.id === variants[0].id ? money(69) : money(decimal(variant.price).mul(factor));
        const quantity = 5 + ((orderIndex + itemIndex * 3) % 8) * 5;
        const totals = lineSnapshot({ quantity, price, cost: variant.supplierCost, rate: '0.05' });
        return { variantId: variant.id, supplierId: variant.product.supplierId, sku: variant.sku, productName: variant.product.name, specification: variant.specification, packageUnit: variant.packageUnit, quantity, supplierCostSnapshot: variant.supplierCost.toString(), customerPriceSnapshot: price.toFixed(2), commissionRateSnapshot: '0.05', commissionAmountSnapshot: totals.commission.toFixed(2), lineTotal: totals.lineTotal.toFixed(2) };
      });
      const totalAmount = money(items.reduce((sum, item) => sum.plus(item.lineTotal), decimal(0)));
      const totalCost = money(items.reduce((sum, item) => sum.plus(decimal(item.supplierCostSnapshot).mul(item.quantity)), decimal(0)));
      const commissionAmount = money(items.reduce((sum, item) => sum.plus(item.commissionAmountSnapshot), decimal(0)));
      const dateKey = new Date(createdAt.getTime() + 8 * 3600000).toISOString().slice(0, 10).replaceAll('-', '');
      const sequence = await tx.dailySequence.upsert({ where: { key: `DM-${dateKey}` }, create: { key: `DM-${dateKey}`, value: 1 }, update: { value: { increment: 1 } } });
      const status: OrderStatus = orderIndex < 3 ? 'SUBMITTED' : orderIndex === 3 ? 'CONFIRMED' : orderIndex < 8 ? 'DELIVERED' : 'COMPLETED';
      const paid = orderIndex >= 10 && orderIndex % 4 !== 0;
      const partial = orderIndex >= 10 && !paid && orderIndex % 8 === 0;
      const order = await tx.order.create({ data: { id: `order-demo-${orderIndex + 1}`, orderNumber: `DM-${dateKey}-${sequence.value.toString().padStart(4, '0')}`, customerId: customer.id, status, paymentStatus: paid ? 'PAID' : partial ? 'PARTIAL' : 'UNPAID', totalAmount: totalAmount.toFixed(2), totalCost: totalCost.toFixed(2), grossProfit: money(totalAmount.minus(totalCost)).toFixed(2), commissionAmount: commissionAmount.toFixed(2), deliveryDate, deliveryTime: '06:00–10:00', deliveryAddress: customer.deliveryAddress, notes: '示範訂單，僅供測試，非真實交易。', paymentTerms: customer.paymentTerms, dueDate: new Date(deliveryDate.getTime() + Number(customer.paymentTerms.match(/\d+/)?.[0] ?? 7) * 86400000), idempotencyKey: `seed-demo-${orderIndex + 1}`, createdAt, items: { create: items } }, include: { items: true } });
      if (paid || partial) await tx.payment.create({ data: { orderId: order.id, amount: paid ? totalAmount.toFixed(2) : money(totalAmount.div(2)).toFixed(2), method: orderIndex % 2 ? 'BANK_TRANSFER' : 'CASH', reference: '示範收款紀錄', paidAt: new Date(createdAt.getTime() + 86400000), createdAt } });
      for (const supplierId of [...new Set(items.map(item => item.supplierId))]) {
        const group = order.items.filter(item => item.supplierId === supplierId);
        await tx.commission.create({ data: { supplierId, orderId: order.id, customerId: customer.id, orderAmount: money(group.reduce((sum, item) => sum.plus(item.lineTotal.toString()), decimal(0))).toFixed(2), commissionRate: '0.05', commissionAmount: money(group.reduce((sum, item) => sum.plus(item.commissionAmountSnapshot.toString()), decimal(0))).toFixed(2), status: orderIndex > 20 ? 'PAID' : orderIndex > 7 ? 'CONFIRMED' : 'PENDING', createdAt } });
        if (orderIndex >= 4) {
          const seq = await tx.dailySequence.upsert({ where: { key: `PO-${dateKey}` }, create: { key: `PO-${dateKey}`, value: 1 }, update: { value: { increment: 1 } } });
          const po = await tx.purchaseOrder.create({ data: { poNumber: `PO-${dateKey}-${seq.value.toString().padStart(4, '0')}`, supplierId, status, totalCost: money(group.reduce((sum, item) => sum.plus(decimal(item.supplierCostSnapshot).mul(item.quantity)), decimal(0))).toFixed(2), notes: '歷史示範採購單', createdAt } });
          for (const item of group) await tx.purchaseOrderItem.create({ data: { purchaseOrderId: po.id, variantId: item.variantId, sku: item.sku, productName: item.productName, specification: item.specification, packageUnit: item.packageUnit, quantity: item.quantity, supplierCost: item.supplierCostSnapshot, lineTotal: money(decimal(item.supplierCostSnapshot).mul(item.quantity)).toFixed(2), allocations: { create: { orderItemId: item.id, quantity: item.quantity } } } });
        }
      }
    }
    const quoteItems = variants.slice(0, 3).map(variant => ({ variantId: variant.id, sku: variant.sku, productName: variant.product.name, specification: variant.specification, packageUnit: variant.packageUnit, quantity: 10, price: variant.price, customerPrice: variant.price, lineTotal: variant.price * 10 }));
    const dateKey = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10).replaceAll('-', '');
    await tx.quotation.create({ data: { id: 'quote-demo-1', quoteNumber: `Q-${dateKey}-0001`, customerId: customers[0].id, validUntil: new Date(now.getTime() + 14 * 86400000), paymentTerms: '7天', deliveryTerms: '供應商直送；示範配送條件', notes: '示範報價，非真實商品售價或採購承諾。', totalAmount: quoteItems.reduce((sum, item) => sum + item.lineTotal, 0), items: quoteItems } });
    await tx.dailySequence.create({ data: { key: `Q-${dateKey}`, value: 1 } });
    await tx.auditLog.create({ data: { userId: 'user-admin-demo', userName: '平台管理員', action: 'DEMO_SEED', entity: 'Platform', entityId: 'main', newValue: { customers: 10, products: 8, variants: variants.length, orders: 36, message: '全為示範資料，無第三方圖片或文案。' } as Prisma.InputJsonValue } });
    console.log(`Created 10 demo customers, 8 products, ${variants.length} variants, 36 orders, 2 suppliers.`);
  }, { timeout: 120000, maxWait: 10000 });
}
main().then(() => db.$disconnect()).catch(async error => { console.error(error); await db.$disconnect(); process.exit(1); });
