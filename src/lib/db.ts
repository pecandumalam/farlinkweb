import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createClient as createLibsqlClient } from "@libsql/client";
import bcrypt from "bcryptjs";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  walSet?: boolean;
  dbReadyPromise?: Promise<void>;
};

const FALLBACK_TURSO_URL = "libsql://farlinkgo-farlinkgo.aws-ap-northeast-1.turso.io";
const FALLBACK_TURSO_TOKEN =
  "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTIzNjQzMjYsImlkIjoiMDFhMTUxM2MtM2UwMS03OGIzLThlMTktNmYxZTA5ZTIxNjAzIiwia2lkIjoibmlNQVpQeEJ2ejF5NW51ZjBOYmJJbGhMZFBvVXIweDdoeG9Edy1JMzRKVSIsInJpZCI6ImE1NDUwMTQzLTMxMjctNDQ3Yi05ZmU3LTYyNjRjYzI1ZDAwNCJ9.i95ditFA7Xr6kIzbCjjkfqSvcSsrDpv_0APh_8wVhTGDv4SHxBxI-CWXhMAosS9tmlkQLtZ-Ev6DYN-CMyh-Bg";

function cleanEnv(val?: string): string | undefined {
  if (!val) return undefined;
  const trimmed = val.trim().replace(/^["']+|["']+$/g, "").trim();
  if (!trimmed || trimmed.includes("<db>")) return undefined;
  return trimmed;
}

function isLibsqlUrl(url?: string): boolean {
  if (!url) return false;
  return url.startsWith("libsql://") || url.startsWith("https://") || url.startsWith("wss://");
}

const cleanTursoUrl = cleanEnv(process.env.TURSO_DATABASE_URL);
const cleanDbUrl = cleanEnv(process.env.DATABASE_URL);

export const rawUrl =
  (isLibsqlUrl(cleanTursoUrl) ? cleanTursoUrl : undefined) ||
  (isLibsqlUrl(cleanDbUrl) ? cleanDbUrl : undefined) ||
  (process.env.VERCEL ? FALLBACK_TURSO_URL : undefined);

export const rawToken =
  cleanEnv(process.env.TURSO_AUTH_TOKEN) ||
  cleanEnv(process.env.TOKEN) ||
  (rawUrl === FALLBACK_TURSO_URL ? FALLBACK_TURSO_TOKEN : undefined);

/** true bila memakai database online (Turso / libSQL). */
export const isRemoteDb = Boolean(rawUrl);

function createBaseClient(): PrismaClient {
  if (rawUrl) {
    // Online: Turso (dipakai di local maupun Vercel)
    const adapter = new PrismaLibSQL({ url: rawUrl, authToken: rawToken });
    return new PrismaClient({ adapter });
  }
  // Offline: file SQLite lokal via DATABASE_URL
  return new PrismaClient();
}

const basePrisma = createBaseClient();

function createClient(): PrismaClient {
  if (!rawUrl) return basePrisma;

  return basePrisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          try {
            return await query(args);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes("no such table") || msg.includes("TableDoesNotExist") || msg.includes("P2021")) {
              await ensureDbReady();
              return await query(args);
            }
            throw err;
          }
        },
      },
    },
  }) as unknown as PrismaClient;
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// WAL mode hanya untuk SQLite file lokal (Turso tidak mengizinkan PRAGMA ini)
if (!isRemoteDb && !globalForPrisma.walSet) {
  globalForPrisma.walSet = true;
  basePrisma.$queryRawUnsafe("PRAGMA journal_mode=WAL;").catch(() => {});
}

const TURSO_SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS "Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ADMIN',
    "companyId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Device" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'FARLINK_GO',
    "companyId" TEXT,
    "ipAddress" TEXT,
    "macAddress" TEXT,
    "firmwareVersion" TEXT,
    "agentVersion" TEXT,
    "tokenHash" TEXT,
    "lastSeenAt" DATETIME,
    "gatewayIp" TEXT,
    "gatewayStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "gatewayLatency" REAL,
    "gatewayCheckedAt" DATETIME,
    "internetStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
    "scheduleInterval" INTEGER NOT NULL DEFAULT 0,
    "lastScheduledAt" DATETIME,
    "config" TEXT NOT NULL DEFAULT '{}',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Device_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "TestResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "testType" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "target" TEXT,
    "download" REAL,
    "upload" REAL,
    "latency" REAL,
    "jitter" REAL,
    "packetLoss" REAL,
    "resultData" TEXT NOT NULL DEFAULT '{}',
    "errorMessage" TEXT,
    "startedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "duration" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TestResult_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "DeviceCommand" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdById" TEXT,
    "result" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" DATETIME,
    "completedAt" DATETIME,
    CONSTRAINT "DeviceCommand_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeviceCommand_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "detail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "DiscoveredDevice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serialNumber" TEXT NOT NULL,
    "macAddress" TEXT,
    "ipAddress" TEXT,
    "deviceType" TEXT NOT NULL DEFAULT 'FARLINK_GO',
    "agentVersion" TEXT,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isRegistered" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE INDEX IF NOT EXISTS "User_companyId_idx" ON "User"("companyId");
CREATE UNIQUE INDEX IF NOT EXISTS "Company_name_key" ON "Company"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "Device_name_key" ON "Device"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "Device_serialNumber_key" ON "Device"("serialNumber");
CREATE INDEX IF NOT EXISTS "Device_companyId_idx" ON "Device"("companyId");
CREATE INDEX IF NOT EXISTS "TestResult_deviceId_startedAt_idx" ON "TestResult"("deviceId", "startedAt");
CREATE INDEX IF NOT EXISTS "TestResult_startedAt_idx" ON "TestResult"("startedAt");
CREATE INDEX IF NOT EXISTS "DeviceCommand_deviceId_status_idx" ON "DeviceCommand"("deviceId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "DiscoveredDevice_serialNumber_key" ON "DiscoveredDevice"("serialNumber");
`;

/**
 * Self-healing inisialisasi tabel & default admin untuk Turso / SQLite di Vercel
 * apabila database target belum memiliki tabel `User` atau akun admin.
 */
export async function ensureDbReady(): Promise<void> {
  if (globalForPrisma.dbReadyPromise) {
    return globalForPrisma.dbReadyPromise;
  }

  globalForPrisma.dbReadyPromise = (async () => {
    try {
      if (rawUrl) {
        const libsql = createLibsqlClient({ url: rawUrl, authToken: rawToken });
        try {
          await libsql.executeMultiple(TURSO_SCHEMA_DDL);
        } finally {
          libsql.close();
        }
      }

      const adminEmail = (cleanEnv(process.env.ADMIN_EMAIL) ?? "admin@farlink.local").toLowerCase();
      const adminPassword = cleanEnv(process.env.ADMIN_PASSWORD) ?? "admin123";

      const existing = await basePrisma.user.findUnique({ where: { email: adminEmail } });
      if (!existing) {
        await basePrisma.user.create({
          data: {
            name: "Administrator",
            email: adminEmail,
            passwordHash: await bcrypt.hash(adminPassword, 12),
            role: "ADMIN",
            isActive: true,
            mustChangePassword: false,
          },
        });
      }
    } catch (err) {
      globalForPrisma.dbReadyPromise = undefined;
      throw err;
    }
  })();

  return globalForPrisma.dbReadyPromise;
}
