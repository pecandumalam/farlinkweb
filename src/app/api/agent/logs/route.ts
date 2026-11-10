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
            sample: logs.slice(0, 5),
          }),
        },
      });
    }

    return NextResponse.json({ ok: true, received: count });
  });
}
