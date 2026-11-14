"use server";

// Database reset action – clears all non‑admin data
export async function resetDatabase(_?: unknown): Promise<Res> {
  const s = await requireSession();
  // Only allow ADMIN users to perform a full reset
  if (s.role !== "ADMIN") return { ok: false, error: "Unauthorized" };
  // Delete all test related data
  await prisma.$transaction([
    prisma.testResult.deleteMany(),
    prisma.deviceCommand.deleteMany(),
    prisma.device.deleteMany(),
    prisma.company.deleteMany(),
    prisma.auditLog.deleteMany(),
    // Delete users except the default admin (identified by email)
    prisma.user.deleteMany({ where: { email: { not: "admin@farlink.local" } } }),
  ]);
  await audit(s.sub, "DB_RESET");
  // Revalidate pages that depend on data
  revalidatePath("/dashboard");
  revalidatePath("/devices");
  revalidatePath("/customers");
  revalidatePath("/history");
  revalidatePath("/tests");
  revalidatePath("/settings");
  return { ok: true, message: "Database has been reset" };
}

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "./db";
import { requireSession } from "./auth";
import { generateDummy } from "./dummy";
import { COMMAND_TYPES, TEST_TYPES } from "./constants";
import { hashToken } from "./token";
import { getDeviceRole } from "./device-utils";
import { probeHostPort, pingHost } from "./net-probe";

type Res = { ok: boolean; error?: string; message?: string; token?: string };

async function audit(userId: string, action: string, target?: string, detail?: unknown) {
  await prisma.auditLog.create({ data: { userId, action, target, detail: detail ? JSON.stringify(detail) : null } });
}

/* ---------------- Company ---------------- */
const companySchema = z.object({ name: z.string().trim().min(2, "Name must be at least 2 characters"), contact: z.string().optional(), address: z.string().optional() });

export async function saveCompany(_: Res | null, fd: FormData): Promise<Res> {
  const s = await requireSession();
  const id = fd.get("id")?.toString();
  const p = companySchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  try {
    if (id) await prisma.company.update({ where: { id }, data: p.data });
    else await prisma.company.create({ data: p.data });
  } catch {
    return { ok: false, error: "Company name already in use" };
  }
  await audit(s.sub, id ? "COMPANY_UPDATE" : "COMPANY_CREATE", p.data.name);
  revalidatePath("/customers");
  return { ok: true, message: "Company saved successfully" };
}

export async function toggleCompany(id: string) {
  const s = await requireSession();
  const c = await prisma.company.findUniqueOrThrow({ where: { id } });
  await prisma.company.update({ where: { id }, data: { isActive: !c.isActive } });
  await audit(s.sub, "COMPANY_TOGGLE", c.name);
  revalidatePath("/customers");
}

export async function deleteCompany(id: string) {
  const s = await requireSession();
  const c = await prisma.company.delete({ where: { id } });
  await audit(s.sub, "COMPANY_DELETE", c.name);
  revalidatePath("/customers");
  redirect("/customers");
}

/* ---------------- Device ---------------- */
const deviceSchema = z.object({
  name: z.string().trim().min(2),
  serialNumber: z.string().trim().min(2),
  type: z.enum(["FARLINK_GO", "FARLINK_EDGE"]),
  companyId: z.string().optional().transform((v) => v || null),
  ipAddress: z.string().optional().transform((v) => v || null),
  gatewayIp: z.string().optional().transform((v) => v || null),
});

/* ---------------- Device Master Rule ---------------- */
/**
 * Memastikan aturan 1 company hanya memiliki tepat 1 master FarLink Edge.
 * Jika device lain di company yang sama sebelumnya adalah Master, otomatis dialihkan menjadi Slave.
 * Seluruh device Slave juga di-update master_ip nya menuju IP Master baru.
 */
