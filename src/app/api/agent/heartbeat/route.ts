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

    const lastResultRaw = b.last_test_result ?? b.lastTestResult ?? currentConfig?.systemInfo?.lastTestResult ?? null;

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
        if (typeof raw === "string" && raw === "127.0.0.1") {
          return null;
        }
        return raw ?? null;
      })(),
      slaveConnected: Boolean(b.slave_connected ?? b.slaveConnected ?? false),
      slaveLatencyMs: (b.slave_connected || b.slaveConnected) ? (b.slave_latency_ms ?? b.slaveLatencyMs ?? null) : null,
      slaveHostname: b.slave_hostname ?? b.slaveHostname ?? currentConfig?.systemInfo?.slaveHostname ?? null,
      lastTestAt: b.last_test_at ?? b.lastTestAt,
      lastTestResult: lastResultRaw,
      lastTelemetryAt: new Date().toISOString(),
    };

    const reportedType = b.device_type ?? b.deviceType;
    const reportedMode = b.device_mode ?? b.deviceMode;

    const updatedConfigObj: Record<string, any> = {
      ...currentConfig,
      systemInfo: telemetry,
    };
    if (reportedType) updatedConfigObj.type = reportedType;
    if (reportedMode) updatedConfigObj.mode = reportedMode;

    const updatedConfig = JSON.stringify(updatedConfigObj);
    const updatedDeviceType =
      reportedType === "FarLink Edge" || reportedMode === "Master" || reportedMode === "Slave"
        ? "FARLINK_EDGE"
        : d.type;

    await prisma.device.update({
      where: { id: d.id },
      data: {
        type: updatedDeviceType,
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

    // Auto-record latest test result from heartbeat if not yet in TestResult table
    if (lastResultRaw && typeof lastResultRaw === "object") {
      try {
        const dl = lastResultRaw.download_mbps ?? lastResultRaw.download ?? null;
        const ul = lastResultRaw.upload_mbps ?? lastResultRaw.upload ?? null;
        const lat = lastResultRaw.latency_ms ?? lastResultRaw.latency ?? null;
        const jit = lastResultRaw.jitter_ms ?? lastResultRaw.jitter ?? null;
        const loss = lastResultRaw.packet_loss ?? lastResultRaw.packetLoss ?? null;
        const startedStr = lastResultRaw.started_at ?? lastResultRaw.startedAt;
        const finishedStr = lastResultRaw.finished_at ?? lastResultRaw.completedAt ?? b.last_test_at;
        const startedAt = startedStr ? new Date(startedStr) : new Date();
        const completedAt = finishedStr ? new Date(finishedStr) : new Date();

        if ((dl !== null || lat !== null) && !isNaN(startedAt.getTime())) {
          const minWindow = new Date(startedAt.getTime() - 5000);
          const maxWindow = new Date(startedAt.getTime() + 5000);
          const existing = await prisma.testResult.findFirst({
            where: {
              deviceId: d.id,
              startedAt: { gte: minWindow, lte: maxWindow },
            },
            select: { id: true },
          });

          if (!existing) {
            const rawType = String(lastResultRaw.test_type || lastResultRaw.testType || "SPEED").toUpperCase();
            const testType = rawType === "SPEEDTEST" ? "SPEED" : rawType === "EDGE_DUAL" ? "IPERF" : rawType;
            const rawTrigger = String(lastResultRaw.trigger_type || lastResultRaw.triggerType || "SCHEDULED").toUpperCase();
            const triggerType = ["SCHEDULED", "MANUAL", "REMOTE", "BUTTON"].includes(rawTrigger) ? rawTrigger : "SCHEDULED";
            const rawStatus = String(lastResultRaw.status || "SUCCESS").toUpperCase();
            const status = rawStatus === "SUCCESS" ? "SUCCESS" : "FAILED";
            const isMaster =
              currentConfig?.mode === "Master" ||
              reportedMode === "Master" ||
              d.name?.toLowerCase().includes("master");
            const slaveTarget = telemetry.slaveIp
              ? (telemetry.slaveHostname ? `${telemetry.slaveIp} (${telemetry.slaveHostname})` : telemetry.slaveIp)
              : null;
            const target =
              lastResultRaw.target ||
              lastResultRaw.master_connection?.target ||
              (isMaster ? (slaveTarget || "FarLink Slave") : null) ||
              telemetry.slaveIp ||
              telemetry.masterIp ||
              (testType === "IPERF" ? "Edge Peer Node" : "Speedtest Server");

            await prisma.testResult.create({
              data: {
                deviceId: d.id,
                testType,
                triggerType,
                status,
                target: String(target),
                download: dl !== null ? Number(dl) : null,
                upload: ul !== null ? Number(ul) : null,
                latency: lat !== null ? Number(lat) : null,
                jitter: jit !== null ? Number(jit) : null,
                packetLoss: loss !== null ? Number(loss) : null,
                duration: lastResultRaw.duration_seconds ? Number(lastResultRaw.duration_seconds) : 5,
                startedAt,
                completedAt: isNaN(completedAt.getTime()) ? new Date() : completedAt,
                resultData:
                  typeof lastResultRaw.result_json === "string"
                    ? lastResultRaw.result_json
                    : JSON.stringify(lastResultRaw.resultData || lastResultRaw),
              },
            });
          }
        }
      } catch {
        // Non-fatal fallback
      }
    }

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
