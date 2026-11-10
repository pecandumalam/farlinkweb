import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, signSession } from "@/lib/session";

const schema = z.object({ email: z.string().email(), password: z.string().min(1), remember: z.boolean().optional() });

// Rate limit sederhana in-memory: 5 percobaan / 15 menit per IP
const attempts = new Map<string, { n: number; until: number }>();

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const now = Date.now();
  const a = attempts.get(ip);
  if (a && a.until > now && a.n >= 5) {
    return NextResponse.json({ error: "Too many attempts. Please try again in 15 minutes." }, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  const fail = () => {
    const cur = a && a.until > now ? a : { n: 0, until: now + 15 * 60_000 };
    attempts.set(ip, { n: cur.n + 1, until: cur.until });
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  };
  if (!parsed.success) return fail();

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user || !user.isActive || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) return fail();

  attempts.delete(ip);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "LOGIN" } });

  const remember = !!parsed.data.remember;
  const token = await signSession(
    { sub: user.id, email: user.email, name: user.name, role: user.role, companyId: (user as any).companyId ?? null },
    remember,
  );
  const res = NextResponse.json({ ok: true, mustChangePassword: user.mustChangePassword });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIE !== "1",
    path: "/",
    maxAge: remember ? 30 * 86400 : 12 * 3600,
  });
  return res;
}