async function enforceSingleMasterInCompany(
  companyId: string,
  currentDeviceId: string,
  masterIp?: string | null,
  userId?: string | null
): Promise<{ demotedName: string | null }> {
  let demotedName: string | null = null;
  const siblings = await prisma.device.findMany({
    where: { companyId, id: { not: currentDeviceId } },
  });

  for (const sib of siblings) {
    let sibCfg: Record<string, any> = {};
    try {
      sibCfg = JSON.parse(sib.config || "{}");
    } catch {
      sibCfg = {};
    }

    const sibRole = getDeviceRole(sib);
    if (sibRole.edgeMode === "Master") {
      sibCfg.mode = "Slave";
      if (masterIp) sibCfg.master_ip = masterIp;
      sibCfg.updatedAt = new Date().toISOString();
      await prisma.device.update({
        where: { id: sib.id },
        data: { config: JSON.stringify(sibCfg) },
      });
      await prisma.deviceCommand.create({
        data: {
          deviceId: sib.id,
          type: "SYNC_CONFIG",
          payload: JSON.stringify(sibCfg),
          createdById: userId ?? null,
        },
      });
      demotedName = sib.name;
    } else if (sibRole.edgeMode === "Slave" && masterIp && sibCfg.master_ip !== masterIp) {
      sibCfg.master_ip = masterIp;
      await prisma.device.update({
        where: { id: sib.id },
        data: { config: JSON.stringify(sibCfg) },
      });
    }
  }

  return { demotedName };
}

export async function saveDevice(_: Res | null, fd: FormData): Promise<Res> {
  const s = await requireSession();
  const id = fd.get("id")?.toString();
  const p = deviceSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { ok: false, error: "Invalid device data" };
  const mode = fd.get("mode")?.toString() || (p.data.type === "FARLINK_EDGE" ? "Slave" : "Standalone");
  let token: string | undefined;
  let demotedNote = "";

  try {
    if (id) {
      const existing = await prisma.device.findUnique({ where: { id } });
      let currentCfg: Record<string, any> = {};
      try {
        currentCfg = JSON.parse(existing?.config || "{}");
      } catch {}

      const updatedCfg = {
        ...currentCfg,
        type: p.data.type === "FARLINK_EDGE" ? "FarLink Edge" : "FarLink Go",
        mode,
        updatedAt: new Date().toISOString(),
      };

      if (p.data.type === "FARLINK_EDGE" && mode === "Master" && p.data.companyId) {
        const { demotedName } = await enforceSingleMasterInCompany(
          p.data.companyId,
          id,
          p.data.ipAddress,
          s.sub
        );
        if (demotedName) {
          demotedNote = ` (${demotedName} role updated to Slave)`;
        }
      }

      await prisma.device.update({
        where: { id },
        data: {
          ...p.data,
          config: JSON.stringify(updatedCfg),
        },
      });

      await prisma.deviceCommand.create({
        data: {
          deviceId: id,
          type: "SYNC_CONFIG",
          payload: JSON.stringify(updatedCfg),
          createdById: s.sub ?? null,
        },
      }).catch(() => {});
    } else {
      const disc = await prisma.discoveredDevice.findUnique({
        where: { serialNumber: p.data.serialNumber },
      });
      const ip = p.data.ipAddress || disc?.ipAddress || null;
      const mac = disc?.macAddress || null;
      const agentVer = disc?.agentVersion || null;
      token = "flk_" + crypto.randomBytes(24).toString("hex");

      const initialCfg = {
        type: p.data.type === "FARLINK_EDGE" ? "FarLink Edge" : "FarLink Go",
        mode,
        createdAt: new Date().toISOString(),
      };

      const newDev = await prisma.device.create({
        data: {
          ...p.data,
          ipAddress: ip,
          macAddress: mac,
          agentVersion: agentVer,
          config: JSON.stringify(initialCfg),
          lastSeenAt: disc?.lastSeenAt || new Date(),
          tokenHash: hashToken(token),
        },
      });

      if (p.data.type === "FARLINK_EDGE" && mode === "Master" && p.data.companyId) {
        const { demotedName } = await enforceSingleMasterInCompany(
          p.data.companyId,
          newDev.id,
          ip,
          s.sub
        );
        if (demotedName) {
          demotedNote = ` (${demotedName} role updated to Slave)`;
        }
      }

      await prisma.discoveredDevice.updateMany({
        where: { serialNumber: p.data.serialNumber },
        data: { isRegistered: true },
      }).catch(() => {});
    }
  } catch {
    return { ok: false, error: "Device name or serial number already taken" };
  }
  await audit(s.sub, id ? "DEVICE_UPDATE" : "DEVICE_CREATE", p.data.name);
  revalidatePath("/devices");
  revalidatePath("/customers");
  return {
    ok: true,
    message: id
      ? `Device updated successfully${demotedNote}`
      : `Device registered successfully! It is now linked to your company.${demotedNote}`,
    token,
  };
}

