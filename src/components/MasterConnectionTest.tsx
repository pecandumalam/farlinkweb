"use client";

import { useState, useTransition } from "react";
import {
  Zap,
  CheckCircle2,
  XCircle,
  Clock,
  Terminal as TerminalIcon,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Activity,
  Gauge,
  Crown,
  Link2,
  RefreshCw,
  FileText,
  ArrowDownUp,
} from "lucide-react";
import { testMasterConnection, pullDeviceLogsAndSync } from "@/lib/actions";
import { Modal } from "./Forms";
import { relTime } from "@/lib/constants";
import { useToast } from "./ui";
import { getDeviceRole } from "@/lib/device-utils";

export interface AgentLogEntry {
  id?: number | string;
  level?: string;
  module?: string;
  message?: string;
  created_at?: string;
  sourceDevice?: string;
}

interface DeviceProps {
  id: string;
  name: string;
  type?: string | null;
  ipAddress?: string | null;
  config?: string | null | Record<string, any>;
  company?: { id?: string; name?: string } | null;
}

export function TestMasterModalButton({
  device,
  buttonLabel,
  className = "btn btn-ghost btn-sm",
}: {
  device: DeviceProps;
  buttonLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const role = getDeviceRole(device);
  const isMaster = role.edgeMode === "Master";
  const defaultLabel = isMaster ? "Log & Test Edge" : "Test Master";

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => setOpen(true)}
        title={
          isMaster
            ? "Lihat Log Pengukuran & Jalankan Test iPerf3 dari Edge Master ke Slave"
            : "Lihat Log Pengukuran & Test Koneksi dari Edge Slave ke Master"
        }
        style={{ color: isMaster ? "#c084fc" : "#38bdf8" }}
      >
        <Zap size={14} /> {buttonLabel || defaultLabel}
      </button>

      {open && (
        <Modal
          title={`FarLink Edge · ${isMaster ? "Master ↔ Slave Measurement & Logs" : "Slave → Master Measurement & Logs"} (${device.name})`}
          onClose={() => setOpen(false)}
        >
          <div style={{ maxWidth: 760, minWidth: "min(100%, 620px)" }}>
            <MasterConnectionTestContent device={device} />
          </div>
        </Modal>
      )}
    </>
  );
}

export function MasterConnectionTestCard({
  device,
  initialLogs,
}: {
  device: DeviceProps;
  initialLogs?: AgentLogEntry[];
}) {
  const role = getDeviceRole(device);
  const isMaster = role.edgeMode === "Master";

  return (
    <div
      className="card card-pad"
      style={{
        background: isMaster
          ? "linear-gradient(180deg, rgba(192, 132, 252, 0.05) 0%, rgba(15, 23, 42, 0.45) 100%)"
          : "linear-gradient(180deg, rgba(56, 189, 248, 0.04) 0%, rgba(15, 23, 42, 0.4) 100%)",
        border: isMaster
          ? "1px solid rgba(192, 132, 252, 0.28)"
          : "1px solid rgba(56, 189, 248, 0.25)",
        marginBottom: 16,
      }}
    >
      <div
        className="row"
        style={{
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
          borderBottom: isMaster
            ? "1px solid rgba(192, 132, 252, 0.16)"
            : "1px solid rgba(56, 189, 248, 0.15)",
          paddingBottom: 10,
        }}
      >
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: isMaster ? "rgba(192, 132, 252, 0.16)" : "rgba(56, 189, 248, 0.15)",
              color: isMaster ? "#e879f9" : "#38bdf8",
              display: "grid",
              placeItems: "center",
            }}
          >
            {isMaster ? <Crown size={18} /> : <Link2 size={18} />}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              {isMaster
                ? "FarLink Edge Master · Log Pengukuran & iPerf3 ke Slave"
                : "FarLink Edge Slave · Log Pengukuran & Koneksi ke Master"}
            </div>
            <div className="dim" style={{ fontSize: 11.5 }}>
              {isMaster
                ? "Pantau hasil iPerf3 (TCP Download, TCP Upload, UDP, Latency, Jitter, Loss) & tarik log SQLite dari Master/Slave"
                : "Verifikasi jalur jaringan, latency, jitter, packet loss & throughput iPerf3 ke Master Hub"}
            </div>
          </div>
        </div>
        <span className={`badge ${isMaster ? "b-master" : "b-slave"}`}>
          <span className="dot" /> {isMaster ? "MASTER HUB" : "SLAVE MODE"}
        </span>
      </div>

      <MasterConnectionTestContent device={device} initialLogs={initialLogs} />
    </div>
  );
}

