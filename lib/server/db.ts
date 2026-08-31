import { PrismaClient } from '@prisma/client';

const globalDb = globalThis as unknown as { dongmenPrisma?: PrismaClient };
export const db = globalDb.dongmenPrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalDb.dongmenPrisma = db;