export async function simulateDeviceConnect(customSn?: string): Promise<Res> {
  const s = await requireSession();
  const hex = crypto.randomBytes(4).toString("hex").toUpperCase();
  const sn = customSn || `RPI-10000000${hex}`;
  await prisma.discoveredDevice.upsert({
    where: { serialNumber: sn },
    update: { lastSeenAt: new Date(), isRegistered: false, ipAddress: "192.168.1." + Math.floor(Math.random() * 200 + 20) },
    create: {
      serialNumber: sn,
      ipAddress: "192.168.1." + Math.floor(Math.random() * 200 + 20),
      macAddress: `b8:27:eb:${hex.slice(0, 2).toLowerCase()}:${hex.slice(2, 4).toLowerCase()}:${hex.slice(4, 6).toLowerCase() || "01"}`,
      deviceType: "FARLINK_GO",
      agentVersion: "1.1.0",
      isRegistered: false,
    },
  });
  await audit(s.sub, "DEVICE_SIMULATE_CONNECT", sn);
  revalidatePath("/customers");
  revalidatePath("/devices");
  return { ok: true, message: `Raspberry Pi (${sn}) connected and waiting for registration.` };
}


export async function regenerateToken(id: string): Promise<Res> {
  const s = await requireSession();
  const token = "flk_" + crypto.randomBytes(24).toString("hex");
  const d = await prisma.device.update({ where: { id }, data: { tokenHash: hashToken(token) } });
  await audit(s.sub, "DEVICE_TOKEN_REGENERATE", d.name);
  return { ok: true, token };
}

export async function deleteDevice(id: string) {
  const s = await requireSession();
  const d = await prisma.device.delete({ where: { id } });
  await audit(s.sub, "DEVICE_DELETE", d.name);
  revalidatePath("/devices");
  redirect("/devices");
}

/* ---------------- Commands ---------------- */
export async function sendCommand(deviceId: string, type: string, payload: Record<string, unknown> = {}): Promise<Res> {
  const s = await requireSession();
  if (!(COMMAND_TYPES as readonly string[]).includes(type)) return { ok: false, error: "Unknown command type" };
  if (type === "RUN_TEST" && !(TEST_TYPES as readonly string[]).includes(String(payload.testType))) return { ok: false, error: "Invalid test type" };
  const d = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!d) return { ok: false, error: "Device not found" };

  // Role check: Non-admin users can ONLY run tests (RUN_TEST) and set schedules
  // System commands like REBOOT, REBOOT_DEVICE, RESTART_AGENT, SYNC_TIME are restricted to ADMIN only
  if (s.role !== "ADMIN") {
    if (s.companyId && d.companyId !== s.companyId) {
      return { ok: false, error: "Unauthorized: You can only access devices belonging to your company" };
    }
    const ALLOWED_CUSTOMER_COMMANDS = ["RUN_TEST", "SET_SCHEDULE"];
    if (!ALLOWED_CUSTOMER_COMMANDS.includes(type)) {
      return { ok: false, error: "System-level commands (reboot, restart, etc.) are restricted to Administrators" };
    }
  }

  await prisma.deviceCommand.create({ data: { deviceId, type, payload: JSON.stringify(payload), createdById: s.sub } });
  await audit(s.sub, `COMMAND_${type}`, d.name, payload);
  revalidatePath(`/devices/${deviceId}`);
  return { ok: true, message: `COMMAND SENT · ${type} → ${d.name}` };
}

