import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
const db = new PrismaClient();
try {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name || !password || password.length < 14 || password.length > 200) throw new Error('請設定 BOOTSTRAP_ADMIN_EMAIL、BOOTSTRAP_ADMIN_NAME、BOOTSTRAP_ADMIN_PASSWORD（至少14字元），請勿放在命令列参数。');
  if (process.env.DEMO_MODE !== 'true' && email.endsWith('@dongmen.test')) throw new Error('正式環境不可使用 Demo 帳號。');
  const passwordHash = await hash(password, 12);
  await db.$transaction(async tx => {
    if (await tx.user.count({ where: { role: 'SUPER_ADMIN' } })) throw new Error('資料庫已有最高管理員；為避免覆寫或權限擴張，首次建立工具已停用。');
    const user = await tx.user.create({ data: { email, name, passwordHash, role: 'SUPER_ADMIN' } });
    await tx.platformSetting.upsert({ where: { id: 'main' }, update: {}, create: { commissionRate: 0, serviceFee: 0, inventoryMode: 'DROP_SHIP', businessModel: process.env.BUSINESS_MODEL === 'RESELLER' ? 'RESELLER' : 'COMMISSION' } });
    await tx.auditLog.create({ data: { userId: user.id, userName: user.name, action: 'BOOTSTRAP', entity: 'User', entityId: user.id, newValue: { role: 'SUPER_ADMIN', bootstrap: true } } });
  }, { isolationLevel: 'Serializable' });
  console.log('已建立首位管理員。請刪除暫時的 BOOTSTRAP_ADMIN_PASSWORD 環境設定，並登入填寫平台資訊。');
} catch (error) { console.error(error.message); process.exitCode = 1; } finally { await db.$disconnect(); }
