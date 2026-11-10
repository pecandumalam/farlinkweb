import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; walSet?: boolean };

const rawUrl =
  process.env.TURSO_DATABASE_URL ||
  (process.env.DATABASE_URL?.startsWith("libsql://") ? process.env.DATABASE_URL : undefined);
const rawToken = process.env.TURSO_AUTH_TOKEN || process.env.TOKEN;

/** true bila memakai database online (Turso / libSQL). */
export const isRemoteDb = Boolean(rawUrl);

function createClient(): PrismaClient {
  if (rawUrl) {
    // Online: Turso (dipakai di local maupun Vercel)
    const adapter = new PrismaLibSQL({ url: rawUrl, authToken: rawToken });
    return new PrismaClient({ adapter });
  }
  // Offline: file SQLite lokal via DATABASE_URL
  return new PrismaClient();
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// WAL mode hanya untuk SQLite file lokal (Turso tidak mengizinkan PRAGMA ini)
if (!isRemoteDb && !globalForPrisma.walSet) {
  globalForPrisma.walSet = true;
  prisma.$queryRawUnsafe("PRAGMA journal_mode=WAL;").catch(() => {});
}