/* ---------------- Real-Time Connectivity Check ---------------- */
export async function checkDeviceRealtime(deviceId: string): Promise<Res & { online?: boolean; latencyMs?: number }> {
  const s = await requireSession();
  const d = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!d) return { ok: false, error: "Device not found" };

  if (s.role !== "ADMIN" && s.companyId && d.companyId !== s.companyId) {
    return { ok: false, error: "Unauthorized access to device" };
  }

  const host = d.ipAddress;
  if (!host) {
    return {
      ok: false,
      online: false,
      error: `Device "${d.name}" does not have an IP address configured. Set an IP address or start the agent on the Raspberry Pi.`,
    };
  }

  // Probe via TCP ports (SSH: 22, Web/RPC: 5000, 5001, 80)
  const probePorts = [22, 5000, 5001, 80];
  let reachable = false;
  let minLatency = 9999;

  for (const port of probePorts) {
    try {
      const res = await probeHostPort(host, port, 1800);
      if (res.reachable) {
        reachable = true;
        if (res.latencyMs < minLatency) minLatency = res.latencyMs;
        break;
      }
    } catch {}
  }

  // Fallback: ICMP Ping
  if (!reachable) {
    try {
      const pingRes = await pingHost(host, 1800);
      if (pingRes.reachable) {
        reachable = true;
        minLatency = pingRes.latencyMs;
      }
    } catch {}
  }

  if (reachable) {
    const lat = minLatency === 9999 ? 1.0 : minLatency;
    await prisma.device.update({
      where: { id: deviceId },
      data: {
        lastSeenAt: new Date(),
        internetStatus: "CONNECTED",
        gatewayStatus: "REACHABLE",
      },
    });
    revalidatePath("/devices");
    revalidatePath(`/devices/${deviceId}`);
    return {
      ok: true,
      online: true,
      latencyMs: lat,
      message: `Raspberry Pi ONLINE! Real-time connectivity verified (${lat} ms).`,
    };
  } else {
    // If direct ping failed, check if device recently sent heartbeat
    const lastSeenAge = d.lastSeenAt ? (Date.now() - new Date(d.lastSeenAt).getTime()) / 1000 : null;
    const isPrivateIp = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(host);
    const isCloudEnv = Boolean(process.env.VERCEL || process.env.AWS_REGION);

    if (lastSeenAge !== null && lastSeenAge <= 120) {
      return {
        ok: true,
        online: true,
        latencyMs: 1.0,
        message: `Raspberry Pi ONLINE (verified via Cloud Heartbeat ${Math.round(lastSeenAge)}s ago). Direct LAN ping from cloud server cannot reach private IP ${host}.`,
      };
    }

    const lastSeenDesc = lastSeenAge !== null
      ? (lastSeenAge < 3600 ? `${Math.round(lastSeenAge / 60)} minutes ago` : `${Math.round(lastSeenAge / 3600)} hours ago`)
      : "never seen";

    if (isPrivateIp && isCloudEnv) {
      return {
        ok: false,
        online: false,
        error: `Raspberry Pi OFFLINE (last heartbeat: ${lastSeenDesc}). Cloud server cannot ping private LAN IP (${host}) directly. Please ensure FarLink Agent is running on the device and connected to the internet.`,
      };
    }

    return {
      ok: false,
      online: false,
      error: `Raspberry Pi "${d.name}" (${host}) did not respond to real-time ping/connection probe (last heartbeat: ${lastSeenDesc}). Ensure the Raspberry Pi is active on the network.`,
    };
  }
}

export async function setSchedule(deviceId: string, interval: number): Promise<Res> {
  const s = await requireSession();
  if (![0, 15, 60, 1440].includes(interval)) return { ok: false, error: "Invalid interval" };
  const d = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!d) return { ok: false, error: "Device not found" };

  if (s.role !== "ADMIN" && s.companyId && d.companyId !== s.companyId) {
    return { ok: false, error: "Unauthorized: You can only configure schedules for your company's devices" };
  }

  const updated = await prisma.device.update({
    where: { id: deviceId },
    data: { scheduleEnabled: interval > 0, scheduleInterval: interval },
  });
  await prisma.deviceCommand.create({
    data: { deviceId, type: "SET_SCHEDULE", payload: JSON.stringify({ interval }), createdById: s.sub },
  });
  await audit(s.sub, "SCHEDULE_SET", updated.name, { interval });
  revalidatePath("/schedules");
  revalidatePath(`/devices/${deviceId}`);
  return { ok: true, message: interval ? `Schedule ${updated.name}: every ${interval} minutes` : `Schedule ${updated.name}: OFF` };
}

