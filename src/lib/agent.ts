import { NextResponse } from "next/server";
import { authDevice } from "@/lib/token";
import { prisma } from "@/lib/db";

export const unauthorized = () => NextResponse.json({ error: "Invalid device token" }, { status: 401 });

export async function withDevice(req: Request, fn: (d: NonNullable<Awaited<ReturnType<typeof authDevice>>>) => Promise<Response>) {
  const d = await authDevice(req);
  if (!d) return unauthorized();
  // setiap request agent = tanda hidup
  await prisma.device.update({ where: { id: d.id }, data: { lastSeenAt: new Date() } });
  return fn(d);
}
