import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withDevice } from "@/lib/agent";

/** GET /api/agent/commands — ambil command PENDING untuk device */
export async function GET(req: Request) {
  return withDevice(req, async (d) => {
    // Timeout command yang SENT/RUNNING > 10 menit
    await prisma.deviceCommand.updateMany({
      where: {
        deviceId: d.id,
        status: { in: ["SENT", "RUNNING"] },
        sentAt: { lt: new Date(Date.now() - 10 * 60_000) },
      },
      data: { status: "TIMEOUT", completedAt: new Date() },
    });

    const cmds = await prisma.deviceCommand.findMany({
      where: { deviceId: d.id, status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 10,
    });

    if (cmds.length) {
      await prisma.deviceCommand.updateMany({
        where: { id: { in: cmds.map((c) => c.id) } },
        data: { status: "SENT", sentAt: new Date() },
      });
    }

    const formatted = cmds.map((c) => {
      let parsedPayload: Record<string, any> = {};
      try {
        parsedPayload = JSON.parse(c.payload || "{}");
      } catch {
        parsedPayload = {};
      }

      // Map web command types to farlink_agent command handler names
      let agentCommandName = c.type;
      if (c.type === "REBOOT") agentCommandName = "REBOOT_DEVICE";
      else if (c.type === "GET_LOGS") agentCommandName = "UPLOAD_LOG";
      else if (c.type === "UPDATE_CONFIG") agentCommandName = "SYNC_CONFIG";

      return {
        id: c.id,
        command: agentCommandName,
        type: c.type,
        payload: parsedPayload,
        payload_json: c.payload,
        createdAt: c.createdAt,
      };
    });

    // farlink_agent checks isinstance(commands, list), so return array directly
    return NextResponse.json(formatted);
  });
}