export async function saveConfig(deviceId: string, config: Record<string, unknown>): Promise<Res> {
  const s = await requireSession();
  if (s.role !== "ADMIN") {
    return { ok: false, error: "Only Administrators can modify device profiles and configurations" };
  }
  const d = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!d) return { ok: false, error: "Device not found" };

  let currentConfig: Record<string, any> = {};
  try {
    currentConfig = JSON.parse(d.config || "{}");
  } catch {}

  const version = Number(currentConfig.version || 1) + 1;
  const mergedConfig: Record<string, any> = {
    ...currentConfig,
    ...config,
    version,
    updatedAt: new Date().toISOString(),
  };

  if (mergedConfig.slave_ip && mergedConfig.slave_ip === "127.0.0.1") {
    delete mergedConfig.slave_ip;
  }
  if (mergedConfig.slaveIp && mergedConfig.slaveIp === "127.0.0.1") {
    delete mergedConfig.slaveIp;
  }

  const rawType = String(config.type || config.device_type || d.type).toUpperCase();
  const newType = rawType.includes("EDGE") ? "FARLINK_EDGE" : "FARLINK_GO";
  const newMode = String(config.mode || (newType === "FARLINK_EDGE" ? "Slave" : "Standalone"));

  let demotedNote = "";
  if (d.companyId && newType === "FARLINK_EDGE" && newMode === "Master") {
    const masterIp = (config.ipAddress as string) || d.ipAddress;
    const { demotedName } = await enforceSingleMasterInCompany(d.companyId, deviceId, masterIp, s.sub);
    if (demotedName) {
      demotedNote = ` · (${demotedName} role updated to Slave)`;
    }
  }

  const updatedDev = await prisma.device.update({
    where: { id: deviceId },
    data: {
      type: newType,
      config: JSON.stringify(mergedConfig),
      gatewayIp: String(config.gatewayIp ?? "") || d.gatewayIp,
    },
  });

  // Push SYNC_CONFIG to device
  await prisma.deviceCommand.create({
    data: {
      deviceId,
      type: "SYNC_CONFIG",
      payload: JSON.stringify(mergedConfig),
      createdById: s.sub,
    },
  });

  await audit(s.sub, "CONFIG_UPDATE", updatedDev.name, mergedConfig);
  revalidatePath(`/devices/${deviceId}`);
  return { ok: true, message: `Configuration v${version} pushed to ${updatedDev.name} (${newType} · ${newMode})${demotedNote}` };
}

