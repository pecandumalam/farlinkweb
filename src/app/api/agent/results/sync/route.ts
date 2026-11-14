import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withDevice } from "@/lib/agent";
import { getDeviceRole } from "@/lib/device-utils";

function normalizeTestType(raw: string = "SPEED"): string {
  const up = raw.toUpperCase().trim();
  if (up.includes("EDGE_DUAL") || up.includes("IPERF")) return "IPERF";
  if (up.includes("SPEED")) return "SPEED";
  if (up.includes("MTR")) return "MTR";
  if (up.includes("DIG") || up.includes("DNS")) return "DIG";
  if (up.includes("CURL") || up.includes("HTTP")) return "CURL";
  if (up.includes("TCP") || up.includes("PORT")) return "TCP_PORT";
  return "SPEED";
}

function normalizeTriggerType(raw: string = "SCHEDULED"): string {
  const up = raw.toUpperCase().trim();
  if (up.includes("BUTTON") || up.includes("MANUAL")) return "MANUAL";
  if (up.includes("REMOTE")) return "REMOTE";
  return "SCHEDULED";
}

/** POST /api/agent/results/sync — menerima test result dari farlink_agent sync_manager */
export async function POST(req: Request) {
  return withDevice(req, async (d) => {
    const body = await req.json().catch(() => ({}));
    const items = Array.isArray(body) ? body : [body];
    const created: string[] = [];

    const roleInfo = getDeviceRole(d);
    let slaveMasterIp: string | null = null;
    let masterSlaveTarget: string | null = null;

    let dCfg: Record<string, any> = {};
    try {
      dCfg = JSON.parse(d.config || "{}");
    } catch {}

    if (roleInfo.edgeMode === "Slave") {
      const masterDev = await prisma.device.findFirst({
        where: {
          id: { not: d.id },
          ...(d.companyId ? { companyId: d.companyId } : {}),
          OR: [
            { config: { contains: '"mode":"Master"' } },
            { config: { contains: '"mode": "Master"' } },
            { name: { contains: "Master" } },
          ],
        },
        select: { ipAddress: true },
        orderBy: { createdAt: "asc" },
      });
      slaveMasterIp = masterDev?.ipAddress || dCfg.master_ip || dCfg.masterIp || dCfg.systemInfo?.masterIp || "192.168.2.38";
    } else if (roleInfo.edgeMode === "Master") {
      const sys = dCfg.systemInfo || {};
      const sIp = sys.slaveIp;
      const sHost = sys.slaveHostname;
      if (sIp) {
        masterSlaveTarget = sHost ? `${sIp} (${sHost})` : sIp;
      }
    }

    for (const it of items) {
      const rawTestType = it.test_type || it.testType || "SPEED";
      const testType = normalizeTestType(rawTestType);
      const triggerType = normalizeTriggerType(it.trigger_type || it.triggerType || "SCHEDULED");
      const rawStatus = String(it.status || "SUCCESS").toUpperCase();
      const status = rawStatus === "SUCCESS" || rawStatus === "OK" ? "SUCCESS" : "FAILED";

      const download = it.download_mbps != null ? Number(it.download_mbps) : (it.download != null ? Number(it.download) : null);
      const upload = it.upload_mbps != null ? Number(it.upload_mbps) : (it.upload != null ? Number(it.upload) : null);
      const latency = it.latency_ms != null ? Number(it.latency_ms) : (it.latency != null ? Number(it.latency) : null);
      const jitter = it.jitter_ms != null ? Number(it.jitter_ms) : (it.jitter != null ? Number(it.jitter) : null);
      const packetLoss = it.packet_loss != null ? Number(it.packet_loss) : (it.packetLoss != null ? Number(it.packetLoss) : null);

      let target = it.target || it.server_ip || it.target_host;
      if (!target || target === "speedtest.net" || target === "Speedtest Server") {
        if (roleInfo.edgeMode === "Master") {
          target = masterSlaveTarget || "FarLink Slave";
        } else if (slaveMasterIp) {
          target = slaveMasterIp;
        } else {
          target = testType === "IPERF" ? "Edge Peer Node" : "Speedtest Server";
        }
      }
      const errorMessage = it.error_message || it.errorMessage || null;

      const startedAt = it.started_at ? new Date(it.started_at) : (it.startedAt ? new Date(it.startedAt) : new Date());
      const completedAt = it.finished_at ? new Date(it.finished_at) : (it.completed_at ? new Date(it.completed_at) : (it.completedAt ? new Date(it.completedAt) : new Date()));
      const duration = completedAt ? (completedAt.getTime() - startedAt.getTime()) / 1000 : null;

      let resultData = it.result_json || it.resultData || it.diagnostics || {};
      if (typeof resultData === "string") {
        try {
          resultData = JSON.parse(resultData);
        } catch {}
      }

      const r = await prisma.testResult.create({
        data: {
          deviceId: d.id,
          testType,
          triggerType,
          status,
          target,
          download: isNaN(download as number) ? null : download,
          upload: isNaN(upload as number) ? null : upload,
          latency: isNaN(latency as number) ? null : latency,
          jitter: isNaN(jitter as number) ? null : jitter,
          packetLoss: isNaN(packetLoss as number) ? null : packetLoss,
          resultData: JSON.stringify(resultData),
          errorMessage,
          startedAt,
          completedAt,
          duration: duration && duration >= 0 ? duration : null,
        },
      });

      // Update schedule timestamp if scheduled
      if (d.scheduleEnabled && triggerType === "SCHEDULED") {
        await prisma.device.update({ where: { id: d.id }, data: { lastScheduledAt: startedAt } });
      }

      // If there was a pending RUN_TEST command, mark it SUCCESS
      const pendingCmd = await prisma.deviceCommand.findFirst({
        where: { deviceId: d.id, type: "RUN_TEST", status: { in: ["SENT", "RUNNING"] } },
        orderBy: { createdAt: "desc" },
      });
      if (pendingCmd) {
        await prisma.deviceCommand.update({
          where: { id: pendingCmd.id },
          data: { status, completedAt: new Date(), result: JSON.stringify({ testResultId: r.id }) },
        });
      }

      created.push(r.id);
    }

    return NextResponse.json({ ok: true, count: created.length, ids: created }, { status: 201 });
  });
}
