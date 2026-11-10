import Link from "next/link";
import { prisma } from "@/lib/db";
import { HistoryTable } from "@/components/HistoryTable";

import { requireSession } from "@/lib/auth";

export const metadata = { title: "Test History" };

const PER_PAGE = 25;

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ page?: string; device?: string; type?: string; trigger?: string; status?: string }> }) {
  const { page = "1", device = "", type = "", trigger = "", status = "" } = await searchParams;
  const p = Math.max(1, Number(page));

  const s = await requireSession();
  const isAdmin = s.role === "ADMIN";
  const companyScope = !isAdmin && s.companyId ? { companyId: s.companyId } : undefined;

  const where = {
    ...(companyScope ? { device: { companyId: s.companyId } } : {}),
    ...(device ? { deviceId: device } : {}),
    ...(type ? { testType: type } : {}),
    ...(trigger ? { triggerType: trigger } : {}),
    ...(status ? { status } : {}),
  };

  const [rows, total, devices] = await Promise.all([
    prisma.testResult.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: PER_PAGE,
      skip: (p - 1) * PER_PAGE,
      include: { device: { select: { id: true, name: true } } },
    }),
    prisma.testResult.count({ where }),
    prisma.device.findMany({ where: companyScope, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const qs = (extra: Record<string, string>) =>
    "?" + new URLSearchParams({ page: "1", device, type, trigger, status, ...extra }).toString();

  return (
    <>
      <div className="page-head">
        <div><h1>Test History</h1><p>{total.toLocaleString("en-US")} test results recorded.</p></div>
      </div>

      {/* Filters */}
      <form className="card card-pad row" style={{ marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
        <select name="device" defaultValue={device} className="select" style={{ maxWidth: 220 }}>
          <option value="">All devices</option>
          {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select name="type" defaultValue={type} className="select" style={{ maxWidth: 150 }}>
          <option value="">All types</option>
          {["SPEED", "IPERF", "MTR", "DIG", "CURL", "TCP_PORT"].map((t) => <option key={t}>{t}</option>)}
        </select>
        <select name="trigger" defaultValue={trigger} className="select" style={{ maxWidth: 150 }}>
          <option value="">All triggers</option>
          {["MANUAL", "REMOTE", "SCHEDULED"].map((t) => <option key={t}>{t}</option>)}
        </select>
        <select name="status" defaultValue={status} className="select" style={{ maxWidth: 140 }}>
          <option value="">All status</option>
          <option value="SUCCESS">SUCCESS</option>
          <option value="FAILED">FAILED</option>
        </select>
        <button className="btn">Filter</button>
        <Link href="/history" className="btn btn-ghost">Reset</Link>
      </form>

      <div className="card">
        <HistoryTable rows={rows} showDevice />

        {/* Pagination */}
        <div className="row" style={{ padding: "14px 20px", justifyContent: "space-between" }}>
          <span className="muted" style={{ fontSize: 13 }}>
            Page {p} of {pages} · {total} results
          </span>
          <div className="row" style={{ gap: 6 }}>
            {p > 1 && <Link href={qs({ page: String(p - 1) })} className="btn btn-sm">← Prev</Link>}
            {p < pages && <Link href={qs({ page: String(p + 1) })} className="btn btn-sm">Next →</Link>}
          </div>
        </div>
      </div>
    </>
  );
}
