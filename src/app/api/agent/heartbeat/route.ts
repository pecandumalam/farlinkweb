import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withDevice } from "@/lib/agent";

/** POST /api/agent/heartbeat — menerima status & telemetri dari farlink_agent */
export async function POST(req: Request) {
  return withDevice(req, async (d) => {
    const b = await req.json().catch(() => ({}));

    const ipAddress = b.ip_address || b.ipAddress || d.ipAddress;
    const macAddress = b.mac_address || b.macAddress || d.macAddress;
    const agentVersion = b.agent_version || b.agentVersion || d.agentVersion;
    const gatewayIp = b.gateway_ip || b.gatewayIp || d.gatewayIp;

    let gatewayStatus: string | undefined = b.gatewayStatus;
    if (b.gateway_reachable !== undefined) {
      gatewayStatus = b.gateway_reachable ? "REACHABLE" : "UNREACHABLE";
    }

    let internetStatus: string | undefined = b.internetStatus;
    if (b.connection_status) {
      internetStatus = b.connection_status === "ONLINE" ? "CONNECTED" : "DISCONNECTED";
    }

    const gatewayLatency = b.gateway_latency !== undefined ? Number(b.gateway_latency) : (b.gatewayLatency !== undefined ? Number(b.gatewayLatency) : d.gatewayLatency);

    // Merge system telemetry into device config JSON
    let currentConfig: Record<string, any> = {};
    try {
      currentConfig = JSON.parse(d.config || "{}");
    } catch {
      currentConfig = {};
    }

    const telemetry = {
      cpuUsage: b.cpu_usage ?? b.cpuUsage,
      ramUsage: b.ram_usage ?? b.ramUsage,
      diskUsage: b.disk_usage ?? b.diskUsage,
      temperature: b.temperature,
      uptime: b.uptime,
      osVersion: b.os_version ?? b.osVersion,
      serviceStatus: b.service_status ?? b.serviceStatus ?? "RUNNING",
      masterIp: b.master_ip ?? b.masterIp,
      masterConnected: b.master_connected ?? b.masterConnected,
      masterLatencyMs: b.master_latency_ms ?? b.masterLatencyMs,
      slaveIp: (() => {
        const raw = b.slave_ip ?? b.slaveIp ?? currentConfig?.systemInfo?.slaveIp;
        if (typeof raw === "string" && (raw.startsWith("192.168.99.") || raw === "127.0.0.1")) {
          return null;
        }
        return raw ?? null;
      })(),
      slaveConnected: Boolean(b.slave_connected ?? b.slaveConnected ?? false),
      slaveLatencyMs: (b.slave_connected || b.slaveConnected) ? (b.slave_latency_ms ?? b.slaveLatencyMs ?? null) : null,
      lastTestAt: b.last_test_at ?? b.lastTestAt,
      lastTelemetryAt: new Date().toISOString(),
    };

    const updatedConfig = JSON.stringify({
      ...currentConfig,
      systemInfo: telemetry,
    });

    await prisma.device.update({
      where: { id: d.id },
      data: {
        ipAddress,
        macAddress,
        agentVersion,
        gatewayIp,
        gatewayStatus: gatewayStatus || d.gatewayStatus,
        gatewayLatency: isNaN(gatewayLatency as number) ? null : gatewayLatency,
        gatewayCheckedAt: gatewayStatus ? new Date() : d.gatewayCheckedAt,
        internetStatus: internetStatus || d.internetStatus,
        config: updatedConfig,
        lastSeenAt: new Date(),
      },
    });

    const pending = await prisma.deviceCommand.count({
      where: { deviceId: d.id, status: "PENDING" },
    });

    return NextResponse.json({
      ok: true,
      serverTime: new Date().toISOString(),
      pendingCommands: pending,
    });
  });
}
