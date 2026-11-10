export const TEST_TYPES = ["SPEED", "IPERF", "MTR", "DIG", "CURL", "TCP_PORT"] as const;
export const TRIGGERS = ["MANUAL", "REMOTE", "SCHEDULED"] as const;
export const INTERVALS = [
  { value: 0, label: "OFF" },
  { value: 15, label: "15 Minutes" },
  { value: 60, label: "1 Hour" },
  { value: 1440, label: "24 Hours" },
];
export const COMMAND_TYPES = [
  "RUN_TEST",
  "SET_SCHEDULE",
  "UPDATE_CONFIG",
  "REBOOT",
  "REBOOT_DEVICE",
  "RESTART_AGENT",
  "SYNC_TIME",
  "GET_LOGS",
  "UPLOAD_LOG",
  "SYNC_CONFIG",
  "SYNC_DATA",
  "TEST_MASTER",
] as const;
export const RISKY_COMMANDS = ["REBOOT", "UPDATE_CONFIG"];

export const TEST_LABEL: Record<string, string> = {
  SPEED: "Speed Test (WAN)",
  IPERF: "Local iPerf (Edge Dual)",
  MTR: "MTR",
  DIG: "DIG",
  CURL: "CURL",
  TCP_PORT: "TCP Port",
};

export function offlineSeconds() {
  return Number(process.env.DEVICE_OFFLINE_SECONDS ?? 120);
}

export type DeviceStatus = "ONLINE" | "OFFLINE" | "WARNING";

export function deviceStatus(d: { lastSeenAt: Date | null; gatewayStatus: string }): DeviceStatus {
  if (!d.lastSeenAt) return "OFFLINE";
  const age = (Date.now() - d.lastSeenAt.getTime()) / 1000;
  if (age > offlineSeconds()) return "OFFLINE";
  if (d.gatewayStatus === "UNREACHABLE") return "WARNING";
  return "ONLINE";
}

export function fmtDateTime(d?: Date | string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function fmtTime(d?: Date | string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function relTime(d?: Date | string | null) {
  if (!d) return "never";
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export function resultSummary(r: { testType: string; status: string; download: number | null; upload: number | null; latency: number | null; errorMessage?: string | null }) {
  if (r.status === "FAILED") return "FAILED";
  if (r.testType === "SPEED" || r.testType === "IPERF" || r.testType === "EDGE_DUAL") return `${r.download?.toFixed(0) ?? "-"}/${r.upload?.toFixed(0) ?? "-"} Mbps`;
  if (r.latency != null) return `${r.latency.toFixed(1)} ms`;
  return "OK";
}