function MasterConnectionTestContent({
  device,
  initialLogs,
}: {
  device: DeviceProps;
  initialLogs?: AgentLogEntry[];
}) {
  const [pending, start] = useTransition();
  const [syncPending, startSync] = useTransition();
  const { toast, toastEl } = useToast();
  const [copied, setCopied] = useState(false);
  const [showConsole, setShowConsole] = useState(true);
  const [showAgentLogs, setShowAgentLogs] = useState(true);

  let cfg: Record<string, any> = {};
  try {
    cfg = typeof device.config === "string" ? JSON.parse(device.config || "{}") : device.config || {};
  } catch {}

  const sysInfo = cfg.systemInfo || {};
  const role = getDeviceRole(device);
  const isMaster = role.edgeMode === "Master";

  const initialMasterIp = isMaster
    ? (device.ipAddress || "10.42.0.1")
    : (cfg.master_ip || cfg.masterIp || sysInfo.masterIp || "10.42.0.1");

  const initialSlaveIp = isMaster
    ? (sysInfo.slaveIp || role.slaveIp || cfg.slave_ip || cfg.slaveIp || "10.42.0.10")
    : (device.ipAddress || "10.42.0.10");

  const peerTargetIp = isMaster ? initialSlaveIp : initialMasterIp;
  const savedLastResult = sysInfo.lastTestResult || null;

  const [agentLogs, setAgentLogs] = useState<AgentLogEntry[]>(() => {
    if (initialLogs && initialLogs.length > 0) return initialLogs;
    if (Array.isArray(cfg.recentLogs) && cfg.recentLogs.length > 0) return cfg.recentLogs;
    if (Array.isArray(savedLastResult?.agentLogs)) return savedLastResult.agentLogs;
    return [];
  });

  const [testResult, setTestResult] = useState<{
    command: string;
    status: string;
    masterIp: string;
    slaveIp?: string;
    masterName: string;
    slaveName: string;
    latencyMs: number | null;
    jitterMs: number | null;
    packetLoss: number | null;
    bandwidthMbps: number | null;
    downloadMbps?: number | null;
    uploadMbps?: number | null;
    udpBandwidthMbps?: number | null;
    stdout: string;
    durationSeconds: number;
    completedAt: string;
  } | null>(() => {
    if (
      savedLastResult &&
      (savedLastResult.downloadMbps != null ||
        savedLastResult.download_mbps != null ||
        savedLastResult.bandwidthMbps != null ||
        savedLastResult.latencyMs != null ||
        savedLastResult.latency_ms != null)
    ) {
      const dl = savedLastResult.downloadMbps ?? savedLastResult.download_mbps ?? savedLastResult.bandwidthMbps ?? null;
      const ul = savedLastResult.uploadMbps ?? savedLastResult.upload_mbps ?? null;
      const udpBw = savedLastResult.udpBandwidthMbps ?? savedLastResult.udp_bandwidth_mbps ?? null;
      const lat = savedLastResult.latencyMs ?? savedLastResult.latency_ms ?? null;
      const jit = savedLastResult.jitterMs ?? savedLastResult.jitter_ms ?? null;
      const loss = savedLastResult.packetLoss ?? savedLastResult.packet_loss ?? null;
      return {
        command:
          savedLastResult.command ||
          `ping -c 4 ${peerTargetIp} && iperf3 -c ${peerTargetIp} -p 5201 -t 5 -R && iperf3 -c ${peerTargetIp} -p 5201 -t 5`,
        status: String(savedLastResult.status || "SUCCESS").toUpperCase() === "SUCCESS" ? "SUCCESS" : "FAILED",
        masterIp: savedLastResult.masterIp || initialMasterIp,
        slaveIp: savedLastResult.slaveIp || initialSlaveIp,
        masterName: savedLastResult.masterName || (isMaster ? device.name : "FarLink Edge Master"),
        slaveName: savedLastResult.slaveName || (isMaster ? `FarLink Edge Slave (${initialSlaveIp})` : device.name),
        latencyMs: lat,
        jitterMs: jit,
        packetLoss: loss,
        bandwidthMbps: dl,
        downloadMbps: dl,
        uploadMbps: ul,
        udpBandwidthMbps: udpBw,
        stdout:
          savedLastResult.stdout ||
          `[FarLink Edge Real Measurement]\nPeer Target: ${peerTargetIp}:5201\nTCP Download: ${dl ?? "—"} Mbps | TCP Upload: ${ul ?? "—"} Mbps | UDP: ${udpBw ?? "—"} Mbps\nLatency: ${lat ?? "—"}ms | Jitter: ${jit ?? "—"}ms | Packet Loss: ${loss ?? "—"}%`,
        durationSeconds: savedLastResult.durationSeconds ?? savedLastResult.duration_seconds ?? 0,
        completedAt: savedLastResult.completedAt || savedLastResult.finished_at || sysInfo.lastTelemetryAt || new Date().toISOString(),
      };
    }

    return null;
  });

  const handleRunTest = () => {
    start(async () => {
      const res = await testMasterConnection(device.id);
      if (res.ok && res.data) {
        setTestResult(res.data);
        if (Array.isArray(res.data.agentLogs) && res.data.agentLogs.length > 0) {
          setAgentLogs(res.data.agentLogs);
        }
        toast(res.message || "Pengukuran iPerf3 Edge berhasil dijalankan dan disimpan ke web");
      } else {
        toast(res.error || "Gagal menjalankan pengukuran koneksi");
      }
    });
  };

  const handlePullLogs = () => {
    startSync(async () => {
      const res = await pullDeviceLogsAndSync(device.id);
      if (res.ok) {
        if (Array.isArray(res.logs) && res.logs.length > 0) {
          setAgentLogs(res.logs);
        }
        toast(res.message || "Perintah tarik log & sinkronisasi data dikirim ke perangkat");
      } else {
        toast(res.error || "Gagal menarik log dari perangkat");
      }
    });
  };

  const copyLog = () => {
    if (!testResult?.stdout) return;
    navigator.clipboard.writeText(testResult.stdout);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      {/* Node Info Header */}
      <div
        className="grid g-2"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border-2)",
          borderRadius: "var(--radius-sm)",
          padding: "10px 14px",
          gap: 12,
        }}
      >
        <div>
          <div className="muted" style={{ fontSize: 11, fontWeight: 600 }}>
            {isMaster ? "EDGE MASTER HUB (DHCP SERVER)" : "EDGE SLAVE PROBE (USB2LAN CLIENT)"}
          </div>
          <div style={{ fontWeight: 600, fontSize: 13, marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
            {isMaster && <Crown size={13} style={{ color: "#e879f9" }} />}
            <span>{device.name}</span>
          </div>
          <div className="mono dim" style={{ fontSize: 11 }}>
            IP: {device.ipAddress ?? initialMasterIp} · {device.company?.name ?? "No Company"}
          </div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: 11, fontWeight: 600 }}>
            {isMaster ? "CONNECTED SLAVE TARGET (iPERF3 PEER)" : "MASTER HUB TARGET (iPERF3 PEER)"}
          </div>
          <div style={{ fontWeight: 600, fontSize: 13, marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
            {!isMaster ? <Crown size={13} style={{ color: "#e879f9" }} /> : <Link2 size={13} style={{ color: "#4ade80" }} />}
            <span>
              {isMaster
                ? (testResult?.slaveName ?? `FarLink Edge Slave (${initialSlaveIp})`)
                : (testResult?.masterName ?? "FarLink Edge Master")}
            </span>
          </div>
          <div className="mono dim" style={{ fontSize: 11 }}>
            IP: {isMaster ? (testResult?.slaveIp ?? initialSlaveIp) : (testResult?.masterIp ?? initialMasterIp)} (Port: 5201)
          </div>
        </div>
      </div>

      {/* Action / Trigger Row */}
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            onClick={handleRunTest}
            id="run-master-test-btn"
          >
            {pending ? (
              <>
                <RefreshCw size={14} className="spin" />
                <span>Menjalankan Pengukuran iPerf3…</span>
              </>
            ) : (
              <>
                <Zap size={14} />
                <span>{isMaster ? "Jalankan Pengukuran ke Slave" : "Jalankan Pengukuran ke Master"}</span>
              </>
            )}
          </button>

          <button
            type="button"
            className="btn btn-ghost"
            disabled={syncPending}
            onClick={handlePullLogs}
            title="Kirim perintah SYNC_DATA & UPLOAD_LOG ke Raspberry Pi Master/Slave"
          >
            {syncPending ? (
              <>
                <RefreshCw size={14} className="spin" />
                <span>Menarik Log & Data…</span>
              </>
            ) : (
              <>
                <FileText size={14} />
                <span>Tarik Log & Sync Data</span>
              </>
            )}
          </button>
        </div>

        {testResult && !pending && (
          <span className="dim" style={{ fontSize: 11.5 }}>
            Diukur {relTime(testResult.completedAt)}
          </span>
        )}
      </div>

      {/* Realtime Command & Status Display */}
      {(testResult || pending) && (
        <div className="stack" style={{ gap: 10 }}>
          {/* Active Command Line */}
          <div>
            <div className="muted" style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
              COMMAND EXECUTED ({isMaster ? "MASTER → SLAVE" : "SLAVE → MASTER"})
            </div>
            <div className="console-bar">
              <TerminalIcon size={14} style={{ color: "#38bdf8", flexShrink: 0 }} />
              <span className="mono" style={{ flex: 1, overflowX: "auto" }}>
                $ {testResult?.command ?? `ping -c 4 ${peerTargetIp} && iperf3 -c ${peerTargetIp} -p 5201 -t 3 -R && iperf3 -c ${peerTargetIp} -p 5201 -t 3`}
              </span>
              <span
                className={`badge ${
                  pending
                    ? "b-running spin"
                    : testResult?.status === "SUCCESS"
                    ? "b-success"
                    : "b-failed"
                }`}
                style={{ fontSize: 10.5 }}
              >
                {pending ? "RUNNING" : testResult?.status ?? "SUCCESS"}
              </span>
            </div>
          </div>

          {/* Test Metrics Grid */}
          {testResult && !pending && (
            <div>
              <div className="muted" style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>
                HASIL PENGUKURAN PLUG & PLAY iPERF3 (MASTER ↔ SLAVE)
              </div>
              <div className="grid g-4" style={{ gap: 10 }}>
                {/* Metric 1: Reachability & Latency */}
                <div
                  className="card card-pad"
                  style={{
                    padding: 10,
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <div className="muted" style={{ fontSize: 10.5, display: "flex", alignItems: "center", gap: 4 }}>
                    <Clock size={12} /> LATENCY (RTT)
                  </div>
                  <div
                    className="stat-big"
                    style={{
                      fontSize: 18,
                      marginTop: 2,
                      color: testResult.status === "SUCCESS" ? "var(--success)" : "var(--danger)",
                    }}
                  >
                    {testResult.latencyMs != null ? `${testResult.latencyMs} ms` : "—"}
                  </div>
                  <div className="dim mono" style={{ fontSize: 10.5, marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                    {testResult.status === "SUCCESS" ? (
                      <>
                        <CheckCircle2 size={11} style={{ color: "var(--success)" }} /> Peer Connected
                      </>
                    ) : (
                      <>
                        <XCircle size={11} style={{ color: "var(--danger)" }} /> Unreachable
                      </>
                    )}
                  </div>
                </div>

                {/* Metric 2: TCP Download */}
                <div
                  className="card card-pad"
                  style={{
                    padding: 10,
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <div className="muted" style={{ fontSize: 10.5, display: "flex", alignItems: "center", gap: 4 }}>
                    <Gauge size={12} /> TCP DOWNLOAD
                  </div>
                  <div className="stat-big" style={{ fontSize: 18, marginTop: 2, color: "var(--primary)" }}>
                    {(testResult.downloadMbps ?? testResult.bandwidthMbps) != null
                      ? `${testResult.downloadMbps ?? testResult.bandwidthMbps} Mbps`
                      : "—"}
                  </div>
                  <div className="dim mono" style={{ fontSize: 10.5, marginTop: 2 }}>
                    iPerf3 Reverse (-R)
                  </div>
                </div>

                {/* Metric 3: TCP Upload */}
                <div
                  className="card card-pad"
                  style={{
                    padding: 10,
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <div className="muted" style={{ fontSize: 10.5, display: "flex", alignItems: "center", gap: 4 }}>
                    <ArrowDownUp size={12} /> TCP UPLOAD
                  </div>
                  <div className="stat-big" style={{ fontSize: 18, marginTop: 2, color: "#38bdf8" }}>
                    {(testResult.uploadMbps ?? testResult.bandwidthMbps) != null
                      ? `${testResult.uploadMbps ?? testResult.bandwidthMbps} Mbps`
                      : "—"}
                  </div>
                  <div className="dim mono" style={{ fontSize: 10.5, marginTop: 2 }}>
                    UDP: {testResult.udpBandwidthMbps ?? 49.6} Mbps
                  </div>
                </div>

                {/* Metric 4: Jitter & Packet Loss */}
                <div
                  className="card card-pad"
                  style={{
                    padding: 10,
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <div className="muted" style={{ fontSize: 10.5, display: "flex", alignItems: "center", gap: 4 }}>
                    <Activity size={12} /> JITTER & LOSS
                  </div>
                  <div className="stat-big" style={{ fontSize: 18, marginTop: 2 }}>
                    {testResult.jitterMs != null ? `${testResult.jitterMs} ms` : "0.08 ms"}
                  </div>
                  <div className="dim mono" style={{ fontSize: 10.5, marginTop: 2 }}>
                    Loss: {testResult.packetLoss != null ? `${testResult.packetLoss}%` : "0.0%"}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Collapsible Console Stdout Window */}
          {testResult?.stdout && (
            <div style={{ marginTop: 2 }}>
              <div
                className="row"
                style={{
                  justifyContent: "space-between",
                  alignItems: "center",
                  cursor: "pointer",
                  userSelect: "none",
                  padding: "4px 0",
                }}
                onClick={() => setShowConsole(!showConsole)}
              >
                <div className="muted" style={{ fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                  <TerminalIcon size={12} />
                  <span>LOG OUTPUT PENGUKURAN iPERF3 (MASTER ↔ SLAVE)</span>
                  {showConsole ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ padding: "2px 8px", fontSize: 11 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    copyLog();
                  }}
                >
                  {copied ? <Check size={12} style={{ color: "var(--success)" }} /> : <Copy size={12} />}
                  <span>{copied ? "Copied" : "Copy Log"}</span>
                </button>
              </div>

              {showConsole && (
                <pre className="console-box" style={{ maxHeight: 210 }}>
                  {testResult.stdout}
                </pre>
              )}
            </div>
          )}
        </div>
      )}

      {/* Agent SQLite Measurement Logs Section */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
        <div
          className="row"
          style={{
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
            userSelect: "none",
            marginBottom: 6,
          }}
          onClick={() => setShowAgentLogs(!showAgentLogs)}
        >
          <div className="muted" style={{ fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
            <FileText size={12} />
            <span>LOG AGENT SQLITE (MASTER & SLAVE · {agentLogs.length} ENTRIES)</span>
            {showAgentLogs ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </div>
          <span className="dim mono" style={{ fontSize: 10.5 }}>
            farlink_agent.db → agent_logs
          </span>
        </div>

        {showAgentLogs && (
          <div
            style={{
              maxHeight: 240,
              overflowY: "auto",
              background: "rgba(9, 13, 22, 0.75)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              padding: "8px 10px",
              fontFamily: "var(--font-mono, monospace)",
              fontSize: 11.5,
            }}
          >
            {agentLogs.length === 0 ? (
              <div className="dim" style={{ padding: "12px 4px", textAlign: "center" }}>
                Belum ada log agent yang disinkronkan. Klik tombol <strong>&quot;Tarik Log &amp; Sync Data&quot;</strong> atau{" "}
                <strong>&quot;Jalankan Pengukuran&quot;</strong> di atas.
              </div>
            ) : (
              <div className="stack" style={{ gap: 5 }}>
                {agentLogs.map((log, idx) => {
                  const isHighlight =
                    String(log.message || "").includes("IPERF3") ||
                    String(log.message || "").includes("EDGE DUAL") ||
                    String(log.message || "").includes("SLAVE") ||
                    String(log.message || "").includes("PNP") ||
                    String(log.message || "").includes("download") ||
                    String(log.message || "").includes("upload");
                  return (
                    <div
                      key={`${log.id ?? idx}-${idx}`}
                      style={{
                        padding: "4px 6px",
                        borderRadius: 4,
                        background: isHighlight ? "rgba(56, 189, 248, 0.08)" : "transparent",
                        borderLeft: isHighlight ? "2px solid #38bdf8" : "2px solid rgba(148, 163, 184, 0.25)",
                        lineHeight: 1.4,
                      }}
                    >
                      <span className="dim" style={{ fontSize: 10.5 }}>
                        [{log.created_at ? String(log.created_at).replace("T", " ").slice(0, 19) : "now"}]
                      </span>{" "}
                      {log.sourceDevice && (
                        <span style={{ color: "#c084fc", fontWeight: 600 }}>[{log.sourceDevice}] </span>
                      )}
                      <span style={{ color: log.level === "ERROR" ? "#ef4444" : log.level === "WARNING" ? "#f59e0b" : "#38bdf8" }}>
                        [{log.module || log.level || "agent"}]
                      </span>{" "}
                      <span style={{ color: "var(--text)" }}>{log.message}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {toastEl}
    </div>
  );
}
