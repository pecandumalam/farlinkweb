import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "farlinkone_session";

export type SessionPayload = { sub: string; email: string; name: string; role: string; companyId?: string | null };

const FALLBACK_SECRET = "dev-secret-farlinkone-0123456789abcdef0123456789abcdef";

function key() {
  const secret =
    process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 16 ? process.env.AUTH_SECRET : FALLBACK_SECRET;
  return new TextEncoder().encode(secret);
}

export async function signSession(p: SessionPayload, remember: boolean) {
  return new SignJWT({ ...p })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(remember ? "30d" : "12h")
    .sign(key());
}

export async function verifySession(token?: string): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return payload as unknown as SessionPayload;
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("verifySession failed:", err);
    }
    return null;
  }
}
