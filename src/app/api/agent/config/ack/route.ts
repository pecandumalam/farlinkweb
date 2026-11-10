import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withDevice } from "@/lib/agent";

/** POST /api/agent/config/ack — konfirmasi penerapan config dari agent */
export async function POST(req: Request) {
  return withDevice(req, async (d) => {
    const body = await req.json().catch(() => ({}));
    const version = body.version;

    let current: Record<string, any> = {};
    try {
      current = JSON.parse(d.config || "{}");
    } catch {}

    const updated = JSON.stringify({
      ...current,
      activeVersion: version,
      syncedAt: new Date().toISOString(),
    });

    await prisma.device.update({
      where: { id: d.id },
      data: { config: updated, lastSeenAt: new Date() },
    });

    return NextResponse.json({ ok: true, version });
  });
}
