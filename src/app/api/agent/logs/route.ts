import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withDevice } from "@/lib/agent";

/** POST /api/agent/logs — menerima log SQLite agent dari farlink_agent */
export async function POST(req: Request) {
  return withDevice(req, async (d) => {
    const body = await req.json().catch(() => ({}));
    const logs = Array.isArray(body.logs) ? body.logs : [];
    const count = logs.length;

    if (count > 0) {
      await prisma.auditLog.create({
        data: {
          action: "AGENT_LOG_SYNC",
          target: d.name,
          detail: JSON.stringify({
            source: body.source || "sqlite_agent_logs",
            count,
            sample: logs.slice(0, 50),
          }),
        },
      });

      // Also persist the latest measurement/agent logs into device config.recentLogs for fast UI display
      try {
        const currentConfig = JSON.parse(d.config || "{}") as Record<string, any>;
        const prevLogs = Array.isArray(currentConfig.recentLogs) ? currentConfig.recentLogs : [];
        const combined = [...logs, ...prevLogs];
        const seenIds = new Set<string>();
        const deduped = [];
        for (const item of combined) {
          const key = `${item.id ?? ""}-${item.created_at ?? ""}-${item.message ?? ""}`;
          if (!seenIds.has(key)) {
            seenIds.add(key);
            deduped.push(item);
          }
          if (deduped.length >= 60) break;
        }
        await prisma.device.update({
          where: { id: d.id },
          data: {
            config: JSON.stringify({
              ...currentConfig,
              recentLogs: deduped,
              lastLogSyncAt: new Date().toISOString(),
            }),
          },
        });
      } catch {
        // Non-fatal
      }
    }

    return NextResponse.json({ ok: true, received: count });
  });
}
