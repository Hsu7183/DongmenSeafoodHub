import { hash } from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from './db';
import { ApiError, requireAdmin, requireStaff, SessionUser } from './auth';
import { getProducts } from './data';
import { legalMissing, money } from './domain';
import { audit, currency, dateField, fraction, idField, serializable, textField, Tx } from './mutations';
import { submittedFields } from './validation';

const customerSchema = z.object({
  companyName: textField.min(1), stallName: textField.min(1), marketName: textField.default('東門市場'), contactName: textField.min(1), phone: textField.min(1),
  lineId: textField.default(''), email: z.union([z.email(), z.literal('')]).default(''), taxId: textField.default(''), invoiceTitle: textField.default(''), address: textField.default(''), deliveryAddress: textField.min(1),
  customerType: z.enum(['MARKET_STALL', 'RESTAURANT', 'SEAFOOD_STORE', 'FOOD_VENDOR', 'OTHER']).default('MARKET_STALL'),
  priceLevel: z.enum(['LEVEL_A', 'LEVEL_B', 'LEVEL_C', 'CUSTOM']).default('LEVEL_B'), salesOwner: textField.default(''), paymentTerms: textField.default('7天'), creditLimit: currency.default(0), status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).default('ACTIVE'), password: z.string().min(10).max(200).optional(),
});
const supplierSchema = z.object({ name: textField.min(1), contactName: textField.default(''), phone: textField.default(''), email: z.union([z.email(), z.literal('')]).default(''), address: textField.default(''), website: textField.default(''), authorizationStatus: z.enum(['PENDING', 'AUTHORIZED', 'DEMO']).default('PENDING'), active: z.boolean().default(true), negotiationTargetAmount: currency.default(0), password: z.string().min(10).max(200).optional() });
const categorySchema = z.object({ name: textField.min(1), sortOrder: z.coerce.number().int().min(0).max(9999).default(0), active: z.boolean().default(true) });
const variantSchema = z.object({ id: idField.optional(), sku: textField.min(1), specification: textField.min(1), weight: textField.default(''), packageUnit: textField.default('包'), caseQuantity: z.coerce.number().int().min(1).max(100000).default(10), moq: z.coerce.number().int().min(1).max(100000).default(1), supplierCost: currency, baseWholesalePrice: currency, suggestedPrice: currency.optional(), commissionRate: fraction.nullable().optional(), fixedCommission: currency.nullable().optional(), active: z.boolean().default(true) });
const productSchema = z.object({ name: textField.min(1), shortName: textField.default(''), supplierId: idField, categoryId: idField, supplierProductCode: textField.default(''), supplierProductId: textField.default(''), supplierUrl: textField.default(''), sourceType: textField.default('MANUAL'), sourceUrl: textField.default(''), authorizationStatus: z.enum(['PENDING', 'AUTHORIZED', 'OWN_CONTENT', 'DEMO']).default('DEMO'), brand: textField.default(''), description: textField.default(''), origin: textField.default(''), storageMethod: textField.default('冷凍'), temperature: textField.default('-18°C 以下'), imageUrl: textField.default(''), imageSource: z.enum(['SUPPLIER', 'OWN_PHOTO', 'AUTHORIZED_URL', 'PLACEHOLDER']).default('PLACEHOLDER'), imageAuthorized: z.boolean().default(false), active: z.boolean().default(true), available: z.boolean().default(true), supplierStockStatus: z.enum(['AVAILABLE', 'UNAVAILABLE', 'UNKNOWN']).default('AVAILABLE'), authorizationConfirmed: z.boolean().optional(), variants: z.array(variantSchema).min(1).max(100) });
const tierSchema = z.object({ supplierId: idField, name: textField.min(1), minQuantity: z.coerce.number().int().min(0).max(10000000), maxQuantity: z.coerce.number().int().min(0).max(10000000).nullable().optional(), supplierDiscount: fraction.default(0), commissionRate: fraction.default(0), rebateRate: fraction.default(0) });
const settingsSchema = z.object({ businessModel: z.enum(['COMMISSION', 'RESELLER']).optional(), inventoryMode: z.literal('DROP_SHIP').optional(), commissionRate: fraction.optional(), serviceFee: currency.optional(), businessName: textField.optional(), taxId: textField.optional(), customerServicePhone: textField.optional(), address: textField.optional(), foodRegistrationNumber: textField.optional(), tradingEntity: textField.optional(), paymentMethods: textField.optional(), returnsPolicy: textField.optional(), privacyPolicy: textField.optional(), supplierDisclosure: textField.optional(), legalReviewConfirmed: z.boolean().optional(), launchReady: z.boolean().optional() });

