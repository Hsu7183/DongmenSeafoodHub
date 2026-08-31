import { createHash, randomBytes } from 'node:crypto';
import { compare } from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from './db';
import { isStaff } from './domain';

export const COOKIE_NAME = 'dongmen_session';
export type SessionUser = { id: string; name: string; email: string; role: string; customerId: string | null; supplierId: string | null };
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export async function getSession(request: NextRequest): Promise<SessionUser | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token || token.length !== 64) return null;
  const session = await db.session.findUnique({ where: { tokenHash: hash(token) }, include: { user: true } });
  if (!session || session.expiresAt <= new Date() || !session.user.active) return null;
  const { id, name, email, role, customerId, supplierId } = session.user;
  return { id, name, email, role, customerId, supplierId };
}
export function requireUser(user: SessionUser | null): asserts user is SessionUser {
  if (!user) throw new ApiError(401, '請先登入');
}
export function requireStaff(user: SessionUser | null): asserts user is SessionUser {
  requireUser(user);
  if (!isStaff(user.role)) throw new ApiError(403, '您沒有此管理權限');
}
export function requireAdmin(user: SessionUser | null): asserts user is SessionUser {
  requireUser(user);
  if (user.role !== 'SUPER_ADMIN') throw new ApiError(403, '僅平台管理員可執行此操作');
}
export function checkWriteOrigin(request: NextRequest) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const origin = request.headers.get('origin');
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.startsWith('application/json')) throw new ApiError(415, '請使用 JSON 請求');
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw new ApiError(403, '拒絕跨站請求');
  if (origin) {
    const allowed = new Set([new URL(process.env.APP_URL ?? 'http://localhost:3000').origin]);
    const configuredUrl = new URL(process.env.APP_URL ?? 'http://localhost:3000');
    const localDemo = process.env.DEMO_MODE === 'true' && ['localhost', '127.0.0.1', '[::1]'].includes(configuredUrl.hostname);
    if (process.env.NODE_ENV !== 'production' || localDemo) {
      const port = request.nextUrl.port || '3000';
      allowed.add(`http://localhost:${port}`); allowed.add(`http://127.0.0.1:${port}`);
    }
    if (!allowed.has(origin)) throw new ApiError(403, '拒絕跨站請求');
  }
}
export async function login(request: NextRequest) {
  const text = await request.text();
  if (text.length > 10000) throw new ApiError(413, '登入請求過大');
  let input: unknown;
  try { input = JSON.parse(text); } catch { throw new ApiError(400, 'JSON 格式不正確'); }
  const { email, password } = z.object({ email: z.string().email().max(254).transform(v => v.toLowerCase()), password: z.string().min(1).max(200) }).parse(input);
  // Per-account limits do not trust client supplied proxy headers.
  const key = hash(email);
  const since = new Date(Date.now() - 15 * 60 * 1000);
  const attempts = await db.loginAttempt.count({ where: { key, createdAt: { gte: since } } });
  if (attempts >= 8) throw new ApiError(429, '嘗試次數過多，請 15 分鐘後再試');
  await db.loginAttempt.create({ data: { key } });
  const user = await db.user.findUnique({ where: { email } });
  const valid = await compare(password, user?.passwordHash ?? '$2b$12$0Pe6XsNC8TNby.Vlb.FUcuRWzhSmLsNTfgg.dOB2MjVcEp.RRcKPm');
  if (!user || !valid || !user.active || (email.endsWith('@dongmen.test') && process.env.DEMO_MODE !== 'true')) throw new ApiError(401, '電子郵件或密碼不正確');
  await db.loginAttempt.deleteMany({ where: { key } });
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 12);
  await db.session.create({ data: { tokenHash: hash(token), userId: user.id, expiresAt } });
  const { id, name, role, customerId, supplierId } = user;
  const response = NextResponse.json({ user: { id, name, email, role, customerId, supplierId } });
  const appUrl = new URL(process.env.APP_URL ?? 'http://localhost:3000');
  const localDemo = process.env.DEMO_MODE === 'true' && ['localhost', '127.0.0.1', '[::1]'].includes(appUrl.hostname);
  response.cookies.set(COOKIE_NAME, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' && !localDemo, sameSite: 'lax', expires: expiresAt, path: '/' });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
export async function logout(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hash(token) } });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/' });
  return response;
}
