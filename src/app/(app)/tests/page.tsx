import Link from "next/link";
import { prisma } from "@/lib/db";
import { fmtDateTime, relTime, deviceStatus } from "@/lib/constants";
import { AutoRefresh, Badge } from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { RunTestButtons } from "@/components/DeviceControls";
import { sendCommand } from "@/lib/actions";
import { Gauge, Route, Globe, Link2, Plug, Router } from "lucide-react";

import { requireSession } from "@/lib/auth";

export const metadata = { title: "Tests" };

export default async function TestsPage({ searchParams }: { searchParams: Promise<{ device?: string }> }) {
  const { device: deviceId = "" } = await searchParams;
  const s = await requireSession();
  const isAdmin = s.role === "ADMIN";
  const companyScope = !isAdmin && s.companyId ? { companyId: s.companyId } : undefined;

  const [devices, recent] = await Promise.all([
    prisma.device.findMany({
      where: companyScope,
      include: { company: true },
      orderBy: { name: "asc" },
    }),
    prisma.testResult.findMany({
      where: {
        triggerType: "REMOTE",
        ...(companyScope ? { device: { companyId: s.companyId } } : {}),
      },
      orderBy: { startedAt: "desc" },
      take: 15,
      include: { device: { select: { id: true, name: true } } },
    }),
  ]);

  const selectedDevice = deviceId ? devices.find((d) => d.id === deviceId) : devices[0];

  return (
    <>
      <AutoRefresh seconds={15} />
      <div className="page-head">
        <div>
          <h1>Run Tests</h1>
          <p>Trigger network benchmark tests remotely on FarLink probes.</p>
        </div>
      </div>

      <div className="grid g-main" style={{ marginBottom: 16 }}>
        {/* Pilih device + jalankan */}
        <div className="card">
          <div className="card-head"><h2>Select Device & Run</h2></div>
          <div className="card-body stack">
            <form className="row">
              <select name="device" defaultValue={deviceId} className="select" style={{ maxWidth: 320 }}>
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>{d.name} — {d.company?.name ?? "Unassigned"}</option>
                ))}
              </select>
              <button className="btn">Select</button>
            </form>

            {selectedDevice && (
              <>
                <div className="row" style={{ gap: 12, padding: "10px 0", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
                  <div className={`kpi-icon tone-${deviceStatus(selectedDevice) === "ONLINE" ? "success" : "danger"}`} style={{ position: "static" }}>
                    <Router size={18} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{selectedDevice.name}</div>
                    <div className="dim" style={{ fontSize: 12 }}>{selectedDevice.ipAddress ?? "—"} · Agent {selectedDevice.agentVersion ?? "—"} · {relTime(selectedDevice.lastSeenAt)}</div>
                  </div>
                  <Badge value={deviceStatus(selectedDevice)} />
                </div>
                <RunTestButtons deviceId={selectedDevice.id} />
                <p className="dim" style={{ fontSize: 12.5 }}>
                  Trigger is recorded as REMOTE. The probe picks up the command on its next polling cycle (within ~30s).
                </p>
              </>
            )}
            {!devices.length && <div className="empty">No devices registered. Add one from the Devices menu.</div>}
          </div>
        </div>

        {/* Test types descriptions */}
        <div className="card">
          <div className="card-head"><h2>Test Types</h2></div>
          <div className="card-body stack" style={{ gap: 12 }}>
            {[
              { icon: Gauge, t: "Speed Test", d: "Download, upload, latency, jitter, and packet loss using Speedtest.net." },
              { icon: Route, t: "MTR", d: "End-to-end path trace to target IP, including hops and packet loss per hop." },
              { icon: Globe, t: "DIG", d: "DNS resolution response timing and resolver replies for configured domain." },
              { icon: Link2, t: "CURL", d: "HTTP/HTTPS response time, status code, and handshake duration to target URL." },
              { icon: Plug, t: "TCP Port", d: "Probe reachability and latency for specific TCP ports (open or timed out)." },
            ].map((item) => (
              <div key={item.t} className="row" style={{ gap: 12, alignItems: "flex-start" }}>
                <div className="kpi-icon tone-primary" style={{ position: "static", flexShrink: 0 }}><item.icon size={16} /></div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{item.t}</div>
                  <div className="muted" style={{ fontSize: 12.5 }}>{item.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent remote tests */}
      <div className="card">
        <div className="card-head">
          <h2>Recent Remote Tests</h2>
          <Link href="/history?trigger=REMOTE" className="btn btn-ghost btn-sm">Full history</Link>
        </div>
        <div className="table-wrap">
          <table className="table compact">
            <thead>
              <tr><th>Time</th><th>Device</th><th>Type</th><th>Result</th><th>Status</th></tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{fmtDateTime(r.startedAt)}</td>
                  <td><Link href={`/devices/${r.device.id}`}>{r.device.name}</Link></td>
                  <td>{r.testType}</td>
                  <td className="mono">{r.status === "FAILED" ? <span style={{ color: "var(--danger)" }}>{r.errorMessage ?? "FAILED"}</span> : (r.download != null ? `${r.download.toFixed(0)}/${r.upload?.toFixed(0)} Mbps` : r.latency != null ? `${r.latency} ms` : "OK")}</td>
                  <td><Badge value={r.status} /></td>
                </tr>
              ))}
              {!recent.length && <tr><td colSpan={5} className="empty">No remote tests recorded</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
