import crypto from "crypto";
import { prisma } from "./db";

export function hashToken(t: string) {
  return crypto.createHash("sha256").update(t).digest("hex");
}

/** Autentikasi device dari Bearer token, X-Device-UUID header, atau URL params */
export async function authDevice(req: Request) {
  const h = req.headers.get("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  const deviceUuid = req.headers.get("x-device-uuid")?.trim();
  const deviceSerial = req.headers.get("x-device-serial")?.trim();
  const deviceMac = req.headers.get("x-device-mac")?.trim();

  if (token) {
    const hashed = hashToken(token);
    const d = await prisma.device.findFirst({
      where: {
        OR: [
          { tokenHash: hashed },
          { tokenHash: token },
        ],
      },
    });
    if (d) return d;
  }

  if (deviceUuid || deviceSerial || deviceMac) {
    const conds = [
      deviceSerial ? { serialNumber: deviceSerial } : null,
      deviceUuid ? { serialNumber: deviceUuid } : null,
      deviceUuid ? { id: deviceUuid } : null,
      deviceUuid ? { name: { contains: deviceUuid } } : null,
      deviceUuid ? { config: { contains: deviceUuid } } : null,
      deviceMac ? { macAddress: deviceMac } : null,
    ].filter(Boolean) as any[];

    if (conds.length > 0) {
      const d = await prisma.device.findFirst({
        where: { OR: conds },
      });
      if (d) return d;
    }
  }

  try {
    const url = new URL(req.url);
    const qUuid = url.searchParams.get("device_uuid");
    const qSerial = url.searchParams.get("serial_number");
    const qToken = url.searchParams.get("token");
    if (qToken) {
      const d = await prisma.device.findFirst({ where: { tokenHash: hashToken(qToken) } });
      if (d) return d;
    }
    if (qUuid || qSerial) {
      const d = await prisma.device.findFirst({
        where: {
          OR: [
            qSerial ? { serialNumber: qSerial } : {},
            qUuid ? { serialNumber: qUuid } : {},
            qUuid ? { id: qUuid } : {},
            qUuid ? { name: { contains: qUuid } } : {},
            qUuid ? { config: { contains: qUuid } } : {},
          ].filter((c) => Object.keys(c).length > 0),
        },
      });
      if (d) return d;
    }
  } catch {}

  return null;
}