function validateContent(data: { imageUrl?: string; imageSource?: string; imageAuthorized?: boolean; authorizationStatus?: string; authorizationConfirmed?: boolean; supplierUrl?: string; sourceUrl?: string }) {
  if (data.imageUrl) {
    if (data.imageSource === 'PLACEHOLDER' && (!data.imageUrl.startsWith('/images/') || data.imageUrl.startsWith('//') || data.imageUrl.includes('..'))) throw new ApiError(400, '示範圖片僅能使用平台內建 placeholder');
    if (data.imageSource !== 'PLACEHOLDER' && !data.imageAuthorized) throw new ApiError(400, '請先確認圖片使用授權');
    if (data.imageSource !== 'PLACEHOLDER' && data.imageSource !== 'OWN_PHOTO' && (process.env.SUPPLIER_CONTENT_AUTHORIZED !== 'true' || !data.authorizationConfirmed)) throw new ApiError(403, '尚未取得供應商內容使用授權，禁止公開圖片');
    if (data.imageSource !== 'PLACEHOLDER' && !/^https:\/\//i.test(data.imageUrl) && !data.imageUrl.startsWith('/images/')) throw new ApiError(400, '圖片必須為 HTTPS 或平台圖片路徑');
  }
  if (data.authorizationStatus === 'AUTHORIZED' && (process.env.SUPPLIER_CONTENT_AUTHORIZED !== 'true' || !data.authorizationConfirmed)) throw new ApiError(403, '供應商正式內容尚未授權');
  for (const url of [data.supplierUrl, data.sourceUrl]) if (url && !/^https?:\/\//i.test(url)) throw new ApiError(400, '來源網址格式不正確');
}

export async function adminRead(resource: string, user: SessionUser | null) {
  requireStaff(user);
  if (resource === 'customers') return { customers: await db.customer.findMany({ orderBy: { createdAt: 'desc' } }) };
  if (resource === 'suppliers') return { suppliers: await db.supplier.findMany({ orderBy: { createdAt: 'asc' } }) };
  if (resource === 'categories') return { categories: await db.category.findMany({ orderBy: { sortOrder: 'asc' } }) };
  if (resource === 'products') return getProducts(user, true);
  if (resource === 'prices') return { prices: await db.customerPrice.findMany({ include: { customer: true, variant: { include: { product: true } } }, orderBy: { createdAt: 'desc' } }), levelPrices: await db.priceLevel.findMany({ include: { variant: { include: { product: true } } } }) };
  if (resource === 'tiers') return { tiers: await db.volumeTier.findMany({ include: { supplier: true }, orderBy: [{ supplierId: 'asc' }, { minQuantity: 'asc' }] }) };
  if (resource === 'settings') {
    requireAdmin(user);
    const settings = await db.platformSetting.upsert({ where: { id: 'main' }, create: {}, update: {} });
    return { settings, supplierContentAuthorized: process.env.SUPPLIER_CONTENT_AUTHORIZED === 'true', demoMode: process.env.DEMO_MODE === 'true', missingLegalFields: legalMissing(settings) };
  }
  if (resource === 'audit') {
    requireAdmin(user);
    return { auditLogs: await db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 500 }) };
  }
  throw new ApiError(404, '找不到管理資源');
}

