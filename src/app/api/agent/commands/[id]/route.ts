import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withDevice } from "@/lib/agent";

/** POST /api/agent/commands/{id} — update status command */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withDevice(req, async (d) => {
    const body = await req.json().catch(() => ({}));
    const rawStatus = String(body.status || "SUCCESS").toUpperCase();
    const status = ["SUCCESS", "FAILED", "RUNNING"].includes(rawStatus) ? rawStatus : "SUCCESS";
    const errorMessage = body.error_message || body.errorMessage || null;
    const result = body.result !== undefined ? JSON.stringify(body.result) : null;

    const cmd = await prisma.deviceCommand.findFirst({
      where: { id, deviceId: d.id },
    });

    if (!cmd) {
      return NextResponse.json({ error: "Command not found" }, { status: 404 });
    }

    await prisma.deviceCommand.update({
      where: { id },
      data: {
        status,
        result: result ?? cmd.result,
        errorMessage: errorMessage ?? cmd.errorMessage,
        completedAt: status === "RUNNING" ? undefined : new Date(),
      },
    });

    return NextResponse.json({ ok: true, status });
  });
}
