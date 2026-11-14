"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Calendar,
  Activity,
  Gauge,
  Clock,
  CheckCircle2,
  XCircle,
  Filter,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Terminal as TerminalIcon,
  ArrowDown,
  ArrowUp,
  Server,
  FileText,
} from "lucide-react";
import { Badge } from "./ui";
import { TEST_LABEL, fmtDateTime, relTime } from "@/lib/constants";
import type { AgentLogEntry } from "./MasterConnectionTest";

export interface MeasurementTestRow {
  id: string;
  testType: string;
  triggerType: string;
  status: string;
  target: string | null;
  download: number | null;
  upload: number | null;
  latency: number | null;
  jitter: number | null;
  packetLoss: number | null;
  duration: number | null;
  errorMessage: string | null;
  resultData?: string | null;
  startedAt: string | Date;
  completedAt?: string | Date | null;
}

interface UnifiedActivityCardItem {
  id: string;
  kind: "TEST_RESULT" | "AGENT_LOG";
  timestampIso: string;
  dateKey: string; // YYYY-MM-DD (local date)
  title: string;
  testType: string;
  triggerType: string;
  status: string;
  target: string | null;
  download: number | null;
  upload: number | null;
  udpBandwidth: number | null;
  latency: number | null;
  jitter: number | null;
  packetLoss: number | null;
  duration: number | null;
  logSummary: string;
  detailStdout: string | null;
  relatedLogs: AgentLogEntry[];
  historyDetailHref?: string;
}

const DATA_LIMIT = 10;

