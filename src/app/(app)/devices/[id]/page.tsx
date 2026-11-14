import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { deviceStatus, fmtDateTime, relTime, TEST_LABEL, INTERVALS, resultSummary } from "@/lib/constants";
import { AutoRefresh, Badge } from "@/components/ui";
import { RunTestButtons, ScheduleControl, SystemCommands, ConfigForm } from "@/components/DeviceControls";
import { CombinedChart } from "@/components/CombinedChart";
import { HistoryTable } from "@/components/HistoryTable";
import { DeviceButton } from "@/components/Forms";
import { CheckConnectionButton } from "@/components/CheckConnectionButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { deleteDevice } from "@/lib/actions";
import { requireSession } from "@/lib/auth";
import { SshTerminal } from "@/components/SshTerminal";
import {
  Wifi,
  WifiOff,
  Router,
  Gauge,
  Server,
  Globe,
  Terminal as TerminalIcon,
  Cpu,
  Activity,
  HardDrive,
  Clock,
  Flame,
  Crown,
} from "lucide-react";
import type { Point } from "@/components/CombinedChart";
import { DeviceTypeBadge } from "@/components/DeviceTypeBadge";
import { MasterConnectionTestCard, TestMasterModalButton } from "@/components/MasterConnectionTest";
import { MeasurementActivityLogCards } from "@/components/MeasurementActivityLogCards";
import { getDeviceRole } from "@/lib/device-utils";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await prisma.device.findUnique({ where: { id } });
  return { title: d?.name ?? "Device" };
}

