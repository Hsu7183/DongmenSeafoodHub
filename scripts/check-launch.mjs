import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const missing = [];
const required = ['businessName', 'taxId', 'customerServicePhone', 'address', 'foodRegistrationNumber', 'tradingEntity', 'paymentMethods', 'returnsPolicy', 'privacyPolicy', 'supplierDisclosure', 'legalReviewConfirmed'];
try {
  if (process.env.DEMO_MODE !== 'false') missing.push('DEMO_MODE 必須為 false');
  if (process.env.ALLOW_PUBLIC_LAUNCH !== 'true') missing.push('ALLOW_PUBLIC_LAUNCH 尚未明確開啟');
  let origin;
  try { origin = new URL(process.env.APP_URL || ''); } catch { missing.push('APP_URL 尚未設定'); }
  if (origin && (origin.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))) missing.push('APP_URL 必須為管理員確認的正式 HTTPS 網域');
  const settings = await db.platformSetting.findUnique({ where: { id: 'main' } });
  if (!settings?.launchReady) missing.push('管理後台尚未完成正式交易開放設定');
  for (const field of required) if (!settings?.[field]) missing.push(`營業／法律欄位待填：${field}`);
  const demoUsers = await db.user.count({ where: { active: true, email: { endsWith: '@dongmen.test' } } });
  if (demoUsers) missing.push(`仍有 ${demoUsers} 個啟用的 Demo 帳號`);
  const demoProducts = await db.product.count({ where: { active: true, authorizationStatus: { notIn: ['AUTHORIZED', 'OWN_CONTENT'] } } });
  if (demoProducts) missing.push(`仍有 ${demoProducts} 個未具正式內容授權的上架商品`);
  const supplierProducts = await db.product.count({ where: { active: true, authorizationStatus: 'AUTHORIZED' } });
  if (supplierProducts && process.env.SUPPLIER_CONTENT_AUTHORIZED !== 'true') missing.push('供應商內容授權環境開關尚未啟用');
  const unauthorizedImages = await db.product.count({ where: { active: true, imageSource: { not: 'PLACEHOLDER' }, imageAuthorized: false, imageUrl: { not: '' } } });
  if (unauthorizedImages) missing.push(`尚有 ${unauthorizedImages} 個未確認圖片授權`);
  if (settings?.inventoryMode !== 'DROP_SHIP') missing.push('第一版僅支援 DROP_SHIP');
  if (missing.length) {
    console.log(JSON.stringify({ ready: false, status: 'BLOCKED_AS_DESIGNED', professionalReview: 'NEEDS PROFESSIONAL REVIEW', missing }, null, 2));
    process.exitCode = 1;
  } else console.log(JSON.stringify({ ready: true, status: 'TECHNICAL_FIELDS_COMPLETE', notice: '欄位檢核完成不等於法律合規。仍須管理員確認合約、稅務、食品、冷鏈、個資與實際部署。' }, null, 2));
} catch (error) {
  console.error('上線檢核無法完成，請確認資料庫連線及 migrations。', error.code || error.name);
  process.exitCode = 1;
} finally { await db.$disconnect(); }
