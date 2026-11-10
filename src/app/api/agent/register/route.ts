import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { hashToken, authDevice } from "@/lib/token";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const d = await authDevice(req);

    if (d) {
      const dev = await prisma.device.update({
        where: { id: d.id },
        data: {
          ipAddress: body.ip_address || body.ipAddress || d.ipAddress,
          macAddress: body.mac_address || body.macAddress || d.macAddress,
          firmwareVersion: body.firmware_version || body.firmwareVersion || d.firmwareVersion,
          agentVersion: body.agent_version || body.agentVersion || d.agentVersion,
          lastSeenAt: new Date(),
        },
      });
      return NextResponse.json({ ok: true, deviceId: dev.id, name: dev.name, status: "ACTIVE" });
    }

    // Fallback to unauthenticated registration
    const deviceUuid = body.device_uuid || body.deviceId || body.serialNumber || body.claim_code;
    const claimCode = body.claim_code;
    const macAddress = body.mac_address || body.macAddress;
    const agentVersion = body.agent_version || body.agentVersion || "1.0.0";
    const rawType = String(body.type || "FarLink Go").toUpperCase();
    const devType = rawType.includes("EDGE") ? "FARLINK_EDGE" : "FARLINK_GO";

    let dev = await prisma.device.findFirst({
      where: {
        OR: [
          deviceUuid ? { serialNumber: deviceUuid } : {},
          claimCode ? { serialNumber: claimCode } : {},
          macAddress ? { macAddress: macAddress } : {},
        ].filter((c) => Object.keys(c).length > 0),
      },
    });

    const plainToken = "flk_" + crypto.randomBytes(24).toString("hex");

    if (dev) {
      dev = await prisma.device.update({
        where: { id: dev.id },
        data: {
          macAddress: macAddress || dev.macAddress,
          agentVersion: agentVersion || dev.agentVersion,
          type: devType,
          lastSeenAt: new Date(),
          tokenHash: hashToken(plainToken),
        },
      });
    } else {
      const sn = claimCode || deviceUuid || `FL-${Date.now().toString(36).toUpperCase()}`;
      const name = `${rawType.includes("EDGE") ? "FarLink Edge" : "FarLink Go"} (${claimCode || sn.slice(-8)})`;
      dev = await prisma.device.create({
        data: {
          name,
          serialNumber: sn,
          type: devType,
          macAddress,
          agentVersion,
          tokenHash: hashToken(plainToken),
          lastSeenAt: new Date(),
        },
      });
    }

    return NextResponse.json({
      ok: true,
      status: "ACTIVE",
      token: plainToken,
      deviceId: dev.id,
      name: dev.name,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Registration failed" }, { status: 500 });
  }
}
