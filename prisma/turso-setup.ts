/**
 * Setup database Turso (online).
 *
 *   npm run db:turso:push          -> buat tabel di Turso (jika belum ada)
 *   npm run db:turso:copy          -> buat tabel + salin semua data dari SQLite lokal
 *
 * Butuh env: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN (dan DATABASE_URL untuk --copy-local).
 */
import { readFileSync } from "fs";
import { join } from "path";
import { createClient } from "@libsql/client";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { ensureDbReady, rawUrl, rawToken } from "../src/lib/db";

const isVercelBuild = process.argv.includes("--vercel-build");
const url = rawUrl;
const authToken = rawToken;
if (!url) {
  if (isVercelBuild) {
    console.log("• Skip Turso setup (no remote URL configured)");
    process.exit(0);
  }
  console.error("✖ TURSO_DATABASE_URL belum diset");
  process.exit(1);
}

const copyLocal = process.argv.includes("--copy-local");
const BATCH = 500;

async function pushSchema() {
  const libsql = createClient({ url: url!, authToken });
  const existing = await libsql.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%'",
  );
  const tables = existing.rows.map((r) => String(r.name));
  if (tables.includes("User")) {
    console.log(`• Schema sudah ada di Turso (${tables.length} tabel), dilewati`);
  } else {
    const sql = readFileSync(join(__dirname, "turso-schema.sql"), "utf-8");
    await libsql.executeMultiple(sql);
    console.log("✔ Schema dibuat di Turso");
  }
  libsql.close();
}

type Delegate = {
  findMany: (args: { skip: number; take: number }) => Promise<unknown[]>;
  createMany: (args: { data: unknown[] }) => Promise<{ count: number }>;
  count: () => Promise<number>;
};

async function copyData() {
  const local = new PrismaClient(); // DATABASE_URL (file SQLite)
  const remote = new PrismaClient({ adapter: new PrismaLibSQL({ url: url!, authToken }) });

  // Urutan mengikuti foreign key
  const models = ["company", "user", "device", "testResult", "deviceCommand", "auditLog", "discoveredDevice"] as const;

  try {
    for (const m of models) {
      const src = (local as unknown as Record<string, Delegate>)[m];
      const dst = (remote as unknown as Record<string, Delegate>)[m];
      const already = await dst.count();
      if (already > 0) {
        console.log(`• ${m}: Turso sudah berisi ${already} baris, dilewati`);
        continue;
      }
      let copied = 0;
      for (let skip = 0; ; skip += BATCH) {
        const rows = await src.findMany({ skip, take: BATCH });
        if (rows.length === 0) break;
        const r = await dst.createMany({ data: rows });
        copied += r.count;
      }
      console.log(`✔ ${m}: ${copied} baris disalin`);
    }
  } finally {
    await local.$disconnect();
    await remote.$disconnect();
  }
}

(async () => {
  if (isVercelBuild) {
    try {
      await ensureDbReady();
      console.log("✔ Turso schema & admin user ready (vercel-build)");
    } catch (err) {
      console.warn("⚠ Turso setup warning during build:", err);
    }
    return;
  }
  await pushSchema();
  if (copyLocal) await copyData();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
