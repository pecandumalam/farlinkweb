import Link from "next/link";
import { Building2, Router, Wifi, WifiOff, FlaskConical, CheckCircle2, XCircle, AlertTriangle, Database } from "lucide-react";
import { prisma } from "@/lib/db";
import { deviceStatus, relTime } from "@/lib/constants";
import { AutoRefresh, Badge } from "@/components/ui";
import { resetDatabase } from "@/lib/actions";
import { CombinedChart } from "@/components/CombinedChart";
import { HistoryTable } from "@/components/HistoryTable";
import { ConfirmButton } from "@/components/ConfirmButton";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await requireSession();
  if (session.role !== "ADMIN" && session.companyId) {
    redirect(`/customers/${session.companyId}`);
  }

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const since = new Date(Date.now() - 48 * 3600_000);

  const [companies, devices, today, todayOk, recent, chartRows] = await Promise.all([
    prisma.company.count({ where: { isActive: true } }),
    prisma.device.findMany({ include: { company: true }, orderBy: { name: "asc" } }),
    prisma.testResult.count({ where: { startedAt: { gte: start } } }),
    prisma.testResult.count({ where: { startedAt: { gte: start }, status: "SUCCESS" } }),
    prisma.testResult.findMany({ orderBy: { startedAt: "desc" }, take: 8, include: { device: { select: { id: true, name: true } } } }),
    prisma.testResult.findMany({ where: { testType: { in: ["SPEED", "IPERF", "TCP_PORT"] }, startedAt: { gte: since } }, select: { startedAt: true, download: true, upload: true, latency: true, triggerType: true, status: true } }),
  ]);

  const st = devices.map((d) => ({ ...d, st: deviceStatus(d) }));
  const online = st.filter((d) => d.st === "ONLINE").length;
  const warning = st.filter((d) => d.st === "WARNING").length;
  const offline = st.filter((d) => d.st === "OFFLINE").length;
  const failed = today - todayOk;
  const rate = today ? Math.round((todayOk / today) * 100) : 0;

  // agregasi per 15 menit (rata-rata semua device) agar grafik ringan
  const buckets = new Map<string, { t: number; d: number[]; u: number[]; l: number[]; trigger: string }>();
  for (const r of chartRows) {
    if (r.status !== "SUCCESS") continue;
    const t = Math.floor(r.startedAt.getTime() / 900_000) * 900_000;
    const k = `${t}-${r.triggerType}`;
    const b = buckets.get(k) ?? { t, d: [], u: [], l: [], trigger: r.triggerType };
    if (r.download != null) b.d.push(r.download);
    if (r.upload != null) b.u.push(r.upload);
    if (r.latency != null) b.l.push(r.latency);
    buckets.set(k, b);
  }
  const avg = (a: number[]) => (a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : null);
  const points = [...buckets.values()].map((b) => ({ t: b.t, download: avg(b.d), upload: avg(b.u), latency: avg(b.l), trigger: b.trigger, status: "SUCCESS" }));

  const kpis = [
    { label: "Total Customers", value: companies, icon: Building2, tone: "primary", sub: "Active companies" },
    { label: "Total Devices", value: devices.length, icon: Router, tone: "info", sub: `${warning} warnings` },
    { label: "Online", value: online + warning, icon: Wifi, tone: "success", sub: `${devices.length ? Math.round(((online + warning) / devices.length) * 100) : 0}% uptime` },
    { label: "Offline", value: offline, icon: WifiOff, tone: "danger", sub: "No heartbeat received" },
    { label: "Tests Today", value: today.toLocaleString("en-US"), icon: FlaskConical, tone: "primary", sub: "Since 00:00" },
    { label: "Successful", value: todayOk.toLocaleString("en-US"), icon: CheckCircle2, tone: "success", sub: `${rate}% success rate` },
    { label: "Failed", value: failed.toLocaleString("en-US"), icon: XCircle, tone: "danger", sub: "Flagged for diagnosis" },
    { label: "Warning", value: warning, icon: AlertTriangle, tone: "warning", sub: "Gateway unreachable" },
  ];

  return (
    <>
      <AutoRefresh seconds={30} />
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>Realtime device status summary and network test diagnostics.</p>
        </div>
        <ConfirmButton
          action={resetDatabase}
          label="Reset Database"
          danger
          confirm="WARNING: All test results, history logs, and non-admin demo devices will be purged. Proceed?"
          small={false}
        />
      </div>

      <div className="grid g-4" style={{ marginBottom: 16 }}>
        {kpis.map((k, i) => (
          <div key={k.label} className="card kpi fade-in" style={{ animationDelay: `${i * 30}ms` }}>
            <div className={`kpi-icon tone-${k.tone}`}><k.icon size={18} /></div>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid g-main" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-head"><h2>Combined Graph · Download / Upload (avg Mbps)</h2></div>
          <div className="card-body"><CombinedChart data={points} /></div>
        </div>
        <div className="card">
          <div className="card-head">
            <h2>Device Status</h2>
            <Link href="/devices" className="btn btn-ghost btn-sm">View all</Link>
          </div>
          <div className="card-body stack" style={{ gap: 14 }}>
            <div className="grid g-3" style={{ gap: 8 }}>
              <div className="card card-pad" style={{ padding: 12, boxShadow: "none" }}><div className="muted" style={{ fontSize: 11 }}>ONLINE</div><div className="stat-big" style={{ color: "var(--success)" }}>{online}</div></div>
              <div className="card card-pad" style={{ padding: 12, boxShadow: "none" }}><div className="muted" style={{ fontSize: 11 }}>WARNING</div><div className="stat-big" style={{ color: "var(--warning)" }}>{warning}</div></div>
              <div className="card card-pad" style={{ padding: 12, boxShadow: "none" }}><div className="muted" style={{ fontSize: 11 }}>OFFLINE</div><div className="stat-big" style={{ color: "var(--danger)" }}>{offline}</div></div>
            </div>
            <div className="stack" style={{ gap: 6, maxHeight: 260, overflowY: "auto" }}>
              {st.slice(0, 12).map((d) => (
                <Link key={d.id} href={`/devices/${d.id}`} className="tree-device">
                  <Router size={16} className="dim" />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</div>
                    <div className="dim" style={{ fontSize: 11.5 }}>{d.company?.name ?? "Unassigned"} · {relTime(d.lastSeenAt)}</div>
                  </div>
                  <Badge value={d.st} />
                </Link>
              ))}
              {!st.length && <div className="empty">No devices registered</div>}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Recent Tests</h2>
          <Link href="/history" className="btn btn-ghost btn-sm">Full history</Link>
        </div>
        <HistoryTable rows={recent} showDevice />
      </div>
    </>
  );
}