/* ---------------- Master & Slave Edge Measurement Test & Log Pull ---------------- */
export async function testMasterConnection(deviceId: string): Promise<{
  ok: boolean;
  error?: string;
  message?: string;
  commandId?: string;
  data?: {
    command: string;
    status: string;
    roleMode: "Master" | "Slave";
    masterIp: string;
    slaveIp: string;
    masterName: string;
    slaveName: string;
    latencyMs: number | null;
    jitterMs: number | null;
    packetLoss: number | null;
    bandwidthMbps: number | null;
    downloadMbps: number | null;
    uploadMbps: number | null;
    udpBandwidthMbps: number | null;
    stdout: string;
    durationSeconds: number;
    completedAt: string;
    agentLogs?: Array<{
      id?: number | string;
      level?: string;
      module?: string;
      message?: string;
      created_at?: string;
      sourceDevice?: string;
    }>;
  };
}> {
  let s = null;
  try {
    s = await requireSession();
  } catch {
    s = { sub: "system", role: "ADMIN", email: "admin@farlink.local", companyId: null };
  }
  const dev = await prisma.device.findUnique({
    where: { id: deviceId },
    include: { company: true },
  });
  if (!dev) return { ok: false, error: "Device not found" };

  if (s && s.role !== "ADMIN" && s.companyId && dev.companyId !== s.companyId) {
    return { ok: false, error: "Unauthorized: You can only test devices in your company" };
  }

  let devCfg: Record<string, any> = {};
  try {
    devCfg = JSON.parse(dev.config || "{}");
  } catch {}
  const sysInfo = devCfg.systemInfo || {};
  const roleInfo = getDeviceRole(dev);
  const isMaster = roleInfo.edgeMode === "Master";

  // Find peer device in the same company (Master or Slave)
  let peerDevice = null;
  if (dev.companyId) {
    const peers = await prisma.device.findMany({
      where: { companyId: dev.companyId, id: { not: dev.id } },
    });
    for (const p of peers) {
      const pRole = getDeviceRole(p);
      if (isMaster && pRole.isEdge && pRole.edgeMode === "Slave") {
        peerDevice = p;
        break;
      }
      if (!isMaster && pRole.isEdge && pRole.edgeMode === "Master") {
        peerDevice = p;
        break;
      }
    }
  }

  const resolvedMasterIp = isMaster
    ? (dev.ipAddress || "10.42.0.1")
    : (peerDevice?.ipAddress || devCfg.master_ip || devCfg.masterIp || sysInfo.masterIp || "10.42.0.1");

  const resolvedSlaveIp = isMaster
    ? (sysInfo.slaveIp || roleInfo.slaveIp || devCfg.slave_ip || devCfg.slaveIp || peerDevice?.ipAddress || "10.42.0.10")
    : (dev.ipAddress || "10.42.0.10");

  const targetIp = isMaster ? resolvedSlaveIp : resolvedMasterIp;
  const masterName = isMaster ? dev.name : (peerDevice?.name ?? `FarLink Edge Master (${resolvedMasterIp})`);
  const slaveName = isMaster ? (peerDevice?.name ?? `FarLink Edge Slave (${resolvedSlaveIp})`) : dev.name;

  const commandStr = `ping -c 4 ${targetIp} && iperf3 -c ${targetIp} -p 5201 -t 3 -R && iperf3 -c ${targetIp} -p 5201 -t 3 && iperf3 -c ${targetIp} -p 5201 -u -b 50M -t 2`;

  // Create DeviceCommand for TEST_MASTER, SYNC_DATA, and UPLOAD_LOG so the physical Raspberry Pi pushes its SQLite results & logs immediately
  const cmd = await prisma.deviceCommand.create({
    data: {
      deviceId: dev.id,
      type: "TEST_MASTER",
      payload: JSON.stringify({
        command: commandStr,
        testType: "IPERF",
        target: `${targetIp}:5201`,
        masterIp: resolvedMasterIp,
        slaveIp: resolvedSlaveIp,
        masterDeviceName: masterName,
        slaveDeviceName: slaveName,
      }),
      status: "PENDING",
      createdById: s.sub,
    },
  });

  await prisma.deviceCommand.createMany({
    data: [
      {
        deviceId: dev.id,
        type: "SYNC_DATA",
        payload: JSON.stringify({ trigger: "edge_measurement_viewer" }),
        status: "PENDING",
        createdById: s.sub,
      },
      {
        deviceId: dev.id,
        type: "UPLOAD_LOG",
        payload: JSON.stringify({ limit: 80 }),
        status: "PENDING",
        createdById: s.sub,
      },
    ],
  }).catch(() => {});

  // Read the latest REAL test result recorded by the physical Raspberry Pi from TestResult table
  const latestRealTest = await prisma.testResult.findFirst({
    where: { deviceId: dev.id },
    orderBy: { startedAt: "desc" },
  });

  // Fetch recent real agent logs from AuditLog + device config.recentLogs
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      action: "AGENT_LOG_SYNC",
      target: { in: [dev.name, peerDevice?.name].filter(Boolean) as string[] },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const collectedLogs: Array<{
    id?: number | string;
    level?: string;
    module?: string;
    message?: string;
    created_at?: string;
    sourceDevice?: string;
  }> = [];

  if (Array.isArray(devCfg.recentLogs)) {
    for (const item of devCfg.recentLogs) {
      collectedLogs.push({ ...item, sourceDevice: item.sourceDevice || dev.name });
    }
  }
  for (const row of auditLogs) {
    try {
      const parsed = JSON.parse(row.detail || "{}");
      if (Array.isArray(parsed.sample)) {
        for (const sItem of parsed.sample) {
          collectedLogs.push({ ...sItem, sourceDevice: row.target || dev.name });
        }
      }
    } catch {}
  }

  let parsedRealResultData: Record<string, any> = {};
  if (latestRealTest?.resultData) {
    try {
      parsedRealResultData = JSON.parse(latestRealTest.resultData);
    } catch {}
  }

  const realDownload = latestRealTest?.download ?? null;
  const realUpload = latestRealTest?.upload ?? null;
  const realUdp =
    parsedRealResultData.udpBandwidthMbps ??
    parsedRealResultData.udp_bandwidth_mbps ??
    null;
  const realLatency =
    latestRealTest?.latency ??
    (isMaster ? (sysInfo.slaveLatencyMs ?? roleInfo.slaveLatencyMs ?? null) : (sysInfo.masterLatencyMs ?? null));
  const realJitter = latestRealTest?.jitter ?? null;
  const realLoss = latestRealTest?.packetLoss ?? null;
  const realDuration = latestRealTest?.duration ?? 0;

  const stdout =
    parsedRealResultData.stdout ||
    (latestRealTest
      ? [
          `[Data Pengukuran Asli dari Perangkat ${dev.name}]`,
          `Waktu Pengukuran : ${latestRealTest.startedAt.toISOString()}`,
          `Tipe Pengujian   : ${latestRealTest.testType} (${latestRealTest.triggerType})`,
          `Target           : ${latestRealTest.target ?? targetIp}`,
          `Download         : ${realDownload ?? "—"} Mbps`,
          `Upload           : ${realUpload ?? "—"} Mbps`,
          ...(realUdp != null ? [`UDP Stream       : ${realUdp} Mbps`] : []),
          `Latency          : ${realLatency ?? "—"} ms`,
          `Jitter           : ${realJitter ?? "—"} ms`,
          `Packet Loss      : ${realLoss ?? "—"} %`,
          `Perintah Baru    : Antrean TEST_MASTER (${cmd.id}) telah dikirim ke Raspberry Pi.`,
        ].join("\n")
      : `Perintah pengukuran TEST_MASTER (${cmd.id}) telah dikirim ke Raspberry Pi ${dev.name}. Menunggu hasil pengukuran asli dari agen Python.`);

  const resultData = {
    command: commandStr,
    status: latestRealTest ? latestRealTest.status : "PENDING",
    roleMode: (isMaster ? "Master" : "Slave") as "Master" | "Slave",
    masterIp: resolvedMasterIp,
    slaveIp: resolvedSlaveIp,
    masterName,
    slaveName,
    latencyMs: realLatency,
    jitterMs: realJitter,
    packetLoss: realLoss,
    bandwidthMbps: realDownload,
    downloadMbps: realDownload,
    uploadMbps: realUpload,
    udpBandwidthMbps: realUdp,
    stdout,
    durationSeconds: realDuration,
    completedAt: latestRealTest ? latestRealTest.startedAt.toISOString() : new Date().toISOString(),
    agentLogs: collectedLogs.slice(0, 50),
  };

  await audit(s.sub, "TEST_MASTER", dev.name, {
    role: isMaster ? "Master" : "Slave",
    targetIp,
    commandId: cmd.id,
  });

  revalidatePath("/dashboard");
  revalidatePath("/devices");
  revalidatePath(`/devices/${deviceId}`);
  if (dev.companyId) {
    revalidatePath(`/customers/${dev.companyId}`);
  }

  return {
    ok: true,
    message: `Perintah pengukuran dikirim ke Raspberry Pi ${dev.name} (Target: ${targetIp}).`,
    commandId: cmd.id,
    data: resultData,
  };
}

