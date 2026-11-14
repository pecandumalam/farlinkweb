export type DeviceEdgeMode = "Master" | "Slave" | "Standalone" | null;

export interface DeviceRoleInfo {
  isEdge: boolean;
  edgeMode: DeviceEdgeMode;
  label: string;
  isSlaveConnected?: boolean;
  slaveLatencyMs?: number | null;
  slaveIp?: string | null;
}

/**
 * Parses a device and its JSON config to determine whether it is a FarLink Edge
 * device and its operational role (Master, Slave, or Standalone), including P2P slave link state.
 */
export function getDeviceRole(device: {
  type?: string | null;
  config?: string | null | Record<string, any>;
}): DeviceRoleInfo {
  let cfg: Record<string, any> = {};
  if (typeof device?.config === "string") {
    try {
      cfg = JSON.parse(device.config || "{}");
    } catch {
      cfg = {};
    }
  } else if (device?.config && typeof device.config === "object") {
    cfg = device.config;
  }

  const rawType = String(device?.type || "").toUpperCase();
  const cfgType = String(cfg.type || cfg.device_type || "").toUpperCase();
  const cfgMode = cfg.mode || cfg.device_mode;

  const isEdge =
    rawType.includes("EDGE") ||
    cfgType.includes("EDGE") ||
    cfgMode === "Master" ||
    cfgMode === "Slave";

  if (!isEdge) {
    return {
      isEdge: false,
      edgeMode: null,
      label: "FarLink Go",
    };
  }

  let edgeMode: DeviceEdgeMode = "Slave";
  if (cfgMode === "Master") {
    edgeMode = "Master";
  } else if (cfgMode === "Standalone") {
    edgeMode = "Standalone";
  } else if (cfgMode === "Slave") {
    edgeMode = "Slave";
  } else {
    // Default FarLink Edge is Slave unless specified
    edgeMode = "Slave";
  }

  const sysInfo = (typeof cfg.systemInfo === "object" && cfg.systemInfo) ? cfg.systemInfo : {};
  const isSlaveConnected = Boolean(
    sysInfo.slaveConnected ??
    sysInfo.slave_connected ??
    cfg.slaveConnected ??
    cfg.slave_connected ??
    false
  );
  const slaveLatencyMs =
    isSlaveConnected
      ? (sysInfo.slaveLatencyMs ??
        sysInfo.slave_latency_ms ??
        cfg.slaveLatencyMs ??
        cfg.slave_latency_ms ??
        null)
      : null;

  let slaveIp =
    sysInfo.slaveIp ??
    sysInfo.slave_ip ??
    cfg.slaveIp ??
    cfg.slave_ip ??
    null;

  // Do not use localhost
  if (typeof slaveIp === "string" && slaveIp === "127.0.0.1") {
    slaveIp = null;
  }

  return {
    isEdge: true,
    edgeMode,
    label: `FarLink Edge (${edgeMode})`,
    isSlaveConnected,
    slaveLatencyMs,
    slaveIp,
  };
}

