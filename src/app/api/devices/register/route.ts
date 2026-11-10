import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/token";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const serialNumber = (
      body.serial_number ||
      body.serialNumber ||
      body.claim_code ||
      body.device_uuid ||
      ""
    ).trim();
    const macAddress = body.mac_address || body.macAddress;
    const ipAddress = (
      body.ip_address ||
      body.ipAddress ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      ""
    ).trim();
    const agentVersion = body.agent_version || body.agentVersion || "1.0.0";
    const rawType = String(body.type || "FarLink Go").toUpperCase();
    const devType = rawType.includes("EDGE") ? "FARLINK_EDGE" : "FARLINK_GO";

    if (!serialNumber && !macAddress) {
      return NextResponse.json({ error: "Missing serial_number or mac_address" }, { status: 400 });
    }

    const sn = serialNumber || `RPI-${(macAddress || "").replace(/:/g, "").toUpperCase()}`;

    // 1. Look for registered device in Device table
    let dev = await prisma.device.findFirst({
      where: {
        OR: [
          { serialNumber: sn },
          macAddress ? { macAddress } : {},
        ].filter((c) => Object.keys(c).length > 0),
      },
    });

    if (dev) {
      // Device is already registered by Admin!
      const token = "flk_" + crypto.randomBytes(24).toString("hex");
      dev = await prisma.device.update({
        where: { id: dev.id },
        data: {
          macAddress: macAddress || dev.macAddress,
          ipAddress: ipAddress || dev.ipAddress,
          agentVersion: agentVersion || dev.agentVersion,
          type: devType,
          lastSeenAt: new Date(),
          tokenHash: hashToken(token),
        },
      });

      // Update DiscoveredDevice status if exists
      await prisma.discoveredDevice.upsert({
        where: { serialNumber: dev.serialNumber },
        update: { isRegistered: true, lastSeenAt: new Date(), ipAddress, macAddress },
        create: { serialNumber: dev.serialNumber, isRegistered: true, lastSeenAt: new Date(), ipAddress, macAddress, deviceType: devType },
      }).catch(() => {});

      return NextResponse.json({
        ok: true,
        registered: true,
        status: "ACTIVE",
        token,
        deviceId: dev.id,
        name: dev.name,
        serialNumber: dev.serialNumber,
      });
    }

    // 2. Device is connected but NOT yet registered.
    // Record into DiscoveredDevice table awaiting admin registration!
    const discovered = await prisma.discoveredDevice.upsert({
      where: { serialNumber: sn },
      update: {
        lastSeenAt: new Date(),
        ipAddress: ipAddress || undefined,
        macAddress: macAddress || undefined,
        deviceType: devType,
        agentVersion,
        isRegistered: false,
      },
      create: {
        serialNumber: sn,
        macAddress,
        ipAddress,
        deviceType: devType,
        agentVersion,
        isRegistered: false,
      },
    });

    return NextResponse.json({
      ok: true,
      registered: false,
      status: "PENDING_REGISTRATION",
      serialNumber: discovered.serialNumber,
      message: "Device detected. Awaiting admin registration in dashboard.",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Registration failed" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const registeredSns = (await prisma.device.findMany({ select: { serialNumber: true } })).map((d) => d.serialNumber);
    const discovered = await prisma.discoveredDevice.findMany({
      where: {
        isRegistered: false,
        serialNumber: { notIn: registeredSns },
      },
      orderBy: { lastSeenAt: "desc" },
    });
    return NextResponse.json({ ok: true, discovered });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Query failed" }, { status: 500 });
  }
}