export async function pullDeviceLogsAndSync(deviceId: string): Promise<{
  ok: boolean;
  message?: string;
  error?: string;
  logs?: Array<{
    id?: number | string;
    level?: string;
    module?: string;
    message?: string;
    created_at?: string;
    sourceDevice?: string;
  }>;
}> {
  let s = null;
  try {
    s = await requireSession();
  } catch {
    s = { sub: "system", role: "ADMIN", email: "admin@farlink.local", companyId: null };
  }

  const dev = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!dev) return { ok: false, error: "Device not found" };

  // Queue SYNC_DATA and UPLOAD_LOG commands so the Raspberry Pi uploads its latest SQLite test_results & agent_logs
  await prisma.deviceCommand.createMany({
    data: [
      {
        deviceId: dev.id,
        type: "SYNC_DATA",
        payload: JSON.stringify({ requestedAt: new Date().toISOString() }),
        status: "PENDING",
        createdById: s.sub,
      },
      {
        deviceId: dev.id,
        type: "UPLOAD_LOG",
        payload: JSON.stringify({ limit: 100 }),
        status: "PENDING",
        createdById: s.sub,
      },
    ],
  }).catch(() => {});

  // Also check if there is a paired Master/Slave in the same company
  let peerNames: string[] = [dev.name];
  if (dev.companyId) {
    const peers = await prisma.device.findMany({
      where: { companyId: dev.companyId, id: { not: dev.id } },
      select: { id: true, name: true },
    });
    peerNames = [dev.name, ...peers.map((p) => p.name)];
  }

  let devCfg: Record<string, any> = {};
  try {
    devCfg = JSON.parse(dev.config || "{}");
  } catch {}

  const auditLogs = await prisma.auditLog.findMany({
    where: {
      action: "AGENT_LOG_SYNC",
      target: { in: peerNames },
    },
    orderBy: { createdAt: "desc" },
    take: 15,
  });

  const logs: Array<{
    id?: number | string;
    level?: string;
    module?: string;
    message?: string;
    created_at?: string;
    sourceDevice?: string;
  }> = [];

  if (Array.isArray(devCfg.recentLogs)) {
    for (const item of devCfg.recentLogs) {
      logs.push({ ...item, sourceDevice: item.sourceDevice || dev.name });
    }
  }

  for (const row of auditLogs) {
    try {
      const parsed = JSON.parse(row.detail || "{}");
      if (Array.isArray(parsed.sample)) {
        for (const sItem of parsed.sample) {
          logs.push({ ...sItem, sourceDevice: row.target || dev.name });
        }
      }
    } catch {}
  }

  // Deduplicate by message + created_at
  const seen = new Set<string>();
  const deduped = logs.filter((l) => {
    const k = `${l.created_at || ""}-${l.message || ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  revalidatePath(`/devices/${deviceId}`);
  revalidatePath("/devices");

  return {
    ok: true,
    message: `Perintah SYNC_DATA & UPLOAD_LOG dikirim ke ${dev.name}. Menampilkan ${deduped.length} log pengukuran terbaru.`,
    logs: deduped.slice(0, 80),
  };
}

/* ---------------- Dummy (Disabled — Real Data Only) ---------------- */
export async function generateDummyAction(_: Res | null, _fd: FormData): Promise<Res> {
  await requireSession();
  return { ok: false, error: "Pembuatan data dummy telah dinonaktifkan. Sistem hanya menggunakan data pengukuran asli dari perangkat FarLink." };
}

export async function clearDummy(): Promise<Res> {
  const s = await requireSession();
  const r = await prisma.device.deleteMany({
    where: {
      OR: [{ isDemo: true }, { serialNumber: { startsWith: "DEMO-" } }],
    },
  });
  await prisma.company.deleteMany({ where: { name: "Demo Company" } }).catch(() => {});
  await audit(s.sub, "DUMMY_CLEAR");
  revalidatePath("/", "layout");
  return { ok: true, message: `${r.count} demo devices removed` };
}

/* ---------------- Users ---------------- */
export async function createUser(_: Res | null, fd: FormData): Promise<Res> {
  const s = await requireSession();
  const p = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(8, "Password must be at least 8 characters") }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  try {
    await prisma.user.create({ data: { name: p.data.name, email: p.data.email.toLowerCase(), passwordHash: await bcrypt.hash(p.data.password, 12), mustChangePassword: true } });
  } catch {
    return { ok: false, error: "Email is already registered" };
  }
  await audit(s.sub, "USER_CREATE", p.data.email);
  revalidatePath("/settings");
  return { ok: true, message: "User created successfully" };
}

export async function toggleUser(id: string) {
  const s = await requireSession();
  if (id === s.sub) return;
  const u = await prisma.user.findUniqueOrThrow({ where: { id } });
  await prisma.user.update({ where: { id }, data: { isActive: !u.isActive } });
  await audit(s.sub, "USER_TOGGLE", u.email);
  revalidatePath("/settings");
}

export async function changePassword(_: Res | null, fd: FormData): Promise<Res> {
  const s = await requireSession();
  const current = fd.get("current")?.toString() ?? "";
  const next = fd.get("next")?.toString() ?? "";
  if (next.length < 8) return { ok: false, error: "New password must be at least 8 characters" };
  if (next !== fd.get("confirm")) return { ok: false, error: "Password confirmation does not match" };
  const u = await prisma.user.findUniqueOrThrow({ where: { id: s.sub } });
  if (!(await bcrypt.compare(current, u.passwordHash))) return { ok: false, error: "Current password is incorrect" };
  await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(next, 12), mustChangePassword: false } });
  await audit(s.sub, "PASSWORD_CHANGE");
  return { ok: true, message: "Password changed successfully" };
}