export async function adminWrite(resource: string, raw: unknown, method: string, pathId: string | undefined, user: SessionUser | null) {
  requireStaff(user);
  const rawRecord = z.record(z.string(), z.unknown()).parse(raw);
  const id = pathId ?? (typeof rawRecord.id === 'string' ? rawRecord.id : undefined);
  const editing = method === 'PATCH';
  if (editing && !id && resource !== 'settings') throw new ApiError(400, '請提供要修改的資料 ID');
  if (resource === 'settings') {
    requireAdmin(user);
    const data = settingsSchema.parse(raw);
    const settings = await serializable(async tx => {
      const old = await tx.platformSetting.upsert({ where: { id: 'main' }, create: {}, update: {} });
      const merged = { ...old, ...data };
      const missing = legalMissing(merged);
      if (data.launchReady && missing.length) throw new ApiError(400, `正式上線前尚須完成：${missing.join('、')}`);
      if (data.launchReady && process.env.DEMO_MODE === 'true') throw new ApiError(400, '示範模式不能啟用正式交易，請先切換 DEMO_MODE');
      const updated = await tx.platformSetting.update({ where: { id: 'main' }, data: { ...data, ...(missing.length ? { launchReady: false } : {}) } });
      await audit(tx, user, 'UPDATE', 'PlatformSetting', 'main', old, updated); return updated;
    });
    return { settings, supplierContentAuthorized: process.env.SUPPLIER_CONTENT_AUTHORIZED === 'true', demoMode: process.env.DEMO_MODE === 'true', missingLegalFields: legalMissing(settings) };
  }
  if (resource === 'customers') {
    const data = editing ? submittedFields(customerSchema.partial().parse(raw), rawRecord) : customerSchema.parse(raw);
    const { password, ...fields } = data;
    const passwordHash = password ? await hash(password, 12) : null;
    const customer = await serializable(async tx => {
      const old = id ? await tx.customer.findUnique({ where: { id } }) : null;
      if (editing && !old) throw new ApiError(404, '找不到客戶');
      const customer = editing ? await tx.customer.update({ where: { id }, data: fields }) : await tx.customer.create({ data: fields as Prisma.CustomerCreateInput });
      if (passwordHash) {
        if (!customer.email) throw new ApiError(400, '建立登入帳號須填寫電子郵件');
        await tx.user.upsert({ where: { customerId: customer.id }, create: { name: customer.contactName, email: customer.email.toLowerCase(), passwordHash, role: 'CUSTOMER', customerId: customer.id }, update: { email: customer.email.toLowerCase(), passwordHash, name: customer.contactName } });
        await tx.session.deleteMany({ where: { user: { customerId: customer.id } } });
      }
      if (fields.status) await tx.user.updateMany({ where: { customerId: customer.id }, data: { active: fields.status === 'ACTIVE' } });
      await audit(tx, user, editing ? 'UPDATE' : 'CREATE', 'Customer', customer.id, old, customer); return customer;
    });
    return { customer };
  }
  if (resource === 'suppliers') {
    const data = editing ? submittedFields(supplierSchema.partial().parse(raw), rawRecord) : supplierSchema.parse(raw);
    if (data.authorizationStatus === 'AUTHORIZED' && (process.env.SUPPLIER_CONTENT_AUTHORIZED !== 'true' || rawRecord.authorizationConfirmed !== true)) throw new ApiError(403, '供應商授權尚未確認');
    const { password, ...fields } = data;
    const passwordHash = password ? await hash(password, 12) : null;
    const supplier = await serializable(async tx => {
      const old = id ? await tx.supplier.findUnique({ where: { id } }) : null;
      if (editing && !old) throw new ApiError(404, '找不到供應商');
      const supplier = editing ? await tx.supplier.update({ where: { id }, data: fields }) : await tx.supplier.create({ data: fields as Prisma.SupplierCreateInput });
      if (passwordHash) {
        if (!supplier.email) throw new ApiError(400, '建立登入帳號須填寫電子郵件');
        const existing = await tx.user.findFirst({ where: { supplierId: supplier.id } });
        if (existing) { await tx.user.update({ where: { id: existing.id }, data: { email: supplier.email.toLowerCase(), passwordHash, name: supplier.contactName || supplier.name } }); await tx.session.deleteMany({ where: { userId: existing.id } }); }
        else await tx.user.create({ data: { name: supplier.contactName || supplier.name, email: supplier.email.toLowerCase(), passwordHash, role: 'SUPPLIER', supplierId: supplier.id } });
      }
      if (fields.active !== undefined) await tx.user.updateMany({ where: { supplierId: supplier.id }, data: { active: fields.active } });
      await audit(tx, user, editing ? 'UPDATE' : 'CREATE', 'Supplier', supplier.id, old, supplier); return supplier;
    });
    return { supplier };
  }
  if (resource === 'categories') {
    const fields = editing ? submittedFields(categorySchema.partial().parse(raw), rawRecord) : categorySchema.parse(raw);
    const category = await serializable(async tx => {
      const old = id ? await tx.category.findUnique({ where: { id } }) : null;
      if (editing && !old) throw new ApiError(404, '找不到分類');
      const category = editing ? await tx.category.update({ where: { id }, data: fields }) : await tx.category.create({ data: fields as Prisma.CategoryCreateInput });
      await audit(tx, user, editing ? 'UPDATE' : 'CREATE', 'Category', category.id, old, category); return category;
    });
    return { category };
  }
  if (resource === 'products') {
    const data = editing ? submittedFields(productSchema.partial().parse(raw), rawRecord) : productSchema.parse(raw);
    const product = await serializable(async tx => {
      const old = id ? await tx.product.findUnique({ where: { id }, include: { variants: true } }) : null;
      if (editing && !old) throw new ApiError(404, '找不到商品');
      const merged = { ...old, ...data };
      const contentFields = ['imageUrl', 'imageSource', 'imageAuthorized', 'authorizationStatus', 'supplierUrl', 'sourceUrl', 'name', 'description', 'brand', 'origin'] as const;
      const contentChanged = !old || contentFields.some(field => data[field] !== undefined && data[field] !== old[field]);
      if (contentChanged) validateContent(merged);
      if (editing && data.supplierId && data.supplierId !== old!.supplierId) {
        const count = await tx.orderItem.count({ where: { variantId: { in: old!.variants.map(v => v.id) } } });
        if (count) throw new ApiError(400, '已有歷史訂單的商品不可變更供應商，請建立新商品');
      }
      const { variants, authorizationConfirmed: _authorizationConfirmed, ...fields } = data;
      void _authorizationConfirmed;
      const product = editing ? await tx.product.update({ where: { id }, data: fields }) : await tx.product.create({ data: fields as Prisma.ProductUncheckedCreateInput });
      for (const variant of variants ?? []) {
        const { id: variantId, ...values } = variant;
        const variantData = { ...values, suggestedPrice: values.suggestedPrice ?? values.baseWholesalePrice };
        if (variantId) {
          if (!old?.variants.some(v => v.id === variantId)) throw new ApiError(400, '規格不屬於此商品');
          await tx.productVariant.update({ where: { id: variantId }, data: variantData });
        } else await tx.productVariant.create({ data: { ...variantData, productId: product.id } });
      }
      const updated = await tx.product.findUniqueOrThrow({ where: { id: product.id }, include: { variants: true, category: true, supplier: true } });
      await audit(tx, user, editing ? 'UPDATE' : 'CREATE', 'Product', product.id, old, updated); return updated;
    });
    return { product };
  }
  if (resource === 'prices') {
    if (rawRecord.level) {
      const data = z.object({ level: z.enum(['LEVEL_A', 'LEVEL_B', 'LEVEL_C', 'CUSTOM']), variantId: idField, mode: z.enum(['FIXED', 'COST_PLUS', 'MARGIN']).default('FIXED'), value: currency }).parse(raw);
      if (data.mode === 'MARGIN' && data.value >= 1) throw new ApiError(400, '毛利率須小於 1');
      const levelPrice = await serializable(async tx => {
        const old = await tx.priceLevel.findUnique({ where: { level_variantId: { level: data.level, variantId: data.variantId } } });
        const updated = await tx.priceLevel.upsert({ where: { level_variantId: { level: data.level, variantId: data.variantId } }, create: data, update: { mode: data.mode, value: data.value } });
        await audit(tx, user, 'UPSERT', 'PriceLevel', updated.id, old, updated); return updated;
      });
      return { levelPrice };
    }
    const data = z.object({ customerId: idField, variantId: idField, price: currency, validFrom: dateField.optional(), validTo: dateField.nullable().optional() }).parse(raw);
    if (data.validTo && data.validTo < (data.validFrom ?? new Date())) throw new ApiError(400, '價格有效結束日須晚於起始日');
    const price = await serializable(async tx => {
      const old = editing ? await tx.customerPrice.findUnique({ where: { id } }) : null;
      if (editing && !old) throw new ApiError(404, '找不到價格');
      const price = editing ? await tx.customerPrice.update({ where: { id }, data }) : await tx.customerPrice.create({ data });
      await audit(tx, user, editing ? 'UPDATE' : 'CREATE', 'CustomerPrice', price.id, old, price); return price;
    });
    return { price };
  }
  if (resource === 'tiers') {
    const data = tierSchema.parse(raw);
    if (data.maxQuantity != null && data.maxQuantity < data.minQuantity) throw new ApiError(400, '數量上限須大於下限');
    const tier = await serializable(async tx => {
      const old = id ? await tx.volumeTier.findUnique({ where: { id } }) : null;
      if (editing && !old) throw new ApiError(404, '找不到階梯');
      const others = await tx.volumeTier.findMany({ where: { supplierId: data.supplierId, ...(id ? { id: { not: id } } : {}) } });
      if (others.some(t => data.minQuantity <= (t.maxQuantity ?? Infinity) && (data.maxQuantity ?? Infinity) >= t.minQuantity)) throw new ApiError(400, '議價階梯的數量範圍不能重疊');
      const tier = editing ? await tx.volumeTier.update({ where: { id }, data }) : await tx.volumeTier.create({ data });
      await audit(tx, user, editing ? 'UPDATE' : 'CREATE', 'VolumeTier', tier.id, old, tier); return tier;
    });
    return { tier };
  }
  throw new ApiError(404, '找不到管理資源');
}