function toDateKey(input: string | Date | undefined | null): string {
  if (!input) return "";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(dateKey: string): string {
  if (!dateKey) return "—";
  const parts = dateKey.split("-").map(Number);
  if (parts.length !== 3) return dateKey;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function MeasurementActivityLogCards({
  deviceName,
  testResults,
  agentLogs = [],
  initialDate = "",
  isMaster = false,
  slaveTargetLabel = "",
}: {
  deviceName: string;
  testResults: MeasurementTestRow[];
  agentLogs?: AgentLogEntry[];
  initialDate?: string;
  isMaster?: boolean;
  slaveTargetLabel?: string;
}) {
  const [selectedDate, setSelectedDate] = useState<string>(initialDate);
  const [sourceFilter, setSourceFilter] = useState<"ALL" | "TEST_RESULT" | "AGENT_LOG">("ALL");
  const [page, setPage] = useState<number>(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Build unified list of measurement activity cards from TestResult + AgentLogs
  const allItems = useMemo<UnifiedActivityCardItem[]>(() => {
    const items: UnifiedActivityCardItem[] = [];
    const usedLogIndices = new Set<number>();

    for (const r of testResults) {
      const startDt = new Date(r.startedAt);
      const startMs = startDt.getTime();
      const dateKey = toDateKey(r.startedAt);

      let parsedData: Record<string, any> = {};
      if (r.resultData) {
        try {
          parsedData = JSON.parse(r.resultData);
        } catch {}
      }

      const udpBw =
        parsedData.udpBandwidthMbps ??
        parsedData.udp_bandwidth_mbps ??
        null;

      // Match agent_logs within +/- 45 seconds of this test execution
      const matchedLogs: AgentLogEntry[] = [];
      agentLogs.forEach((log, idx) => {
        if (!log.created_at) return;
        const logMs = new Date(log.created_at).getTime();
        if (!Number.isNaN(logMs) && Math.abs(logMs - startMs) <= 45_000) {
          matchedLogs.push(log);
          usedLogIndices.add(idx);
        }
      });

      const displayTestType = isMaster && (r.testType === "SPEED" || r.testType === "IPERF" || r.testType === "TEST LAN")
        ? "TEST LAN"
        : (TEST_LABEL[r.testType] ?? r.testType);
      const displayTarget = isMaster
        ? (!r.target || r.target === "Speedtest Server" || r.target === "speedtest.net"
            ? (slaveTargetLabel || "10.42.0.10 (farlink-slave-01)")
            : r.target)
        : (r.target ?? "Default Server");

      const defaultLogMsg =
        r.status === "FAILED"
          ? `[ERROR] Pengukuran ${displayTestType} gagal: ${r.errorMessage || "Timeout / Unreachable"}`
          : `[MEASUREMENT OK] ${displayTestType} (${r.triggerType}) → Target: ${displayTarget}${
              r.download != null ? ` | DL: ${r.download} Mbps` : ""
            }${r.upload != null ? ` | UL: ${r.upload} Mbps` : ""}${
              udpBw != null ? ` | UDP: ${udpBw} Mbps` : ""
            }${r.latency != null ? ` | Latency: ${r.latency} ms` : ""}${
              r.jitter != null ? ` | Jitter: ${r.jitter} ms` : ""
            }${r.packetLoss != null ? ` | Loss: ${r.packetLoss}%` : ""}`;

      const logSummary =
        matchedLogs.find((l) => l.module === "test_runner" || (l.message && l.message.includes("Mbps")))?.message ||
        defaultLogMsg;

      const detailStdout =
        typeof parsedData.stdout === "string" && parsedData.stdout.trim()
          ? parsedData.stdout
          : typeof parsedData.raw_output === "string" && parsedData.raw_output.trim()
            ? parsedData.raw_output
            : null;

      items.push({
        id: r.id,
        kind: "TEST_RESULT",
        timestampIso: startDt.toISOString(),
        dateKey,
        title: isMaster && (r.testType === "SPEED" || r.testType === "IPERF" || r.testType === "TEST LAN")
          ? "TEST LAN (Edge Master ↔ Slave)"
          : (TEST_LABEL[r.testType] ?? `Pengukuran ${r.testType}`),
        testType: isMaster && (r.testType === "SPEED" || r.testType === "IPERF") ? "TEST LAN" : r.testType,
        triggerType: r.triggerType,
        status: r.status,
        target: displayTarget,
        download: r.download,
        upload: r.upload,
        udpBandwidth: udpBw,
        latency: r.latency,
        jitter: r.jitter,
        packetLoss: r.packetLoss,
        duration: r.duration,
        logSummary,
        detailStdout,
        relatedLogs: matchedLogs,
        historyDetailHref: `/history/${r.id}`,
      });
    }

    // Also include standalone measurement agent_logs that didn't match a TestResult timestamp
    agentLogs.forEach((log, idx) => {
      if (usedLogIndices.has(idx)) return;
      if (!log.message) return;
      const ts = log.created_at || new Date().toISOString();
      const dateKey = toDateKey(ts);
      if (!dateKey) return;

      // Parse download/upload/latency if present in log message
      const dlMatch = log.message.match(/(?:download|DL)[=:\s]+([\d.]+)\s*Mbps/i);
      const ulMatch = log.message.match(/(?:upload|UL)[=:\s]+([\d.]+)\s*Mbps/i);
      const latMatch = log.message.match(/(?:latency|RTT)[=:\s]+([\d.]+)\s*ms/i);

      items.push({
        id: `agent-log-${log.id ?? idx}-${ts}`,
        kind: "AGENT_LOG",
        timestampIso: new Date(ts).toISOString(),
        dateKey,
        title: `Log Aktivitas Agent · ${log.module || "farlink_agent"}`,
        testType: "AGENT_LOG",
        triggerType: log.sourceDevice || deviceName,
        status: log.level === "ERROR" ? "FAILED" : log.level === "WARNING" ? "WARNING" : "SUCCESS",
        target: log.sourceDevice || deviceName,
        download: dlMatch ? Number(dlMatch[1]) : null,
        upload: ulMatch ? Number(ulMatch[1]) : null,
        udpBandwidth: null,
        latency: latMatch ? Number(latMatch[1]) : null,
        jitter: null,
        packetLoss: null,
        duration: null,
        logSummary: log.message,
        detailStdout: null,
        relatedLogs: [log],
      });
    });

    items.sort((a, b) => b.timestampIso.localeCompare(a.timestampIso));
    return items;
  }, [testResults, agentLogs, deviceName]);

  // Distinct available dates with counts
  const availableDates = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of allItems) {
      if (sourceFilter !== "ALL" && item.kind !== sourceFilter) continue;
      if (!item.dateKey) continue;
      counts.set(item.dateKey, (counts.get(item.dateKey) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([dateKey, count]) => ({ dateKey, count, label: formatDateLabel(dateKey) }))
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [allItems, sourceFilter]);

  // Filter items by selected specific date & source type
  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      if (sourceFilter !== "ALL" && item.kind !== sourceFilter) return false;
      if (selectedDate && item.dateKey !== selectedDate) return false;
      return true;
    });
  }, [allItems, selectedDate, sourceFilter]);

  // Limit data to 10 items per page
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / DATA_LIMIT));
  const safePage = Math.min(page, totalPages);
  const displayedCards = useMemo(() => {
    const startIdx = (safePage - 1) * DATA_LIMIT;
    return filteredItems.slice(startIdx, startIdx + DATA_LIMIT);
  }, [filteredItems, safePage]);

  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
    setPage(1);
  };

  const todayKey = toDateKey(new Date());

  return (
    <div className="card fade-in" style={{ marginTop: 16 }}>
      {/* Card Header + Date Filter Controls */}
      <div
        className="card-head"
        style={{
          flexWrap: "wrap",
          gap: 12,
          borderBottom: "1px solid var(--border)",
          paddingBottom: 14,
        }}
      >
        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          <div
            className="kpi-icon tone-info"
            style={{
              position: "static",
              width: 38,
              height: 38,
              borderRadius: 10,
              flexShrink: 0,
            }}
          >
            <Activity size={18} />
          </div>
          <div>
            <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: 16 }}>Card Log Aktivitas Pengukuran</h2>
              <span
                className="badge"
                style={{
                  background: "rgba(56, 189, 248, 0.14)",
                  color: "#38bdf8",
                  border: "1px solid rgba(56, 189, 248, 0.3)",
                  fontSize: 11,
                }}
              >
                Limit {DATA_LIMIT} Data
              </span>
              {selectedDate && (
                <span
                  className="badge"
                  style={{
                    background: "rgba(192, 132, 252, 0.15)",
                    color: "#e879f9",
                    border: "1px solid rgba(192, 132, 252, 0.35)",
                    fontSize: 11,
                  }}
                >
                  Tanggal: {formatDateLabel(selectedDate)}
                </span>
              )}
            </div>
            <p className="dim" style={{ margin: "2px 0 0 0", fontSize: 12 }}>
              Daftar aktivitas pengujian jaringan &amp; log pengukuran perangkat <strong>{deviceName}</strong> dalam bentuk kartu (maksimal {DATA_LIMIT} data per tampilan).
            </p>
          </div>
        </div>

        {/* Date Picker & Source Filter Controls */}
        <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div
            className="row"
            style={{
              gap: 6,
              alignItems: "center",
              background: "rgba(15, 23, 42, 0.65)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "4px 10px",
            }}
          >
            <Calendar size={14} className="muted" />
            <span className="dim" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
              Pilih Tanggal:
            </span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => handleDateChange(e.target.value)}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--fg)",
                fontSize: 12,
                fontFamily: "var(--font-mono, monospace)",
                outline: "none",
                cursor: "pointer",
              }}
              title="Filter log aktivitas pengukuran berdasarkan tanggal tertentu"
            />
          </div>

          <select
            className="select"
            value={sourceFilter}
            onChange={(e) => {
              setSourceFilter(e.target.value as "ALL" | "TEST_RESULT" | "AGENT_LOG");
              setPage(1);
            }}
            style={{ height: 32, fontSize: 12, padding: "0 10px", width: "auto" }}
            title="Filter kategori log aktivitas"
          >
            <option value="ALL">Semua Aktivitas ({allItems.length})</option>
            <option value="TEST_RESULT">Hasil Pengukuran ({testResults.length})</option>
            <option value="AGENT_LOG">Log Agent SQLite ({agentLogs.length})</option>
          </select>

          {selectedDate && (
            <button
              type="button"
              onClick={() => handleDateChange("")}
              className="btn btn-ghost btn-sm"
              style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
              title="Reset filter tanggal"
            >
              <RotateCcw size={13} /> Semua Tanggal
            </button>
          )}
        </div>
      </div>

      {/* Quick Date Selector Bar (Tampilkan Berdasarkan Tanggal Tertentu) */}
      <div
        style={{
          padding: "10px 18px",
          borderBottom: "1px solid var(--border)",
          background: "rgba(15, 23, 42, 0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span className="dim" style={{ fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4, marginRight: 4 }}>
            <Filter size={12} /> Tanggal Tersedia:
          </span>

          <button
            type="button"
            onClick={() => handleDateChange("")}
            className={`btn btn-sm ${selectedDate === "" ? "btn-primary" : "btn-ghost"}`}
            style={{ fontSize: 11, padding: "3px 9px", height: 26 }}
          >
            Semua Tanggal ({allItems.length})
          </button>

          <button
            type="button"
            onClick={() => handleDateChange(todayKey)}
            className={`btn btn-sm ${selectedDate === todayKey ? "btn-primary" : "btn-ghost"}`}
            style={{ fontSize: 11, padding: "3px 9px", height: 26 }}
          >
            Hari Ini ({formatDateLabel(todayKey)})
          </button>

          {availableDates
            .filter((d) => d.dateKey !== todayKey)
            .slice(0, 8)
            .map((d) => (
              <button
                key={d.dateKey}
                type="button"
                onClick={() => handleDateChange(d.dateKey)}
                className={`btn btn-sm ${selectedDate === d.dateKey ? "btn-primary" : "btn-ghost"}`}
                style={{ fontSize: 11, padding: "3px 9px", height: 26 }}
              >
                {d.label} ({d.count})
              </button>
            ))}
        </div>

        <div className="dim mono" style={{ fontSize: 11 }}>
          Menampilkan <strong>{displayedCards.length}</strong> dari <strong>{filteredItems.length}</strong> data (Maks. {DATA_LIMIT} card)
        </div>
      </div>

      {/* Cards Grid / Stack */}
      <div className="card-body">
        {displayedCards.length === 0 ? (
          <div className="empty" style={{ padding: "32px 16px" }}>
            Tidak ada log aktivitas pengukuran pada tanggal{" "}
            <strong>{selectedDate ? formatDateLabel(selectedDate) : "tersebut"}</strong>.{" "}
            {selectedDate && (
              <button
                type="button"
                onClick={() => handleDateChange("")}
                className="btn btn-ghost btn-sm"
                style={{ marginLeft: 8 }}
              >
                Tampilkan Semua Tanggal
              </button>
            )}
          </div>
        ) : (
          <div className="stack" style={{ gap: 12 }}>
            {displayedCards.map((item, idx) => {
              const cardNumber = (safePage - 1) * DATA_LIMIT + idx + 1;
              const isSuccess = item.status === "SUCCESS";
              const isFailed = item.status === "FAILED";
              const isExpanded = expandedId === item.id;
              const hasExpandableDetails = Boolean(item.detailStdout || item.relatedLogs.length > 0);

              return (
                <div
                  key={item.id}
                  className="card card-pad"
                  style={{
                    padding: "14px 16px",
                    background: "rgba(15, 23, 42, 0.55)",
                    border: isFailed
                      ? "1px solid rgba(239, 68, 68, 0.35)"
                      : item.testType === "IPERF"
                        ? "1px solid rgba(192, 132, 252, 0.32)"
                        : "1px solid var(--border)",
                    boxShadow: "none",
                    transition: "border-color 0.15s ease",
                  }}
                >
                  {/* Top Bar of Activity Card */}
                  <div
                    className="row"
                    style={{
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      flexWrap: "wrap",
                      gap: 10,
                      marginBottom: 10,
                    }}
                  >
                    <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <span
                        className="mono"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          minWidth: 28,
                          height: 24,
                          padding: "0 7px",
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          background: "rgba(148, 163, 184, 0.12)",
                          color: "#94a3b8",
                          border: "1px solid rgba(148, 163, 184, 0.2)",
                        }}
                      >
                        #{cardNumber}
                      </span>

                      <div className="row" style={{ gap: 6, alignItems: "center" }}>
                        {isSuccess ? (
                          <CheckCircle2 size={16} style={{ color: "var(--success, #22c55e)", flexShrink: 0 }} />
                        ) : isFailed ? (
                          <XCircle size={16} style={{ color: "var(--danger, #ef4444)", flexShrink: 0 }} />
                        ) : (
                          <Gauge size={16} style={{ color: "var(--info, #38bdf8)", flexShrink: 0 }} />
                        )}
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{item.title}</span>
                      </div>

                      <Badge value={item.testType} dot={false} />
                      <Badge value={item.triggerType} dot={false} />
                      <Badge value={item.status} />
                    </div>

                    <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <span
                        className="mono dim"
                        style={{
                          fontSize: 12,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                        }}
                      >
                        <Clock size={12} />
                        {fmtDateTime(item.timestampIso)} ({relTime(item.timestampIso)})
                      </span>

                      {item.historyDetailHref && (
                        <Link href={item.historyDetailHref} className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: "2px 8px" }}>
                          Detail Test
                        </Link>
                      )}
                    </div>
                  </div>

                  {/* Metrics Pills Row (Shown when measurement values exist) */}
                  {(item.download != null ||
                    item.upload != null ||
                    item.latency != null ||
                    item.jitter != null ||
                    item.packetLoss != null ||
                    item.target) && (
                    <div
                      className="grid g-4"
                      style={{
                        gap: 8,
                        marginBottom: 10,
                        gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))",
                      }}
                    >
                      {item.download != null && (
                        <div
                          style={{
                            padding: "8px 10px",
                            borderRadius: 8,
                            background: "rgba(34, 197, 94, 0.07)",
                            border: "1px solid rgba(34, 197, 94, 0.2)",
                          }}
                        >
                          <div className="dim" style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 4 }}>
                            <ArrowDown size={11} style={{ color: "#4ade80" }} /> DOWNLOAD
                          </div>
                          <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: "#4ade80" }}>
                            {item.download.toFixed(1)} <span style={{ fontSize: 11, fontWeight: 500 }}>Mbps</span>
                          </div>
                        </div>
                      )}

                      {item.upload != null && (
                        <div
                          style={{
                            padding: "8px 10px",
                            borderRadius: 8,
                            background: "rgba(56, 189, 248, 0.07)",
                            border: "1px solid rgba(56, 189, 248, 0.2)",
                          }}
                        >
                          <div className="dim" style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 4 }}>
                            <ArrowUp size={11} style={{ color: "#38bdf8" }} /> UPLOAD
                          </div>
                          <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: "#38bdf8" }}>
                            {item.upload.toFixed(1)} <span style={{ fontSize: 11, fontWeight: 500 }}>Mbps</span>
                          </div>
                        </div>
                      )}

                      {item.udpBandwidth != null && (
                        <div
                          style={{
                            padding: "8px 10px",
                            borderRadius: 8,
                            background: "rgba(192, 132, 252, 0.08)",
                            border: "1px solid rgba(192, 132, 252, 0.24)",
                          }}
                        >
                          <div className="dim" style={{ fontSize: 10 }}>UDP STREAM</div>
                          <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: "#e879f9" }}>
                            {item.udpBandwidth.toFixed(1)} <span style={{ fontSize: 11, fontWeight: 500 }}>Mbps</span>
                          </div>
                        </div>
                      )}

                      {item.latency != null && (
                        <div
                          style={{
                            padding: "8px 10px",
                            borderRadius: 8,
                            background: "rgba(245, 158, 11, 0.07)",
                            border: "1px solid rgba(245, 158, 11, 0.2)",
                          }}
                        >
                          <div className="dim" style={{ fontSize: 10 }}>LATENCY / JITTER</div>
                          <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: "#fbbf24" }}>
                            {item.latency.toFixed(1)} ms
                            {item.jitter != null && (
                              <span className="dim" style={{ fontSize: 11, fontWeight: 400 }}>
                                {" "}
                                / {item.jitter.toFixed(1)}ms
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {item.packetLoss != null && (
                        <div
                          style={{
                            padding: "8px 10px",
                            borderRadius: 8,
                            background: "rgba(148, 163, 184, 0.06)",
                            border: "1px solid rgba(148, 163, 184, 0.16)",
                          }}
                        >
                          <div className="dim" style={{ fontSize: 10 }}>PACKET LOSS</div>
                          <div
                            className="mono"
                            style={{
                              fontSize: 14,
                              fontWeight: 700,
                              color: item.packetLoss > 1 ? "var(--danger)" : "#cbd5e1",
                            }}
                          >
                            {item.packetLoss}%
                          </div>
                        </div>
                      )}

                      {item.target && (
                        <div
                          style={{
                            padding: "8px 10px",
                            borderRadius: 8,
                            background: "rgba(148, 163, 184, 0.06)",
                            border: "1px solid rgba(148, 163, 184, 0.16)",
                          }}
                        >
                          <div className="dim" style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 4 }}>
                            <Server size={10} /> TARGET / PEER
                          </div>
                          <div
                            className="mono"
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: "#e2e8f0",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={item.target}
                          >
                            {item.target}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Activity Log Line inside Card */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      background: "#070b14",
                      border: "1px solid rgba(148, 163, 184, 0.15)",
                      borderRadius: 6,
                      padding: "7px 11px",
                    }}
                  >
                    <div
                      className="mono"
                      style={{
                        fontSize: 11.5,
                        color: isFailed ? "#fca5a5" : "#cbd5e1",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        overflow: "hidden",
                      }}
                    >
                      <TerminalIcon size={13} style={{ color: "#38bdf8", flexShrink: 0 }} />
                      <span style={{ wordBreak: "break-word" }}>{item.logSummary}</span>
                    </div>

                    {hasExpandableDetails && (
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        className="btn btn-ghost btn-sm"
                        style={{
                          fontSize: 11,
                          padding: "2px 8px",
                          height: 24,
                          flexShrink: 0,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <FileText size={11} />
                        {isExpanded ? "Tutup Log" : "Detail Log"}
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                    )}
                  </div>

                  {/* Expanded Log Details */}
                  {isExpanded && hasExpandableDetails && (
                    <div
                      style={{
                        marginTop: 8,
                        padding: 10,
                        borderRadius: 6,
                        background: "#050811",
                        border: "1px solid rgba(56, 189, 248, 0.22)",
                      }}
                    >
                      {item.detailStdout && (
                        <pre
                          className="mono"
                          style={{
                            margin: 0,
                            fontSize: 11,
                            lineHeight: 1.5,
                            color: "#93c5fd",
                            whiteSpace: "pre-wrap",
                            marginBottom: item.relatedLogs.length > 0 ? 8 : 0,
                          }}
                        >
                          {item.detailStdout}
                        </pre>
                      )}
                      {item.relatedLogs.length > 0 && (
                        <div className="stack" style={{ gap: 4 }}>
                          <div className="dim" style={{ fontSize: 10, fontWeight: 600 }}>
                            LOG AKTIVITAS AGENT TERKAIT ({item.relatedLogs.length}):
                          </div>
                          {item.relatedLogs.map((l, lIdx) => (
                            <div key={lIdx} className="mono" style={{ fontSize: 11, color: "#cbd5e1" }}>
                              <span className="dim">[{fmtDateTime(l.created_at)}]</span>{" "}
                              <span style={{ color: "#38bdf8" }}>[{l.module || "agent"}]</span> {l.message}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer Pagination (When Selected Date or All Dates has > 10 items) */}
        {filteredItems.length > DATA_LIMIT && (
          <div
            className="row"
            style={{
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 14,
              paddingTop: 12,
              borderTop: "1px solid var(--border)",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <div className="dim" style={{ fontSize: 12 }}>
              Halaman <strong>{safePage}</strong> dari <strong>{totalPages}</strong> · Limit{" "}
              <strong>{DATA_LIMIT} card</strong> per halaman
              {selectedDate ? ` pada tanggal ${formatDateLabel(selectedDate)}` : ""}
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="btn btn-ghost btn-sm"
                style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                <ChevronLeft size={14} /> Sebelumnya
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="btn btn-ghost btn-sm"
                style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                Berikutnya <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

