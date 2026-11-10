import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { deviceStatus, relTime, fmtDateTime, TEST_LABEL } from "@/lib/constants";
import { AutoRefresh, Badge, PrintButton } from "@/components/ui";
import { CompanyButton, DeviceButton } from "@/components/Forms";
import { ConfirmButton } from "@/components/ConfirmButton";
import { deleteCompany, toggleCompany } from "@/lib/actions";
import { requireSession } from "@/lib/auth";
import { CombinedChart } from "@/components/CombinedChart";
import { RunTestButtons, ScheduleControl } from "@/components/DeviceControls";
import {
  Building2,
  Router,
  Wifi,
  WifiOff,
  Gauge,
  Activity,
  FileText,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  Globe,
  Clock,
  Terminal as TerminalIcon,
  ShieldCheck,
  Calendar,
  Layers,
  Crown,
} from "lucide-react";
import type { Point } from "@/components/CombinedChart";
import { DeviceTypeBadge } from "@/components/DeviceTypeBadge";
import { TestMasterModalButton } from "@/components/MasterConnectionTest";
import { getDeviceRole } from "@/lib/device-utils";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await prisma.company.findUnique({ where: { id } });
  return { title: c?.name ?? "Customer" };
}

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab = "overview" } = await searchParams;

  const session = await requireSession();
  const isAdmin = session.role === "ADMIN";

  // Company-scoped security guard: Customer users can ONLY see their assigned company
  if (!isAdmin && session.companyId && session.companyId !== id) {
    notFound();
  }

  const since24h = new Date(Date.now() - 24 * 3600_000);

  const [c, companies, testResults24h] = await Promise.all([
    prisma.company.findUnique({
      where: { id },
      include: {
        devices: {
          orderBy: { name: "asc" },
        },
      },
    }),
    prisma.company.findMany({ select: { id: true, name: true } }),
    prisma.testResult.findMany({
      where: {
        device: { companyId: id },
        startedAt: { gte: since24h },
      },
      orderBy: { startedAt: "desc" },
      include: {
        device: { select: { id: true, name: true, serialNumber: true } },
      },
    }),
  ]);

  if (!c) notFound();

  // Device status mappings
  const devStatuses = c.devices.map((d) => ({ ...d, st: deviceStatus(d) }));
  const onlineCount = devStatuses.filter((d) => d.st === "ONLINE").length;
  const warningCount = devStatuses.filter((d) => d.st === "WARNING").length;
  const offlineCount = devStatuses.filter((d) => d.st === "OFFLINE").length;

  // Company-scoped Chart points (strictly this company's devices)
  const chartPoints: Point[] = testResults24h
    .filter((r) => r.status === "SUCCESS")
    .map((r) => ({
      t: r.startedAt.getTime(),
      download: r.download,
      upload: r.upload,
      latency: r.latency,
      trigger: r.triggerType,
      status: "SUCCESS",
    }));

  // =========================================================================
  // Intelligent 24-Hour Daily Report Analytics Engine
  // =========================================================================
  const totalTests = testResults24h.length;
  const successfulTests = testResults24h.filter((r) => r.status === "SUCCESS");
  const successRate = totalTests > 0 ? Math.round((successfulTests.length / totalTests) * 100) : 0;

  // 1. Inactive Devices Analysis
  // Devices with 0 tests in 24 hours OR completely offline
  const inactiveDevices = c.devices.filter((d) => {
    const devTests = testResults24h.filter((r) => r.deviceId === d.id);
    const isOffline = deviceStatus(d) === "OFFLINE";
    return devTests.length === 0 || isOffline;
  });

  // 2. Bandwidth Degradation Analysis per Device
  // Check hourly average throughput to detect degradation windows (e.g. 15:00 - 17:00 / 3 to 5 pm)
  const degradationAlerts: Array<{
    deviceId: string;
    deviceName: string;
    startHour: number;
    endHour: number;
    avgSpeed: number;
    baselineSpeed: number;
    dropPercent: number;
  }> = [];

  for (const d of c.devices) {
    const devSpeedTests = testResults24h.filter(
      (r) => r.deviceId === d.id && r.testType === "SPEED" && r.status === "SUCCESS" && r.download != null,
    );
    if (devSpeedTests.length >= 4) {
      const overallAvg =
        devSpeedTests.reduce((acc, cur) => acc + (cur.download || 0), 0) / devSpeedTests.length;

      // Group by hour
      const hourly = new Map<number, number[]>();
      for (const t of devSpeedTests) {
        const h = new Date(t.startedAt).getHours();
        const list = hourly.get(h) || [];
        list.push(t.download || 0);
        hourly.set(h, list);
      }

      // Check degradation where hourly speed drops below 60% of baseline
      const degradedHours: number[] = [];
      for (const [hour, speeds] of hourly.entries()) {
        const hourAvg = speeds.reduce((a, b) => a + b, 0) / speeds.length;
        if (hourAvg < overallAvg * 0.65) {
          degradedHours.push(hour);
        }
      }

      if (degradedHours.length > 0) {
        degradedHours.sort((a, b) => a - b);
        const startH = degradedHours[0];
        const endH = degradedHours[degradedHours.length - 1] + 1;
        const degradedSpeeds = devSpeedTests
          .filter((t) => degradedHours.includes(new Date(t.startedAt).getHours()))
          .map((t) => t.download || 0);
        const avgDegraded = degradedSpeeds.length
          ? degradedSpeeds.reduce((a, b) => a + b, 0) / degradedSpeeds.length
          : overallAvg * 0.5;

        degradationAlerts.push({
          deviceId: d.id,
          deviceName: d.name,
          startHour: startH,
          endHour: endH,
          avgSpeed: Math.round(avgDegraded),
          baselineSpeed: Math.round(overallAvg),
          dropPercent: Math.round(((overallAvg - avgDegraded) / overallAvg) * 100),
        });
      }
    }
  }

  // 3. DNS Missing / Resolution Failures Analysis
  const dnsFailures = testResults24h.filter(
    (r) =>
      r.testType === "DIG" ||
      (r.errorMessage &&
        (r.errorMessage.toLowerCase().includes("dns") ||
          r.errorMessage.toLowerCase().includes("resolve") ||
          r.errorMessage.toLowerCase().includes("not known"))),
  );
  const dnsFailureCountByDevice = new Map<string, { count: number; name: string }>();
  for (const f of dnsFailures) {
    const cur = dnsFailureCountByDevice.get(f.deviceId) || { count: 0, name: f.device.name };
    cur.count += 1;
    dnsFailureCountByDevice.set(f.deviceId, cur);
  }

  // 4. Packet Loss Analysis
  // Calculate average packet loss and count tests with zero loss
  const testsWithLossData = testResults24h.filter((r) => r.packetLoss != null);
  const zeroLossTests = testsWithLossData.filter((r) => r.packetLoss === 0.0);
  const avgPacketLoss =
    testsWithLossData.length > 0
      ? +(
          testsWithLossData.reduce((acc, cur) => acc + (cur.packetLoss || 0), 0) /
          testsWithLossData.length
        ).toFixed(2)
      : 0.0;
  const zeroLossRate =
    testsWithLossData.length > 0
      ? Math.round((zeroLossTests.length / testsWithLossData.length) * 100)
      : 100;

  // 5. Overall Averages
  const dlSpeeds = successfulTests.filter((r) => r.download != null).map((r) => r.download as number);
  const avgDownload = dlSpeeds.length ? Math.round(dlSpeeds.reduce((a, b) => a + b, 0) / dlSpeeds.length) : 0;

  const ulSpeeds = successfulTests.filter((r) => r.upload != null).map((r) => r.upload as number);
  const avgUpload = ulSpeeds.length ? Math.round(ulSpeeds.reduce((a, b) => a + b, 0) / ulSpeeds.length) : 0;

  const latencies = successfulTests.filter((r) => r.latency != null).map((r) => r.latency as number);
  const avgLatency = latencies.length ? +(latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(1) : 0;

  const tabs = [
    { k: "overview", l: "Company Overview" },
    { k: "graph", l: "Company Graphs" },
    { k: "daily-report", l: "24h Daily Report" },
  ];

  return (
    <>
      <AutoRefresh seconds={30} />

      {/* Header */}
      <div className="page-head">
        <div>
          <p className="dim" style={{ marginBottom: 4 }}>
            <Link href="/customers">Customers</Link> / {c.name}
          </p>
          <div className="row" style={{ gap: 12, alignItems: "center" }}>
            <h1 style={{ margin: 0 }}>{c.name}</h1>
            <Badge value={c.isActive ? "ONLINE" : "OFFLINE"} />
            <span className="badge b-unknown mono">{c.devices.length} Devices</span>
          </div>
          <p className="dim" style={{ marginTop: 4 }}>
            {c.address ?? "Indonesia"} · Contact: {c.contact ?? "—"}
          </p>
        </div>
        <div className="row">
          {isAdmin && (
            <>
              <DeviceButton companies={companies} defaultCompany={c.id} />
              <CompanyButton company={c} />
              <ConfirmButton
                action={toggleCompany.bind(null, c.id)}
                label={c.isActive ? "Deactivate" : "Activate"}
                confirm={`${c.isActive ? "Deactivate" : "Activate"} ${c.name}?`}
              />
              <ConfirmButton
                action={deleteCompany.bind(null, c.id)}
                label="Delete"
                danger
                confirm={`Delete ${c.name}? Associated devices will become unassigned.`}
              />
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {tabs.map((t) => (
          <Link
            key={t.k}
            id={`tab-${t.k}`}
            href={`/customers/${id}?tab=${t.k}`}
            className={`tab ${tab === t.k ? "active" : ""}`}
          >
            {t.l}
          </Link>
        ))}
      </div>

      {/* ================================================================= */}
      {/* TAB 1: OVERVIEW                                                   */}
      {/* ================================================================= */}
      {tab === "overview" && (
        <div className="stack" style={{ gap: 16 }}>
          {/* Company KPIs */}
          <div className="grid g-4">
            <div className="card kpi">
              <div className="kpi-icon tone-primary">
                <Router size={18} />
              </div>
              <div className="kpi-label">Total Devices</div>
              <div className="kpi-value">{c.devices.length}</div>
              <div className="kpi-sub">
                {onlineCount} Online · {offlineCount} Offline
              </div>
            </div>
            <div className="card kpi">
              <div className="kpi-icon tone-success">
                <Gauge size={18} />
              </div>
              <div className="kpi-label">Avg Throughput (24h)</div>
              <div className="kpi-value">
                {avgDownload}/{avgUpload} <span style={{ fontSize: 13 }}>Mbps</span>
              </div>
              <div className="kpi-sub">Average DL / UL across all company devices</div>
            </div>
            <div className="card kpi">
              <div className="kpi-icon tone-info">
                <Activity size={18} />
              </div>
              <div className="kpi-label">Avg Latency & Loss</div>
              <div className="kpi-value">
                {avgLatency} <span style={{ fontSize: 13 }}>ms</span>
              </div>
              <div className="kpi-sub">
                Packet Loss: {avgPacketLoss}% ({zeroLossRate}% tests ideal 0%)
              </div>
            </div>
            <div className="card kpi">
              <div className="kpi-icon tone-warning">
                <Calendar size={18} />
              </div>
              <div className="kpi-label">Total Tests (24h)</div>
              <div className="kpi-value">{totalTests}</div>
              <div className="kpi-sub">{successRate}% Executed successfully</div>
            </div>
          </div>

          {/* Quick Remote Operations for this Company's Devices */}
          <div className="card card-pad">
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                <Gauge size={16} className="text-primary" />
                <span>Remote Operations & Periodic Collection ({c.name})</span>
              </div>
              <span className="dim" style={{ fontSize: 12 }}>
                All company devices can be benchmarked and scheduled periodically
              </span>
            </div>
            {c.devices.length > 0 ? (
              <div className="row" style={{ gap: 12 }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <RunTestButtons deviceId={c.devices[0].id} />
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <span className="dim" style={{ fontSize: 12 }}>Batch Schedule:</span>
                  <ScheduleControl deviceId={c.devices[0].id} interval={c.devices[0].scheduleInterval} />
                </div>
              </div>
            ) : (
              <div className="empty">No devices available to test</div>
            )}
          </div>

          {/* Devices Table for Company */}
          <div className="card">
            <div className="card-head">
              <h2>Registered Devices ({c.devices.length} Devices)</h2>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Device</th>
                    <th>Type</th>
                    <th>IP Address</th>
                    <th>Schedule</th>
                    <th>Last Seen</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {devStatuses.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <Link href={`/devices/${d.id}`} style={{ fontWeight: 600 }}>
                          {d.name}
                        </Link>
                        <div className="dim mono" style={{ fontSize: 11 }}>
                          {d.serialNumber}
                        </div>
                      </td>
                      <td>
                        <DeviceTypeBadge device={d} />
                      </td>
                      <td className="mono">{d.ipAddress ?? "—"}</td>
                      <td>
                        {d.scheduleEnabled ? (
                          <Badge value={`${d.scheduleInterval}m`} dot={false} />
                        ) : (
                          <span className="dim">OFF</span>
                        )}
                      </td>
                      <td>{relTime(d.lastSeenAt)}</td>
                      <td>
                        <Badge value={d.st} />
                      </td>
                      <td>
                        <div className="row" style={{ gap: 6 }}>
                          {getDeviceRole(d).edgeMode === "Slave" && (
                            <TestMasterModalButton
                              device={d}
                              buttonLabel="Test Master"
                              className="btn btn-ghost btn-sm"
                            />
                          )}
                          <Link href={`/devices/${d.id}?tab=ssh`} className="btn btn-ghost btn-sm" title="SSH Terminal">
                            <TerminalIcon size={14} /> SSH
                          </Link>
                          <Link href={`/devices/${d.id}`} className="btn btn-sm">
                            Detail
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!c.devices.length && <div className="empty">No devices registered under this company</div>}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 2: COMPANY GRAPHS                                             */}
      {/* ================================================================= */}
      {tab === "graph" && (
        <div className="card">
          <div className="card-head">
            <h2>24-Hour Network Telemetry & Quality Graph ({c.name})</h2>
            <span className="dim" style={{ fontSize: 12 }}>
              Aggregated Download / Upload / Latency across all {c.name} devices
            </span>
          </div>
          <div className="card-body">
            <CombinedChart data={chartPoints} height={420} />
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 3: 24-HOUR DAILY REPORT & AGGREGATE INTELLIGENCE               */}
      {/* ================================================================= */}
      {tab === "daily-report" && (
        <div className="stack" style={{ gap: 16 }}>
          {/* Executive Header Banner */}
          <div
            className="card card-pad fade-in"
            style={{
              background: "linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%)",
              border: "1px solid var(--border-2)",
            }}
          >
            <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--primary)", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  <FileText size={16} />
                  <span>Executive Daily Network Quality Report</span>
                </div>
                <h2 style={{ fontSize: 22, marginTop: 4 }}>
                  Daily Network Quality Report: {c.name}
                </h2>
                <p className="dim" style={{ fontSize: 13 }}>
                  Last 24 Hours Period · 15-Minute Periodic Collection · Total {c.devices.length} Monitored Devices
                </p>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <PrintButton />
              </div>
            </div>

            {/* Daily KPI Badges */}
            <div className="grid g-4" style={{ gap: 12 }}>
              <div className="card card-pad" style={{ padding: 12, background: "rgba(255,255,255,0.02)", boxShadow: "none" }}>
                <div className="muted" style={{ fontSize: 11 }}>AVAILABILITY SLA</div>
                <div className="stat-big" style={{ color: successRate >= 95 ? "var(--success)" : "var(--warning)" }}>
                  {successRate}%
                </div>
                <div className="dim" style={{ fontSize: 11 }}>{totalTests} tests collected</div>
              </div>
              <div className="card card-pad" style={{ padding: 12, background: "rgba(255,255,255,0.02)", boxShadow: "none" }}>
                <div className="muted" style={{ fontSize: 11 }}>AVERAGE THROUGHPUT</div>
                <div className="stat-big" style={{ color: "var(--info)" }}>
                  {avgDownload} <span style={{ fontSize: 13, color: "var(--muted)" }}>/ {avgUpload} Mbps</span>
                </div>
                <div className="dim" style={{ fontSize: 11 }}>Download / Upload</div>
              </div>
              <div className="card card-pad" style={{ padding: 12, background: "rgba(255,255,255,0.02)", boxShadow: "none" }}>
                <div className="muted" style={{ fontSize: 11 }}>AVERAGE LATENCY</div>
                <div className="stat-big">
                  {avgLatency} <span style={{ fontSize: 13, color: "var(--muted)" }}>ms</span>
                </div>
                <div className="dim" style={{ fontSize: 11 }}>Stable network response time</div>
              </div>
              <div className="card card-pad" style={{ padding: 12, background: "rgba(255,255,255,0.02)", boxShadow: "none" }}>
                <div className="muted" style={{ fontSize: 11 }}>PACKET LOSS INTEGRITY</div>
                <div className="stat-big" style={{ color: avgPacketLoss === 0 ? "var(--success)" : "var(--danger)" }}>
                  {avgPacketLoss}%
                </div>
                <div className="dim" style={{ fontSize: 11 }}>{zeroLossRate}% tests with zero loss (ideal)</div>
              </div>
            </div>
          </div>

          {/* Diagnostic Intelligence Findings Card */}
          <div className="card">
            <div className="card-head">
              <h2>Anomaly Findings & Diagnostics (Last 24 Hours)</h2>
            </div>
            <div className="card-body stack" style={{ gap: 14 }}>
              {/* 1. Inactive Devices Insight */}
              {inactiveDevices.length > 0 ? (
                <div
                  className="alert"
                  style={{
                    background: "rgba(239, 68, 68, 0.08)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    color: "var(--danger)",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                  }}
                >
                  <WifiOff size={20} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <strong style={{ fontSize: 13.5 }}>
                      Inactive Devices Detected ({inactiveDevices.length} Devices):
                    </strong>
                    <div style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.5 }}>
                      {inactiveDevices.map((d) => (
                        <div key={d.id}>
                          • <strong>{d.name}</strong> ({d.serialNumber}): Inactive all the time — no periodic test results received within the last 24 hours. Please verify power and Ethernet connectivity.
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className="alert alert-ok"
                  style={{ display: "flex", alignItems: "center", gap: 10 }}
                >
                  <CheckCircle2 size={18} />
                  <span>All {c.devices.length} devices are active and collecting periodic benchmark telemetry.</span>
                </div>
              )}

              {/* 2. Bandwidth Degradation Alert */}
              {degradationAlerts.length > 0 ? (
                <div
                  className="alert"
                  style={{
                    background: "rgba(245, 158, 11, 0.08)",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                    color: "var(--warning)",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                  }}
                >
                  <TrendingDown size={20} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <strong style={{ fontSize: 13.5 }}>
                      Significant Bandwidth Degradation Detected:
                    </strong>
                    <div style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.5 }}>
                      {degradationAlerts.map((a, i) => (
                        <div key={i}>
                          • <strong>{a.deviceName}</strong> experienced a{" "}
                          <strong>{a.dropPercent}%</strong> bandwidth drop between{" "}
                          <strong>{String(a.startHour).padStart(2, "0")}:00 and {String(a.endHour).padStart(2, "0")}:00</strong>{" "}
                          (Average throughput dropped to {a.avgSpeed} Mbps vs baseline of {a.baselineSpeed} Mbps).
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className="alert alert-ok"
                  style={{ display: "flex", alignItems: "center", gap: 10 }}
                >
                  <CheckCircle2 size={18} />
                  <span>Bandwidth stability remained consistent without severe degradation during peak hours.</span>
                </div>
              )}

              {/* 3. DNS Missing / Resolution Failures */}
              {dnsFailures.length > 0 ? (
                <div
                  className="alert"
                  style={{
                    background: "rgba(239, 68, 68, 0.08)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    color: "var(--danger)",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                  }}
                >
                  <Globe size={20} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <strong style={{ fontSize: 13.5 }}>
                      DNS Resolution Incidents Detected ({dnsFailures.length} Incidents):
                    </strong>
                    <div style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.5 }}>
                      {Array.from(dnsFailureCountByDevice.entries()).map(([devId, info]) => (
                        <div key={devId}>
                          • <strong>{info.name}</strong>: DNS was missing / resolution failed {info.count} times during collection cycles. Check upstream DNS resolver IP or DHCP resolver configuration.
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className="alert alert-ok"
                  style={{ display: "flex", alignItems: "center", gap: 10 }}
                >
                  <CheckCircle2 size={18} />
                  <span>Domain Name Resolution (DNS) performed 100% reliably and responsively across all probes.</span>
                </div>
              )}

              {/* 4. Packet Loss Evaluation */}
              <div
                className="alert"
                style={{
                  background: avgPacketLoss === 0 ? "rgba(34, 197, 94, 0.08)" : "rgba(245, 158, 11, 0.08)",
                  border: `1px solid ${avgPacketLoss === 0 ? "rgba(34, 197, 94, 0.3)" : "rgba(245, 158, 11, 0.3)"}`,
                  color: avgPacketLoss === 0 ? "var(--success)" : "var(--warning)",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                }}
              >
                <ShieldCheck size={20} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <strong style={{ fontSize: 13.5 }}>Packet Loss Integrity Verification:</strong>
                  <div style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.5 }}>
                    Ideally, packet loss should be 0.0%. During this 24-hour period, {zeroLossRate}% of tests recorded exactly 0.0% packet loss with an aggregated average of {avgPacketLoss}%. {avgPacketLoss > 0 ? "Minor packet drops detected on uplink transmission." : "Physical line quality and routing paths are optimal."}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Performance Summary Table per Device */}
          <div className="card">
            <div className="card-head">
              <h2>Device Performance & SLA Compliance Matrix (24 Hours)</h2>
            </div>
            <div className="table-wrap">
              <table className="table compact">
                <thead>
                  <tr>
                    <th>Device</th>
                    <th>Type</th>
                    <th>Total Tests (15m)</th>
                    <th>SLA Success</th>
                    <th>Avg Download</th>
                    <th>Avg Upload</th>
                    <th>Latency</th>
                    <th>Packet Loss</th>
                    <th>Health Status</th>
                  </tr>
                </thead>
                <tbody>
                  {c.devices.map((d) => {
                    const devTests = testResults24h.filter((r) => r.deviceId === d.id);
                    const devOk = devTests.filter((r) => r.status === "SUCCESS");
                    const devSla = devTests.length ? Math.round((devOk.length / devTests.length) * 100) : 0;

                    const dls = devOk.filter((r) => r.download != null).map((r) => r.download as number);
                    const avgDl = dls.length ? Math.round(dls.reduce((a, b) => a + b, 0) / dls.length) : null;

                    const uls = devOk.filter((r) => r.upload != null).map((r) => r.upload as number);
                    const avgUl = uls.length ? Math.round(uls.reduce((a, b) => a + b, 0) / uls.length) : null;

                    const lats = devOk.filter((r) => r.latency != null).map((r) => r.latency as number);
                    const avgLat = lats.length ? +(lats.reduce((a, b) => a + b, 0) / lats.length).toFixed(1) : null;

                    const losses = devOk.filter((r) => r.packetLoss != null).map((r) => r.packetLoss as number);
                    const avgLoss = losses.length ? +(losses.reduce((a, b) => a + b, 0) / losses.length).toFixed(1) : 0.0;

                    const isInactive = devTests.length === 0 || deviceStatus(d) === "OFFLINE";
                    const isDegraded = degradationAlerts.some((a) => a.deviceId === d.id);
                    const isDnsErr = dnsFailureCountByDevice.has(d.id);

                    let healthBadge = <span className="badge b-online">Normal</span>;
                    if (isInactive) {
                      healthBadge = <span className="badge b-offline">Inactive</span>;
                    } else if (isDegraded || isDnsErr || devSla < 90) {
                      healthBadge = <span className="badge b-warning">Degraded</span>;
                    }

                    return (
                      <tr key={d.id}>
                        <td>
                          <Link href={`/devices/${d.id}`} style={{ fontWeight: 600 }}>
                            {d.name}
                          </Link>
                          <div className="dim mono" style={{ fontSize: 11 }}>
                            {d.serialNumber}
                          </div>
                        </td>
                        <td>
                          <DeviceTypeBadge device={d} />
                        </td>
                        <td className="mono">{devTests.length}</td>
                        <td>
                          <span
                            style={{
                              color: devSla >= 95 ? "var(--success)" : devSla > 80 ? "var(--warning)" : "var(--danger)",
                              fontWeight: 600,
                            }}
                          >
                            {devTests.length > 0 ? `${devSla}%` : "0%"}
                          </span>
                        </td>
                        <td className="mono">{avgDl != null ? `${avgDl} Mbps` : "—"}</td>
                        <td className="mono">{avgUl != null ? `${avgUl} Mbps` : "—"}</td>
                        <td className="mono">{avgLat != null ? `${avgLat} ms` : "—"}</td>
                        <td className="mono" style={{ color: avgLoss > 0 ? "var(--danger)" : "var(--success)" }}>
                          {avgLoss}%
                        </td>
                        <td>{healthBadge}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
