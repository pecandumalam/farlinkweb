import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withDevice } from "@/lib/agent";

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

/** POST /api/agent/test-results — menerima test result dari device atau dashboard */
export async function POST(req: Request) {
  return withDevice(req, async (d) => {
    const body = await req.json().catch(() => ({}));
    const items = Array.isArray(body) ? body : [body];
    const created: string[] = [];

    for (const it of items) {
      const testType = normalizeTestType(it.test_type || it.testType || "SPEED");
      const triggerType = normalizeTriggerType(it.trigger_type || it.triggerType || "SCHEDULED");
      const rawStatus = String(it.status || "SUCCESS").toUpperCase();
      const status = rawStatus === "SUCCESS" || rawStatus === "OK" ? "SUCCESS" : "FAILED";

      const download = it.download_mbps != null ? Number(it.download_mbps) : (it.download != null ? Number(it.download) : null);
      const upload = it.upload_mbps != null ? Number(it.upload_mbps) : (it.upload != null ? Number(it.upload) : null);
      const latency = it.latency_ms != null ? Number(it.latency_ms) : (it.latency != null ? Number(it.latency) : null);
      const jitter = it.jitter_ms != null ? Number(it.jitter_ms) : (it.jitter != null ? Number(it.jitter) : null);
      const packetLoss = it.packet_loss != null ? Number(it.packet_loss) : (it.packetLoss != null ? Number(it.packetLoss) : null);

      const target = it.target || it.server_ip || it.target_host || (testType === "IPERF" ? (it.master_connection?.target || "Edge Slave Node") : (testType === "SPEED" ? "Speedtest Server" : null));
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

      if (d.scheduleEnabled && triggerType === "SCHEDULED") {
        await prisma.device.update({ where: { id: d.id }, data: { lastScheduledAt: startedAt } });
      }

      if (it.commandId) {
        await prisma.deviceCommand.updateMany({
          where: { id: it.commandId, deviceId: d.id },
          data: { status, completedAt: new Date(), errorMessage, result: JSON.stringify({ testResultId: r.id }) },
        });
      }

      created.push(r.id);
    }

    return NextResponse.json({ ok: true, count: created.length, ids: created }, { status: 201 });
  });
}
