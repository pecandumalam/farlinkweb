import Link from "next/link";
import { prisma } from "@/lib/db";
import { deviceStatus, fmtDateTime, INTERVALS, relTime } from "@/lib/constants";
import { AutoRefresh, Badge } from "@/components/ui";
import { ScheduleControl } from "@/components/DeviceControls";
import { CalendarClock, Router } from "lucide-react";

import { requireSession } from "@/lib/auth";

export const metadata = { title: "Schedules" };

export default async function SchedulesPage() {
  const s = await requireSession();
  const isAdmin = s.role === "ADMIN";
  const companyScope = !isAdmin && s.companyId ? { companyId: s.companyId } : undefined;

  const devices = await prisma.device.findMany({
    where: companyScope,
    include: { company: true },
    orderBy: [{ scheduleEnabled: "desc" }, { name: "asc" }],
  });
  const enabled = devices.filter((d) => d.scheduleEnabled);

  return (
    <>
      <AutoRefresh seconds={60} />
      <div className="page-head">
        <div>
          <h1>Schedules</h1>
          <p>{enabled.length} device(s) actively running scheduled tests.</p>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid g-4" style={{ marginBottom: 16 }}>
        {INTERVALS.filter((i) => i.value > 0).map((iv) => {
          const n = devices.filter((d) => d.scheduleEnabled && d.scheduleInterval === iv.value).length;
          return (
            <div key={iv.value} className="card kpi">
              <div className="kpi-icon tone-primary" style={{ position: "static", marginBottom: 8 }}><CalendarClock size={18} /></div>
              <div className="kpi-label">{iv.label}</div>
              <div className="kpi-value">{n}</div>
              <div className="kpi-sub">active devices</div>
            </div>
          );
        })}
        <div className="card kpi">
          <div className="kpi-icon tone-danger" style={{ position: "static", marginBottom: 8 }}><CalendarClock size={18} /></div>
          <div className="kpi-label">OFF</div>
          <div className="kpi-value">{devices.filter((d) => !d.scheduleEnabled).length}</div>
          <div className="kpi-sub">not scheduled</div>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Device</th>
                <th>Company</th>
                <th>Status</th>
                <th>Interval</th>
                <th>Last Run</th>
                <th>Next Run</th>
                <th>Set Interval</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => {
                const next = d.scheduleEnabled && d.lastScheduledAt
                  ? new Date(d.lastScheduledAt.getTime() + d.scheduleInterval * 60_000)
                  : null;
                const st = deviceStatus(d);
                return (
                  <tr key={d.id}>
                    <td>
                      <Link href={`/devices/${d.id}?tab=schedule`} style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                        <Router size={14} className="muted" />{d.name}
                      </Link>
                    </td>
                    <td>{d.company?.name ?? <span className="dim">—</span>}</td>
                    <td><Badge value={st} /></td>
                    <td>
                      {d.scheduleEnabled
                        ? <Badge value={INTERVALS.find((i) => i.value === d.scheduleInterval)?.label ?? "?"} dot={false} />
                        : <span className="dim">OFF</span>}
                    </td>
                    <td className="mono">{fmtDateTime(d.lastScheduledAt)}</td>
                    <td className="mono">
                      {next
                        ? <span style={{ color: next < new Date() ? "var(--warning)" : undefined }}>{fmtDateTime(next)}</span>
                        : <span className="dim">—</span>}
                    </td>
                    <td><ScheduleControl deviceId={d.id} interval={d.scheduleInterval} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!devices.length && <div className="empty">No devices registered yet</div>}
        </div>
      </div>
    </>
  );
}
