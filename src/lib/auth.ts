import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "./db";

export const SESSION_COOKIE = "consulease_session";
export const SESSION_SECONDS = 60 * 60 * 24 * 7;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [algorithm, salt, value] = stored.split(":");
  if (algorithm !== "scrypt" || !salt || !value || value.length !== 128) return false;
  try { return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(value, "hex")); }
  catch { return false; }
}

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  await db.session.create({ data: { userId, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000) } });
  return token;
}

export function readCookie(request: Request): string | undefined {
  return request.headers.get("cookie")?.split(";").map(value => value.trim()).find(value => value.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
}

export async function currentUser(request: Request) {
  const token = readCookie(request);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await db.session.findUnique({ where: { tokenHash: tokenHash(token) }, include: { user: true } });
  if (!session || session.expiresAt <= new Date() || !session.user.active) return null;
  return session.user;
}

export function sessionCookie(token: string, request: Request): string {
  let originIsSecure = false;
  try { originIsSecure = !!process.env.APP_ORIGIN && new URL(process.env.APP_ORIGIN).protocol === "https:"; } catch { /* optional configuration is validated by setup */ }
  const secure = new URL(request.url).protocol === "https:" || originIsSecure || process.env.COOKIE_SECURE === "true";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? SESSION_SECONDS : 0}${secure ? "; Secure" : ""}`;
}

export function safeUser<T extends { passwordHash: string }>(user: T): Omit<T, "passwordHash"> {
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}
