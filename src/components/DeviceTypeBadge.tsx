import { Crown, Link2, Radio, Server } from "lucide-react";
import { getDeviceRole } from "@/lib/device-utils";

export function DeviceTypeBadge({
  device,
  showIcon = true,
}: {
  device: { type?: string | null; config?: string | null | Record<string, any> };
  showIcon?: boolean;
}) {
  const role = getDeviceRole(device);

  if (!role.isEdge) {
    return (
      <span className="badge b-unknown" title="FarLink Go (Portable Network Probe)">
        {showIcon && <Radio size={11} style={{ opacity: 0.8 }} />}
        <span>FarLink Go</span>
      </span>
    );
  }

  if (role.edgeMode === "Master") {
    const isSlaveLinked = Boolean(role.isSlaveConnected);
    const latencyInfo = role.slaveLatencyMs ? ` (${role.slaveLatencyMs} ms)` : "";
    return (
      <span
        className="badge b-master"
        title={
          isSlaveLinked
            ? `FarLink Edge Master — Slave Connected${latencyInfo}`
            : "FarLink Edge Master (Waiting for Slave connection)"
        }
        style={{
          boxShadow: isSlaveLinked
            ? "0 0 12px rgba(34, 197, 94, 0.25), 0 0 4px rgba(192, 132, 252, 0.3)"
            : "0 0 10px rgba(192, 132, 252, 0.2)",
          borderColor: isSlaveLinked ? "rgba(34, 197, 94, 0.45)" : undefined,
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        <span
          className="dot"
          style={{
            backgroundColor: isSlaveLinked ? "#22c55e" : "#c084fc",
            boxShadow: isSlaveLinked ? "0 0 6px #22c55e" : undefined,
          }}
        />
        {showIcon && <Crown size={12} style={{ color: "#e879f9" }} />}
        <span>FarLink Edge · Master</span>
        {isSlaveLinked ? (
          <span
            style={{
              padding: "1px 6px",
              borderRadius: "4px",
              fontSize: "10px",
              fontWeight: 600,
              letterSpacing: "0.02em",
              backgroundColor: "rgba(34, 197, 94, 0.18)",
              color: "#4ade80",
              border: "1px solid rgba(34, 197, 94, 0.35)",
              display: "inline-flex",
              alignItems: "center",
              gap: "3px",
            }}
          >
            <Link2 size={10} style={{ color: "#4ade80" }} />
            <span>Slave Connected{role.slaveLatencyMs ? ` (${role.slaveLatencyMs}ms)` : ""}</span>
          </span>
        ) : (
          <span
            style={{
              padding: "1px 5px",
              borderRadius: "4px",
              fontSize: "9px",
              fontWeight: 500,
              color: "#94a3b8",
              backgroundColor: "rgba(148, 163, 184, 0.1)",
              border: "1px solid rgba(148, 163, 184, 0.2)",
            }}
          >
            Standalone
          </span>
        )}
      </span>
    );
  }

  if (role.edgeMode === "Slave") {
    return (
      <span
        className="badge b-slave"
        title="FarLink Edge Slave (Probes & Tests to Master)"
      >
        <span className="dot" />
        {showIcon && <Link2 size={12} />}
        <span>FarLink Edge · Slave</span>
      </span>
    );
  }

  return (
    <span className="badge b-standalone" title="FarLink Edge Standalone">
      {showIcon && <Server size={11} />}
      <span>FarLink Edge · Standalone</span>
    </span>
  );
}
