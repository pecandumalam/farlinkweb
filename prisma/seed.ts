import bcrypt from "bcryptjs";
import { generateDummy } from "../src/lib/dummy";
// Memakai Turso bila TURSO_DATABASE_URL diset, selain itu SQLite lokal
import { prisma } from "../src/lib/db";

async function main() {
  const email = process.env.ADMIN_EMAIL ?? "admin@farlink.local";
  const password = process.env.ADMIN_PASSWORD ?? "admin123";
  const adminOnly = process.argv.includes("--admin-only");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    await prisma.user.create({
      data: {
        name: "Administrator",
        email,
        passwordHash: await bcrypt.hash(password, 12),
        mustChangePassword: adminOnly, // production: wajib ganti password
      },
    });
    console.log(`✔ Admin dibuat: ${email}`);
  } else {
    console.log(`• Admin sudah ada: ${email}`);
  }

  if (adminOnly) return;

  const hasDemo = await prisma.device.count({ where: { isDemo: true } });
  if (hasDemo) {
    console.log("• Dummy data sudah ada, dilewati");
    return;
  }
  const r = await generateDummy(prisma, {
    companyName: "Demo Company",
    devices: 5,
    testType: "SPEED",
    intervalMin: 15,
    hours: 48,
    failRate: 0.06,
  });
  await prisma.company.upsert({ where: { name: "PT Nusantara Net" }, update: {}, create: { name: "PT Nusantara Net", address: "Bandung" } });
  console.log(`✔ Dummy: ${r.company}, ${r.devices} devices, ${r.results} results`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