const importSchema = z.object({ rows: z.array(z.record(z.string(), z.unknown())).min(1).max(1000), sourceType: z.enum(['CSV', 'EXCEL', 'JSON', 'API', 'WEBSITE', 'AUTHORIZED_WEBSITE']), supplierId: idField, authorizationConfirmed: z.boolean().default(false), authorizationReference: textField.optional(), demo: z.boolean().default(false) });
export async function importProducts(raw: unknown, user: SessionUser | null) {
  requireAdmin(user);
  const data = importSchema.parse(raw);
  if (!data.demo && (process.env.SUPPLIER_CONTENT_AUTHORIZED !== 'true' || !data.authorizationConfirmed)) throw new ApiError(403, '正式匯入已封鎖：SUPPLIER_CONTENT_AUTHORIZED=false 或尚未確認供應商授權');
  if (data.demo && process.env.DEMO_MODE !== 'true') throw new ApiError(403, '正式環境不可建立示範商品');
  const supplier = await db.supplier.findUnique({ where: { id: data.supplierId } });
  if (!supplier) throw new ApiError(404, '找不到供應商');
  // Validate every row before the transaction; any invalid row rejects the whole batch.
  const prepared = data.rows.map((row, index) => {
    const normalized = { ...row, supplierCost: row.supplierCost ?? row.supplier_cost, baseWholesalePrice: row.baseWholesalePrice ?? row.base_wholesale_price, caseQuantity: row.caseQuantity ?? row.case_quantity, packageUnit: row.packageUnit ?? row.package_unit, imageUrl: row.imageUrl ?? row.image_url, sourceUrl: row.sourceUrl ?? row.source_url, supplierProductId: row.supplierProductId ?? row.supplier_product_id, supplierProductCode: row.supplierProductCode ?? row.supplier_product_code, supplierUrl: row.supplierUrl ?? row.supplier_url };
    const parsed = z.object({ name: textField.min(1), sku: textField.min(1), specification: textField.min(1), supplierCost: currency, baseWholesalePrice: currency, suggestedPrice: currency.optional(), categoryId: idField.optional(), category: textField.optional(), description: textField.default(''), brand: textField.default(''), origin: textField.default(''), weight: textField.default(''), packageUnit: textField.default('包'), caseQuantity: z.coerce.number().int().positive().default(10), moq: z.coerce.number().int().positive().default(1), imageUrl: textField.default(''), sourceUrl: textField.default(''), supplierUrl: textField.default(''), supplierProductId: textField.default(''), supplierProductCode: textField.default('') }).safeParse(normalized);
    if (!parsed.success) throw new ApiError(400, `第 ${index + 1} 列資料不完整：需商品名稱、SKU、規格、獨立批發成本及基礎售價`);
    if (data.demo && (parsed.data.imageUrl || parsed.data.sourceUrl || parsed.data.supplierUrl)) throw new ApiError(403, `第 ${index + 1} 列示範匯入不可包含第三方圖片或來源網址`);
    if (!data.demo && parsed.data.imageUrl && !/^https:\/\//i.test(parsed.data.imageUrl)) throw new ApiError(400, '正式圖片網址須為 HTTPS');
    return parsed.data;
  });
  const products = await serializable(async tx => {
    const fallbackCategory = await tx.category.upsert({ where: { name: '其他冷凍食品' }, create: { name: '其他冷凍食品', sortOrder: 99 }, update: {} });
    const results: { id: string; name: string; variantId: string; sku: string }[] = [];
    for (const row of prepared) {
      const category = row.category ? await tx.category.upsert({ where: { name: row.category }, create: { name: row.category }, update: {} }) : null;
      const categoryId = row.categoryId ?? category?.id ?? fallbackCategory.id;
      const existing = await tx.productVariant.findUnique({ where: { sku: row.sku }, include: { product: true } });
      if (existing && existing.product.supplierId !== data.supplierId) throw new ApiError(400, `SKU ${row.sku} 已屬於其他供應商`);
      const fields = { name: row.name, supplierId: data.supplierId, categoryId, description: data.demo ? '平台示範商品；規格、價格與來源皆為測試資料，非供應商正式報價。' : row.description, brand: data.demo ? '示範選品' : row.brand, origin: row.origin,
        sourceType: data.demo ? 'DEMO' : data.sourceType, sourceUpdatedAt: new Date(), authorizationStatus: data.demo ? 'DEMO' : 'AUTHORIZED', supplierProductId: row.supplierProductId, supplierProductCode: row.supplierProductCode, supplierUrl: row.supplierUrl || row.sourceUrl, sourceUrl: row.sourceUrl,
        imageUrl: data.demo ? '' : row.imageUrl, imageSource: data.demo || !row.imageUrl ? 'PLACEHOLDER' : 'SUPPLIER', imageAuthorized: !data.demo && !!row.imageUrl };
      const product = existing ? await tx.product.update({ where: { id: existing.productId }, data: fields }) : await tx.product.create({ data: fields });
      const variantFields = { productId: product.id, sku: row.sku, specification: row.specification, weight: row.weight, packageUnit: row.packageUnit, caseQuantity: row.caseQuantity, moq: row.moq, supplierCost: money(row.supplierCost).toFixed(2), baseWholesalePrice: money(row.baseWholesalePrice).toFixed(2), suggestedPrice: money(row.suggestedPrice ?? row.baseWholesalePrice).toFixed(2) };
      const variant = await tx.productVariant.upsert({ where: { sku: row.sku }, create: variantFields, update: variantFields });
      await audit(tx, user, existing ? 'IMPORT_UPDATE' : 'IMPORT_CREATE', 'Product', product.id, existing, { product, variant, authorizationConfirmed: data.authorizationConfirmed, authorizationReference: data.authorizationReference ?? null, demo: data.demo });
      results.push({ id: product.id, name: product.name, variantId: variant.id, sku: variant.sku });
    }
    return results;
  });
  return { imported: products.length, products, demo: data.demo, message: data.demo ? '已匯入內部示範商品，未使用第三方圖片或文案' : '已匯入授權商品，來源與操作均已稽核' };
}

export async function publicBusinessInfo() {
  const settings = await db.platformSetting.findUnique({ where: { id: 'main' } });
  return { businessInfo: { businessName: settings?.businessName ?? '', taxId: settings?.taxId ?? '', customerServicePhone: settings?.customerServicePhone ?? '', address: settings?.address ?? '', foodRegistrationNumber: settings?.foodRegistrationNumber ?? '', tradingEntity: settings?.tradingEntity ?? '', paymentMethods: settings?.paymentMethods ?? '', returnsPolicy: settings?.returnsPolicy ?? '', privacyPolicy: settings?.privacyPolicy ?? '', supplierDisclosure: settings?.supplierDisclosure ?? '', launchReady: settings?.launchReady ?? false }, demoMode: process.env.DEMO_MODE === 'true' };
}

export async function updateCommission(raw: unknown, user: SessionUser | null) {
  requireStaff(user);
  const data = z.object({ id: idField, status: z.enum(['PENDING', 'CONFIRMED', 'PAID']) }).parse(raw);
  const commission = await serializable(async (tx: Tx) => {
    const old = await tx.commission.findUnique({ where: { id: data.id }, include: { order: true } });
    if (!old || old.order.status === 'CANCELLED') throw new ApiError(404, '找不到有效佣金紀錄');
    const ranks = ['PENDING', 'CONFIRMED', 'PAID'];
    if (old.status !== data.status && ranks.indexOf(data.status) !== ranks.indexOf(old.status) + 1) throw new ApiError(400, '佣金狀態必須依序確認與收款');
    const commission = await tx.commission.update({ where: { id: data.id }, data: { status: data.status } });
    await audit(tx, user, 'UPDATE', 'Commission', data.id, { status: old.status }, { status: data.status }); return commission;
  });
  return { commission };
}
