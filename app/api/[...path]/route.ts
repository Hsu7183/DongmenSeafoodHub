import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { ZodError, z } from 'zod';
import { adminRead, adminWrite, importProducts, publicBusinessInfo, updateCommission } from '../../../lib/server/admin';
import { ApiError, checkWriteOrigin, getSession, login, logout, requireStaff, requireUser } from '../../../lib/server/auth';
import { db } from '../../../lib/server/db';
import { getDashboard, getOrderForUser, getOrders, getProducts, getPurchaseOrderForUser, getPurchaseOrders, getQuotationForUser } from '../../../lib/server/data';
import { amount, isStaff } from '../../../lib/server/domain';
import { createOrder, createPayment, createPurchaseOrders, createQuotation, idField, updateOrder, updatePurchaseOrder } from '../../../lib/server/mutations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function dispatch(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  try {
    checkWriteOrigin(request);
    const { path } = await context.params;
    const route = path.join('/');
    const method = request.method;
    const isGet = method === 'GET';
    if (route === 'auth/login' && method === 'POST') return await login(request);
    if (route === 'auth/logout' && method === 'POST') return await logout(request);
    const user = await getSession(request);
    let result: unknown;
    const body = async () => {
      const length = Number(request.headers.get('content-length') ?? 0);
      if (length > 2_000_000) throw new ApiError(413, '匯入資料過大，單次最多 2MB');
      const text = await request.text();
      if (text.length > 2_000_000) throw new ApiError(413, '資料過大，單次最多 2MB');
      try { return JSON.parse(text); } catch { throw new ApiError(400, 'JSON 格式不正確'); }
    };
    if (route === 'session' && isGet) result = { user, demoMode: process.env.DEMO_MODE === 'true' };
    else if (route === 'checkout-context' && isGet) {
      requireUser(user);
      if (user.role !== 'CUSTOMER' || !user.customerId) throw new ApiError(403, '僅客戶可查看自己的結帳資訊');
      const [customer, settings] = await Promise.all([db.customer.findUnique({ where: { id: user.customerId } }), db.platformSetting.findUnique({ where: { id: 'main' } })]);
      if (!customer || customer.status !== 'ACTIVE') throw new ApiError(403, '客戶帳戶尚未啟用');
      result = { serviceFee: amount(settings?.serviceFee ?? 0), shippingFee: 0, customer: { deliveryAddress: customer.deliveryAddress, paymentTerms: customer.paymentTerms, contactName: customer.contactName, phone: customer.phone } };
    }
    else if (route === 'business-info' && isGet) result = await publicBusinessInfo();
    else if (route === 'products' && isGet) result = await getProducts(user);
    else if (route === 'orders' && isGet) result = await getOrders(user);
    else if (route === 'orders' && method === 'POST') result = await createOrder(await body(), user);
    else if (path[0] === 'orders' && path[1] && path[2] === 'reorder' && method === 'POST') {
      const order = await getOrderForUser(path[1], user);
      const available = await db.productVariant.findMany({ where: { id: { in: order.items.map(item => item.variantId) }, active: true, product: { active: true, available: true, supplier: { active: true } } }, select: { id: true, moq: true } });
      result = { items: order.items.filter(item => available.some(v => v.id === item.variantId)).map(item => ({ variantId: item.variantId, quantity: Math.max(item.quantity, available.find(v => v.id === item.variantId)!.moq) })), unavailableItems: order.items.filter(item => !available.some(v => v.id === item.variantId)).map(item => ({ variantId: item.variantId, productName: item.productName })) };
    }
    else if (path[0] === 'orders' && path.length === 2 && isGet) result = { order: await getOrderForUser(path[1], user) };
    else if (path[0] === 'orders' && path.length === 2 && method === 'PATCH') result = await updateOrder(path[1], await body(), user);
    else if (route === 'favorites') {
      requireUser(user);
      if (user.role !== 'CUSTOMER' || !user.customerId) throw new ApiError(403, '僅客戶可使用常購收藏');
      if (method === 'POST') {
        const { variantId } = z.object({ variantId: idField }).parse(await body());
        const existing = await db.favorite.findUnique({ where: { customerId_variantId: { customerId: user.customerId, variantId } } });
        if (existing) await db.favorite.delete({ where: { id: existing.id } });
        else await db.favorite.create({ data: { customerId: user.customerId, variantId } });
      } else if (!isGet) throw new ApiError(405, '不支援此操作');
      const favorites = await db.favorite.findMany({ where: { customerId: user.customerId } });
      result = { favorites, variantIds: favorites.map(favorite => favorite.variantId) };
    }
    else if (route === 'frequent' && isGet) {
      requireUser(user);
      if (user.role !== 'CUSTOMER') throw new ApiError(403, '僅客戶可使用常購清單');
      const items = await db.orderItem.groupBy({ by: ['variantId'], where: { order: { customerId: user.customerId ?? '__none__', status: { notIn: ['DRAFT', 'CANCELLED'] } } }, _sum: { quantity: true }, _count: { id: true }, orderBy: { _count: { id: 'desc' } }, take: 20 });
      result = { variantIds: items.map(item => item.variantId), frequency: items.map(item => ({ variantId: item.variantId, purchaseCount: item._count.id, totalQuantity: item._sum.quantity })) };
    }
    else if (route === 'admin/dashboard' && isGet) result = await getDashboard(user);
    else if (route === 'admin/import-products' && method === 'POST') result = await importProducts(await body(), user);
    else if (path[0] === 'admin' && path[1] && isGet) result = await adminRead(path[1], user);
    else if (path[0] === 'admin' && path[1] && ['POST', 'PATCH'].includes(method)) result = await adminWrite(path[1], await body(), method, path[2], user);
    else if (route === 'purchase-orders' && isGet) result = await getPurchaseOrders(user);
    else if (route === 'purchase-orders' && method === 'POST') result = await createPurchaseOrders(await body(), user);
    else if (path[0] === 'purchase-orders' && path.length === 2 && isGet) result = { purchaseOrder: await getPurchaseOrderForUser(path[1], user) };
    else if (path[0] === 'purchase-orders' && path.length === 2 && method === 'PATCH') result = await updatePurchaseOrder(path[1], await body(), user);
    else if (route === 'payments' && isGet) {
      requireStaff(user);
      result = { payments: await db.payment.findMany({ include: { order: { select: { id: true, orderNumber: true, customer: { select: { companyName: true, stallName: true } } } } }, orderBy: { createdAt: 'desc' }, take: 500 }) };
    }
    else if (route === 'payments' && method === 'POST') result = await createPayment(await body(), user);
    else if (route === 'commissions' && isGet) {
      requireStaff(user);
      result = { commissions: await db.commission.findMany({ where: { order: { status: { not: 'CANCELLED' } } }, include: { supplier: true, order: { select: { id: true, orderNumber: true, customer: { select: { companyName: true, stallName: true } } } } }, orderBy: { createdAt: 'desc' }, take: 500 }) };
    }
    else if (path[0] === 'commissions' && method === 'PATCH') result = await updateCommission({ ...await body(), ...(path[1] ? { id: path[1] } : {}) }, user);
    else if (route === 'quotations' && isGet) {
      requireUser(user);
      if (user.role === 'SUPPLIER') throw new ApiError(403, '您沒有報價單權限');
      const quotes = await db.quotation.findMany({ where: isStaff(user.role) ? {} : { customerId: user.customerId ?? '__none__' }, orderBy: { createdAt: 'desc' }, take: 200 });
      result = { quotations: await Promise.all(quotes.map(quote => getQuotationForUser(quote.id, user))) };
    }
    else if (route === 'quotations' && method === 'POST') result = await createQuotation(await body(), user);
    else if (path[0] === 'quotations' && path.length === 2 && isGet) result = { quotation: await getQuotationForUser(path[1], user) };
    else throw new ApiError(404, '找不到此 API');
    const response = NextResponse.json(result);
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    response.headers.set('Vary', 'Cookie');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    return response;
  } catch (error) {
    let status = 500; let message = '伺服器暫時無法處理，請稍後再試';
    if (error instanceof ApiError) { status = error.status; message = error.message; }
    else if (error instanceof ZodError) { status = 400; message = error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('；'); }
    else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') { status = 409; message = '資料已存在，請勿重複建立（帳號、SKU 或編號重複）'; }
      else if (['P2003', 'P2025'].includes(error.code)) { status = 400; message = '關聯資料不存在，請重新選擇'; }
      else if (error.code === 'P2034') { status = 409; message = '資料正被其他使用者更新，請重試'; }
    }
    if (status === 500) console.error('[Dongmen API]', error);
    return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
export const GET = dispatch;
export const POST = dispatch;
export const PATCH = dispatch;
