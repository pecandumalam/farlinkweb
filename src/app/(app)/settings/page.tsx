import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { SettingsClient } from "./SettingsClient";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ force?: string }> }) {
  const session = await requireSession();
  const { force } = await searchParams;

  const [users, auditLogs] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { select: { name: true } } },
    }),
  ]);

  return (
    <>
      <div className="page-head">
        <div><h1>Settings</h1><p>Manage accounts, users, demo data generation, and audit logs.</p></div>
      </div>
      <SettingsClient
        users={users}
        auditLogs={auditLogs}
        currentUserId={session.sub}
        forceChange={force === "1"}
      />
    </>
  );
}