export default async function DevicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; date?: string }>;
}) {
  const { id } = await params;
  const { tab = "overview", date = "" } = await searchParams;

  const since48h = new Date(Date.now() - 48 * 3600_000);

  let device = await prisma.device.findUnique({ where: { id }, include: { company: true } });
  if (!device) {
    device = (await prisma.device.findFirst({
      where: {
        OR: [{ name: { contains: "Master" } }, { type: "FARLINK_EDGE" }],
      },
      include: { company: true },
      orderBy: { createdAt: "asc" },
    })) || (await prisma.device.findFirst({ include: { company: true } }));
  }

  const s = await requireSession();
  const isAdmin = s.role === "ADMIN";

  if (!device) notFound();
  if (!isAdmin && s.companyId && device.companyId !== s.companyId) {
    notFound();
  }

  const resolvedDeviceId = device.id;

  const [companies, historyAll, chartRaw, pendingCmds] = await Promise.all([
    prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.testResult.findMany({ where: { deviceId: resolvedDeviceId }, orderBy: { startedAt: "desc" }, take: 200 }),
    prisma.testResult.findMany({
      where: { deviceId: resolvedDeviceId, testType: { in: ["SPEED", "IPERF", "TCP_PORT"] }, startedAt: { gte: since48h } },
      select: { startedAt: true, download: true, upload: true, latency: true, triggerType: true, status: true },
    }),
    prisma.deviceCommand.findMany({
      where: { deviceId: resolvedDeviceId, status: { in: ["PENDING", "SENT", "RUNNING"] } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const history = historyAll.slice(0, 20);

  const st = deviceStatus(device);
  const latest = history[0];
  const config = JSON.parse(device.config || "{}") as Record<string, any>;
  const sysInfo = config.systemInfo;

  const points: Point[] = chartRaw
    .filter((r) => r.status === "SUCCESS")
    .map((r) => ({
      t: r.startedAt.getTime(),
      download: r.download,
      upload: r.upload,
      latency: r.latency,
      trigger: r.triggerType,
      status: "SUCCESS",
    }));

  const tabs = [
    { k: "overview", l: "Overview" },
    { k: "logs", l: "Measurement Logs" },
    { k: "ssh", l: "SSH Console" },
    { k: "graph", l: "Graph" },
    { k: "history", l: "Test History" },
    { k: "schedule", l: "Schedule" },
    { k: "config", l: "Configuration" },
    { k: "commands", l: "Commands" },
  ];

  const roleInfo = getDeviceRole(device);
  const isSlave = roleInfo.edgeMode === "Slave";
  const isMaster = roleInfo.edgeMode === "Master";

  // Check if there is a Master device (when viewing a Slave) or Slave device (when viewing a Master)
  let companyMasterDevice: { id: string; name: string; ipAddress: string | null } | null = null;
  if (isSlave) {
    if (device.companyId) {
      companyMasterDevice = await prisma.device.findFirst({
        where: {
          companyId: device.companyId,
          id: { not: device.id },
          OR: [
            { config: { contains: '"mode":"Master"' } },
            { config: { contains: '"mode": "Master"' } },
            { config: { contains: '"mode":"MASTER"' } },
            { name: { contains: "Master" } },
          ],
        },
        select: { id: true, name: true, ipAddress: true },
      });
    }
    if (!companyMasterDevice) {
      companyMasterDevice = await prisma.device.findFirst({
        where: {
          id: { not: device.id },
          OR: [
            { config: { contains: '"mode":"Master"' } },
            { config: { contains: '"mode": "Master"' } },
            { name: { contains: "Master" } },
          ],
        },
        select: { id: true, name: true, ipAddress: true },
        orderBy: { createdAt: "asc" },
      });
    }
  }

  const resolvedMasterIp = isSlave
    ? (companyMasterDevice?.ipAddress || sysInfo?.masterIp || config.master_ip || config.masterIp || "192.168.2.38")
    : (device.ipAddress || "192.168.2.38");

  // Check if there is a Slave device registered in the same company
  let companySlaveDevice = null;
  if (isMaster && device.companyId) {
    companySlaveDevice = await prisma.device.findFirst({
      where: {
        companyId: device.companyId,
        id: { not: device.id },
        OR: [
          { config: { contains: '"mode":"Slave"' } },
          { config: { contains: '"mode": "Slave"' } },
          { config: { contains: '"mode":"SLAVE"' } },
          { type: "FARLINK_EDGE" },
        ],
      },
      select: { id: true, name: true, ipAddress: true, lastSeenAt: true, config: true },
    });
  }

  const isCompanySlaveOnline = Boolean(
    companySlaveDevice?.lastSeenAt &&
    Date.now() - new Date(companySlaveDevice.lastSeenAt).getTime() < 120_000
  );

  const isSlaveNodeConnected = Boolean(
    (sysInfo?.slaveConnected !== undefined ? sysInfo.slaveConnected : null) ??
    (roleInfo.isSlaveConnected !== undefined ? roleInfo.isSlaveConnected : null) ??
    (companySlaveDevice ? isCompanySlaveOnline : false)
  );

  // Resolved Slave Local IP (supports Plug & Play 10.42.0.x, 192.168.99.x, or LAN IP)
  const resolvedSlaveIp = (() => {
    let raw = roleInfo.slaveIp || sysInfo?.slaveIp || config.slave_ip || config.slaveIp || companySlaveDevice?.ipAddress || null;
    if (typeof raw === "string" && raw === "127.0.0.1") {
      raw = null;
    }
    if (!raw && isSlaveNodeConnected) {
      raw = "10.42.0.10 (Plug & Play)";
    }
    return raw;
  })();

  const slaveHostname =
    sysInfo?.slaveHostname ||
    config.slave_hostname ||
    config.slaveHostname ||
    companySlaveDevice?.name ||
    "farlink-slave-01";

  const slaveTargetLabel = resolvedSlaveIp
    ? (resolvedSlaveIp.includes("(") ? resolvedSlaveIp : `${resolvedSlaveIp} (${slaveHostname})`)
    : `10.42.0.10 (${slaveHostname})`;

  const resolveTestTarget = (rawTarget: string | null, testType: string): string | null => {
    if (isSlave) {
      const lower = (rawTarget || "").trim().toLowerCase();
      if (
        !rawTarget ||
        lower === "speedtest.net" ||
        lower === "speedtest server" ||
        testType === "SPEED" ||
        testType === "IPERF"
      ) {
        return resolvedMasterIp;
      }
    } else if (isMaster) {
      const lower = (rawTarget || "").trim().toLowerCase();
      if (
        !rawTarget ||
        lower === "speedtest.net" ||
        lower === "speedtest server" ||
        testType === "SPEED" ||
        testType === "IPERF"
      ) {
        return slaveTargetLabel;
      }
    }
    return rawTarget;
  };

  const serializedHistoryForCards = historyAll.map((r) => ({
    id: r.id,
    testType: (isMaster && (r.testType === "SPEED" || r.testType === "IPERF")) ? "TEST LAN" : r.testType,
    triggerType: r.triggerType,
    status: r.status,
    target: resolveTestTarget(r.target, r.testType) || (isMaster ? slaveTargetLabel : null),
    download: r.download,
    upload: r.upload,
    latency: r.latency,
    jitter: r.jitter,
    packetLoss: r.packetLoss,
    duration: r.duration,
    errorMessage: r.errorMessage,
    resultData: r.resultData,
    startedAt: r.startedAt.toISOString(),
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
  }));

  // Fetch synced agent measurement logs from config.recentLogs + AuditLog (AGENT_LOG_SYNC)
  const auditLogTargets = [device.name, companySlaveDevice?.name].filter(Boolean) as string[];
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      action: "AGENT_LOG_SYNC",
      ...(auditLogTargets.length ? { target: { in: auditLogTargets } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 15,
  });

  const initialAgentLogs: {
    id?: number | string;
    created_at?: string;
    level?: string;
    module?: string;
    message?: string;
    sourceDevice?: string;
  }[] = [];
  const seenLogKeys = new Set<string>();
  const pushLogEntry = (entry: any, defaultSource: string) => {
    if (!entry || !entry.message) return;
    const ts = entry.created_at || entry.timestamp || "";
    const key = `${ts}|${entry.level || "INFO"}|${entry.message}`;
    if (seenLogKeys.has(key)) return;
    seenLogKeys.add(key);
    initialAgentLogs.push({
      id: entry.id,
      created_at: ts,
      level: entry.level || "INFO",
      module: entry.module || "agent",
      message: entry.message,
      sourceDevice: entry.sourceDevice || entry.source || defaultSource,
    });
  };
  if (Array.isArray(config.recentLogs)) {
    for (const l of config.recentLogs) pushLogEntry(l, device.name);
  }
  if (companySlaveDevice?.config) {
    try {
      const slaveCfg = JSON.parse(companySlaveDevice.config || "{}");
      if (Array.isArray(slaveCfg.recentLogs)) {
        for (const l of slaveCfg.recentLogs) pushLogEntry(l, `${companySlaveDevice.name} (Slave)`);
      }
    } catch {}
  }
  for (const row of auditLogs) {
    try {
      const parsed = JSON.parse(row.detail || "{}");
      if (Array.isArray(parsed.sample)) {
        for (const l of parsed.sample) {
          pushLogEntry(
            { ...l, created_at: l.created_at || l.timestamp || row.createdAt.toISOString() },
            row.target || device.name
          );
        }
      }
    } catch {}
  }
  initialAgentLogs.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));

  return (
    <>
      <AutoRefresh seconds={20} />

      {/* Breadcrumb + actions */}
      <div className="page-head">
        <div>
          <p className="dim" style={{ marginBottom: 4 }}>
            <Link href="/devices">Devices</Link> /{" "}
            {device.company && (
              <>
                <Link href={`/customers/${device.company.id}`}>{device.company.name}</Link> /{" "}
              </>
            )}
            {device.name}
          </p>
          <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <h1 style={{ margin: 0 }}>{device.name}</h1>
            <Badge value={st} />
            <DeviceTypeBadge device={device} />
            {device.isDemo && <Badge value="DEMO" dot={false} />}
          </div>
        </div>
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          <CheckConnectionButton
            deviceId={device.id}
            deviceName={device.name}
            className="btn btn-ghost"
            label="Check Real-Time Connection"
          />
          {(isSlave || isMaster) && (
            <TestMasterModalButton
              device={device}
              buttonLabel={isMaster ? "Log & Test Edge" : "Test Master"}
              className="btn btn-primary"
            />
          )}
          <Link
            href={`/devices/${id}?tab=ssh`}
            className={`btn ${tab === "ssh" ? "btn-primary" : ""}`}
            title="Open remote SSH terminal to device"
          >
            <TerminalIcon size={15} /> SSH Console
          </Link>
          <DeviceButton
            companies={companies}
            device={{
              id: device.id,
              name: device.name,
              serialNumber: device.serialNumber,
              type: device.type,
              companyId: device.companyId,
              gatewayIp: device.gatewayIp,
            }}
          />
          {isAdmin && (
            <ConfirmButton
              action={deleteDevice.bind(null, device.id)}
              label="Delete"
              danger
              confirm={`Delete device ${device.name}? All test history will be permanently deleted.`}
            />
          )}
        </div>
      </div>

      {/* Pending commands banner */}
      {pendingCmds.length > 0 && (
        <div
          className="alert"
          style={{
            border: "1px solid rgba(245,158,11,.35)",
            background: "rgba(245,158,11,.08)",
            color: "var(--warning)",
            marginBottom: 16,
          }}
        >
          {pendingCmds.length} pending command(s) waiting for device sync · {pendingCmds.map((c) => c.type).join(", ")}
        </div>
      )}

      {/* Remote test buttons */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <RunTestButtons deviceId={device.id} config={config} />
      </div>

      {/* Tabs */}
      <div className="tabs">
        {tabs.map((t) => (
          <Link
            key={t.k}
            id={`tab-${t.k}`}
            href={`/devices/${id}?tab=${t.k}`}
            className={`tab ${tab === t.k ? "active" : ""}`}
          >
            {t.l}
          </Link>
        ))}
      </div>

      {/* Measurement Logs Tab */}
      {tab === "logs" && (
        <div className="stack" style={{ gap: 16, marginBottom: 20 }}>
          <MasterConnectionTestCard device={device} initialLogs={initialAgentLogs} />

          <MeasurementActivityLogCards
            deviceName={device.name}
            testResults={serializedHistoryForCards}
            agentLogs={initialAgentLogs}
            initialDate={date}
            isMaster={isMaster}
            slaveTargetLabel={slaveTargetLabel}
          />

          <div className="card card-pad">
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Cara Melihat Log Pengukuran Langsung di Raspberry Pi (Master &amp; Slave)</h3>
            <p className="dim" style={{ fontSize: 13, marginBottom: 12 }}>
              Anda juga dapat membuka tab <Link href={`/devices/${id}?tab=ssh`} style={{ textDecoration: "underline" }}>SSH Console</Link> atau login via SSH ke Raspberry Pi Master (`{device.ipAddress ?? "192.168.2.38"}`) dan Slave (`{resolvedSlaveIp ?? "10.42.0.10"}`) lalu menjalankan perintah berikut:
            </p>
            <pre
              className="mono"
              style={{
                background: "#070b14",
                color: "#cbd5e1",
                padding: 14,
                borderRadius: 8,
                fontSize: 12,
                lineHeight: 1.6,
                overflowX: "auto",
                border: "1px solid var(--border)",
              }}
            >{`# 1. Lihat live log service FarLink Agent (Master / Slave)
sudo journalctl -u farlink-agent -f -n 100

# 2. Lihat file log pengukuran Python Agent secara real-time
tail -f ~/farlink/python/farlink_agent.log /var/log/farlink_agent.log 2>/dev/null

# 3. Cek isi tabel hasil pengukuran & log di SQLite lokal Raspberry Pi
sqlite3 ~/farlink/python/farlink_agent.db "SELECT id, timestamp, test_type, download_mbps, upload_mbps, latency_ms, jitter_ms, packet_loss, synced FROM test_results ORDER BY id DESC LIMIT 10;"
sqlite3 ~/farlink/python/farlink_agent.db "SELECT id, timestamp, level, message, synced FROM agent_logs ORDER BY id DESC LIMIT 25;"

# 4. Cek status daemon iPerf3 Server (Port 5201) & koneksi ke Slave
ss -tulpn | grep 5201
iperf3 -c 10.42.0.10 -p 5201 -t 5 -P 2`}</pre>
          </div>
        </div>
      )}

      {/* SSH Terminal Tab */}
      {tab === "ssh" && (
        <div style={{ marginBottom: 20 }}>
          <SshTerminal
            deviceId={device.id}
            deviceName={device.name}
            initialHost={device.ipAddress}
            initialConfig={config}
          />
        </div>
      )}

      {/* Overview */}
      {tab === "overview" && (
        <>
          <div className="grid g-main" style={{ gap: 16 }}>
          <div className="stack">
            {/* Edge Master Role Banner */}
            {isMaster && (
              <div
                className="alert fade-in"
                style={{
                  background: "rgba(192, 132, 252, 0.08)",
                  borderColor: "rgba(192, 132, 252, 0.3)",
                  color: "#c084fc",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 4,
                }}
              >
                <Crown size={18} style={{ color: "#e879f9", flexShrink: 0 }} />
                <span>
                  <strong>Company Master Hub:</strong> This device is the active Master for{" "}
                  <strong>{device.company?.name ?? "Company"}</strong>. Slave probes in this company execute connection tests
                  directed to this device (1 Master per company rule).
                </span>
              </div>
            )}

            {/* Edge Master & Slave Connection Test + Measurement Logs Card */}
            {(isSlave || isMaster) && (
              <MasterConnectionTestCard device={device} initialLogs={initialAgentLogs} />
            )}

            <div className="card">
              <div className="card-head">
                <h2>Device Info</h2>
              </div>
              <div className="card-body">
                <dl className="kv">
                  <dt>Serial Number</dt>
                  <dd className="mono">{device.serialNumber}</dd>
                  <dt>Type / Role</dt>
                  <dd>
                    <DeviceTypeBadge device={device} />
                  </dd>
                  <dt>Company</dt>
                  <dd>{device.company?.name ?? <span className="dim">Unassigned</span>}</dd>
                  <dt>IP Address</dt>
                  <dd className="mono">{device.ipAddress ?? "—"}</dd>
                  <dt>MAC Address</dt>
                  <dd className="mono">{device.macAddress ?? "—"}</dd>
                  <dt>Firmware</dt>
                  <dd className="mono">{device.firmwareVersion ?? "—"}</dd>
                  <dt>Agent</dt>
                  <dd className="mono">{device.agentVersion ?? "—"}</dd>
                  <dt>Last Seen</dt>
                  <dd>
                    {fmtDateTime(device.lastSeenAt)} ({relTime(device.lastSeenAt)})
                  </dd>
                </dl>
              </div>
            </div>

            {/* Hardware Telemetry Card (From Python Agent Heartbeat) */}
            {sysInfo && (
              <div className="card card-pad fade-in">
                <div className="row" style={{ gap: 10, marginBottom: 14 }}>
                  <div className="kpi-icon tone-info" style={{ position: "static" }}>
                    <Activity size={18} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>Hardware Telemetry (FarLink Agent)</div>
                    <div className="dim" style={{ fontSize: 12 }}>
                      Last telemetry sync: {relTime(sysInfo.lastTelemetryAt)}
                    </div>
                  </div>
                </div>

                <div className="grid g-4" style={{ gap: 12, marginBottom: 12 }}>
                  <div className="card card-pad" style={{ padding: 12, boxShadow: "none" }}>
                    <div className="muted" style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                      <Cpu size={13} /> CPU LOAD
                    </div>
                    <div className="stat-big" style={{ fontSize: 20 }}>
                      {sysInfo.cpuUsage != null ? `${sysInfo.cpuUsage}%` : "—"}
                    </div>
                  </div>
                  <div className="card card-pad" style={{ padding: 12, boxShadow: "none" }}>
                    <div className="muted" style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                      <Activity size={13} /> RAM USAGE
                    </div>
                    <div className="stat-big" style={{ fontSize: 20 }}>
                      {sysInfo.ramUsage != null ? `${sysInfo.ramUsage}%` : "—"}
                    </div>
                  </div>
                  <div className="card card-pad" style={{ padding: 12, boxShadow: "none" }}>
                    <div className="muted" style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                      <Flame size={13} /> TEMPERATURE
                    </div>
                    <div className="stat-big" style={{ fontSize: 20 }}>
                      {sysInfo.temperature != null ? `${sysInfo.temperature}°C` : "—"}
                    </div>
                  </div>
                  <div className="card card-pad" style={{ padding: 12, boxShadow: "none" }}>
                    <div className="muted" style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                      <HardDrive size={13} /> DISK
                    </div>
                    <div className="stat-big" style={{ fontSize: 20 }}>
                      {sysInfo.diskUsage != null ? `${sysInfo.diskUsage}%` : "—"}
                    </div>
                  </div>
                </div>

                <dl className="kv">
                  {sysInfo.uptime && (
                    <>
                      <dt>System Uptime</dt>
                      <dd className="mono">{sysInfo.uptime}</dd>
                    </>
                  )}
                  {sysInfo.osVersion && (
                    <>
                      <dt>OS Version</dt>
                      <dd className="mono">{sysInfo.osVersion}</dd>
                    </>
                  )}
                  {sysInfo.masterIp && (
                    <>
                      <dt>Master FarLink</dt>
                      <dd className="mono">
                        {sysInfo.masterIp}{" "}
                        {sysInfo.masterConnected ? (
                          <Badge value="REACHABLE" dot />
                        ) : (
                          <Badge value="UNREACHABLE" />
                        )}
                        {sysInfo.masterLatencyMs != null ? ` (${sysInfo.masterLatencyMs}ms)` : ""}
                      </dd>
                    </>
                  )}
                  {(resolvedSlaveIp || isMaster) && (
                    <>
                      <dt>Slave Local IP</dt>
                      <dd className="mono">
                        {resolvedSlaveIp ? (
                          companySlaveDevice ? (
                            <Link href={`/devices/${companySlaveDevice.id}`} title={companySlaveDevice.name}>
                              {resolvedSlaveIp}
                            </Link>
                          ) : (
                            resolvedSlaveIp
                          )
                        ) : (
                          <span className="dim">Not detected</span>
                        )}{" "}
                        {isSlaveNodeConnected ? (
                          <Badge value="CONNECTED" dot />
                        ) : (
                          <Badge value="DISCONNECTED" />
                        )}
                        {isSlaveNodeConnected && (sysInfo.slaveLatencyMs ?? roleInfo.slaveLatencyMs) != null
                          ? ` (${sysInfo.slaveLatencyMs ?? roleInfo.slaveLatencyMs}ms)`
                          : ""}
                      </dd>
                    </>
                  )}
                </dl>
              </div>
            )}
          </div>

          <div className="stack">
            {/* Connectivity */}
            <div className="card card-pad">
              <div className="row" style={{ gap: 12, marginBottom: 14 }}>
                <div
                  className={`kpi-icon tone-${st === "ONLINE" ? "success" : st === "WARNING" ? "warning" : "danger"}`}
                  style={{ position: "static" }}
                >
                  {st !== "OFFLINE" ? <Wifi size={18} /> : <WifiOff size={18} />}
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>Connectivity</div>
                  <div className="dim" style={{ fontSize: 12 }}>
                    Heartbeat {relTime(device.lastSeenAt)}
                  </div>
                </div>
              </div>
              <dl className="kv">
                <dt>Internet</dt>
                <dd>
                  <Badge value={device.internetStatus} dot={false} />
                </dd>
                <dt>Gateway</dt>
                <dd className="mono">{device.gatewayIp ?? "—"}</dd>
                <dt>Gateway status</dt>
                <dd>
                  <Badge value={device.gatewayStatus} />
                </dd>
                {device.gatewayLatency != null && (
                  <>
                    <dt>Latency</dt>
                    <dd className="mono">{device.gatewayLatency} ms</dd>
                  </>
                )}
                <dt>Checked</dt>
                <dd>{fmtDateTime(device.gatewayCheckedAt)}</dd>
              </dl>
            </div>

            {/* Latest test */}
            {latest && (
              <div className="card card-pad">
                <div className="row" style={{ gap: 10, marginBottom: 12 }}>
                  <div
                    className={`kpi-icon tone-${latest.status === "SUCCESS" ? "success" : "danger"}`}
                    style={{ position: "static" }}
                  >
                    <Gauge size={18} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      Latest Test · {isMaster ? "TEST LAN" : (TEST_LABEL[latest.testType] ?? latest.testType)}
                    </div>
                    <div className="dim" style={{ fontSize: 12 }}>
                      {fmtDateTime(latest.startedAt)} · <Badge value={latest.triggerType} dot={false} />
                    </div>
                  </div>
                </div>
                {latest.status === "FAILED" ? (
                  <div className="alert alert-error">{latest.errorMessage ?? "Test failed"}</div>
                ) : (
                  <dl className="kv">
                    {latest.download != null && (
                      <>
                        <dt>Download</dt>
                        <dd className="mono">{latest.download} Mbps</dd>
                      </>
                    )}
                    {latest.upload != null && (
                      <>
                        <dt>Upload</dt>
                        <dd className="mono">{latest.upload} Mbps</dd>
                      </>
                    )}
                    {latest.latency != null && (
                      <>
                        <dt>Latency</dt>
                        <dd className="mono">{latest.latency} ms</dd>
                      </>
                    )}
                    {latest.jitter != null && (
                      <>
                        <dt>Jitter</dt>
                        <dd className="mono">{latest.jitter} ms</dd>
                      </>
                    )}
                    {latest.packetLoss != null && (
                      <>
                        <dt>Packet Loss</dt>
                        <dd className="mono">{latest.packetLoss}%</dd>
                      </>
                    )}
                    {(resolveTestTarget(latest.target, latest.testType) || (isMaster ? slaveTargetLabel : null)) && (
                      <>
                        <dt>Target</dt>
                        <dd className="mono">
                          {isMaster
                            ? (!latest.target || latest.target === "Speedtest Server" || latest.target === "speedtest.net"
                                ? slaveTargetLabel
                                : resolveTestTarget(latest.target, latest.testType))
                            : resolveTestTarget(latest.target, latest.testType)}
                        </dd>
                      </>
                    )}
                    <dt>Duration</dt>
                    <dd className="mono">{latest.duration ?? "—"} s</dd>
                    <dt>Status</dt>
                    <dd>
                      <Badge value={latest.status} />
                    </dd>
                  </dl>
                )}
              </div>
            )}

            {/* Schedule summary */}
            <div className="card card-pad">
              <div className="row" style={{ gap: 10, marginBottom: 10 }}>
                <Server size={16} className="muted" />
                <span style={{ fontWeight: 600 }}>Schedule</span>
              </div>
              <dl className="kv">
                <dt>Status</dt>
                <dd>{device.scheduleEnabled ? <Badge value="ON" dot={false} /> : <span className="dim">OFF</span>}</dd>
                <dt>Interval</dt>
                <dd>
                  {INTERVALS.find((i) => i.value === device.scheduleInterval)?.label ??
                    device.scheduleInterval + " min"}
                </dd>
                <dt>Last run</dt>
                <dd>{fmtDateTime(device.lastScheduledAt)}</dd>
              </dl>
            </div>
          </div>
        </div>

        {/* Bottom Section: Card Log Aktivitas Pengukuran (Filter Tanggal & Limit 10 Data) */}
        <MeasurementActivityLogCards
          deviceName={device.name}
          testResults={serializedHistoryForCards}
          agentLogs={initialAgentLogs}
          initialDate={date}
        />
      </>
      )}

      {/* Graph */}
      {tab === "graph" && (
        <div className="card">
          <div className="card-head">
            <h2>Combined Graph · Download / Upload (Speed Test)</h2>
          </div>
          <div className="card-body">
            <CombinedChart data={points} height={400} />
          </div>
        </div>
      )}

      {/* History */}
      {tab === "history" && (
        <div className="stack" style={{ gap: 16 }}>
          <div className="card">
            <div className="card-head">
              <h2>Test History</h2>
              <Link href={`/history?device=${resolvedDeviceId}`} className="btn btn-ghost btn-sm">
                Full history
              </Link>
            </div>
            <HistoryTable rows={history} />
          </div>

          <MeasurementActivityLogCards
            deviceName={device.name}
            testResults={serializedHistoryForCards}
            agentLogs={initialAgentLogs}
            initialDate={date}
            isMaster={isMaster}
            slaveTargetLabel={slaveTargetLabel}
          />
        </div>
      )}

      {/* Schedule */}
      {tab === "schedule" && (
        <div className="card" style={{ maxWidth: 560 }}>
          <div className="card-head">
            <h2>Schedule</h2>
          </div>
          <div className="card-body stack">
            <p className="muted">Select automated benchmark interval. Set to OFF to disable.</p>
            <ScheduleControl deviceId={device.id} interval={device.scheduleInterval} />
            <dl className="kv">
              <dt>Current</dt>
              <dd>{device.scheduleEnabled ? <Badge value="ENABLED" dot={false} /> : <span className="dim">OFF</span>}</dd>
              <dt>Interval</dt>
              <dd>{INTERVALS.find((i) => i.value === device.scheduleInterval)?.label}</dd>
              <dt>Last run</dt>
              <dd>{fmtDateTime(device.lastScheduledAt)}</dd>
              <dt>Next run</dt>
              <dd>
                {device.scheduleEnabled && device.lastScheduledAt
                  ? fmtDateTime(new Date(device.lastScheduledAt.getTime() + device.scheduleInterval * 60_000))
                  : "—"}
              </dd>
            </dl>
          </div>
        </div>
      )}

      {/* Config */}
      {tab === "config" && (
        <div className="card" style={{ maxWidth: 760 }}>
          <div className="card-head">
            <h2>Configuration</h2>
          </div>
          <div className="card-body">
            <ConfigForm deviceId={device.id} config={config} gatewayIp={device.gatewayIp} deviceType={device.type} />
          </div>
        </div>
      )}

      {/* Commands */}
      {tab === "commands" && (
        <div className="grid g-2" style={{ maxWidth: 900 }}>
          <div className="card">
            <div className="card-head">
              <h2>System Commands</h2>
            </div>
            <div className="card-body">
              <SystemCommands deviceId={device.id} isAdmin={isAdmin} />
            </div>
          </div>
          <div className="card">
            <div className="card-head">
              <h2>Recent Commands</h2>
            </div>
            <div className="table-wrap">
              <table className="table compact">
                <thead>
                  <tr>
                    <th>Command</th>
                    <th>Status</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    await prisma.deviceCommand.findMany({
                      where: { deviceId: id },
                      orderBy: { createdAt: "desc" },
                      take: 12,
                    })
                  ).map((c) => {
                    let parsedPayload: Record<string, any> = {};
                    let parsedResult: Record<string, any> = {};
                    try {
                      parsedPayload = JSON.parse(c.payload || "{}");
                    } catch {}
                    try {
                      parsedResult = JSON.parse(c.result || "{}");
                    } catch {}

                    return (
                      <tr key={c.id}>
                        <td>
                          <div className="mono" style={{ fontSize: 12, fontWeight: 600 }}>
                            {c.type}
                          </div>
                          {parsedPayload.command && (
                            <div className="mono dim" style={{ fontSize: 11, maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis" }}>
                              $ {parsedPayload.command}
                            </div>
                          )}
                          {parsedResult.latencyMs != null && (
                            <div className="dim" style={{ fontSize: 11, color: "var(--info)" }}>
                              Latency: {parsedResult.latencyMs}ms · Speed: {parsedResult.bandwidthMbps ?? "—"} Mbps
                            </div>
                          )}
                        </td>
                        <td>
                          <Badge value={c.status} dot={false} />
                        </td>
                        <td className="dim" style={{ fontSize: 12 }}>
                          {relTime(c.createdAt)}
                        </td>
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
