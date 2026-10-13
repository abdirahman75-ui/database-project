import { Prisma, ApplicationStatus, type User } from "@prisma/client";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "./db";
import { createSession, currentUser, hashPassword, readCookie, safeUser, sessionCookie, SESSION_SECONDS, tokenHash, verifyPassword } from "./auth";
import type { Requirement } from "./types";

class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
function fail(status: number, message: string): never { throw new ApiError(status, message); }
const json = (data: unknown, status = 200, headers?: HeadersInit) => {
  const result = new Headers(headers);
  result.set("Cache-Control", "private, no-store");
  return Response.json(data, { status, headers: result });
};
const staff = (user: User) => { if (user.role === "CITIZEN") fail(403, "Staff access required."); };
const admin = (user: User) => { if (user.role !== "ADMIN") fail(403, "Administrator access required."); };
const own = (user: User, userId: string) => { if (user.role === "CITIZEN" && user.id !== userId) fail(403, "You do not have access to this record."); };
const uploadRoot = () => path.join(process.cwd(), ".data", "uploads");
const activeAppointments = ["BOOKED", "CHECKED_IN"] as const;
// A small per-process throttle for this prototype; shared deployments should use a distributed rate limiter.
const loginFailures = new Map<string, { count: number; expiresAt: number }>();
function failedLogin(email: string) {
  const existing = loginFailures.get(email);
  loginFailures.set(email, { count: (existing && existing.expiresAt > Date.now() ? existing.count : 0) + 1, expiresAt: Date.now() + 10 * 60000 });
  if (loginFailures.size > 1000) for (const [key, item] of loginFailures) if (item.expiresAt < Date.now()) loginFailures.delete(key);
  if (loginFailures.size > 1000) { const oldest = loginFailures.keys().next().value; if (oldest) loginFailures.delete(oldest); }
}
const applicationInclude = {
  user: true, service: true, documents: { include: { document: true } },
  history: { orderBy: { createdAt: "asc" as const } },
  appointments: { include: { slot: true }, orderBy: { createdAt: "desc" as const } },
  payments: { orderBy: { createdAt: "desc" as const } },
} satisfies Prisma.ApplicationInclude;
type FullApplication = Prisma.ApplicationGetPayload<{ include: typeof applicationInclude }>;
type FullDocument = Prisma.DocumentGetPayload<Record<string, never>>;
function documentPublic(document: FullDocument) {
  const { storageKey: _storage, verifiedBy: _verifiedBy, ...result } = document;
  return result;
}
function applicationPublic(application: FullApplication) {
  return { ...application, user: safeUser(application.user), documents: application.documents.map(item => documentPublic(item.document)) };
}
async function getApplication(id: string) {
  const application = await db.application.findUnique({ where: { id }, include: applicationInclude });
  if (!application) fail(404, "Application not found.");
  return application;
}
function text(value: unknown, label: string, max = 200, required = false): string {
  if (typeof value !== "string") { if (!required && value === undefined) return ""; fail(400, `${label} must be text.`); }
  const clean = value.trim();
  if ((required && !clean) || clean.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(clean)) fail(400, `${label} is required and must be at most ${max} characters.`);
  return clean;
}
function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") fail(400, `${label} must be true or false.`);
  return value;
}
function passwordValue(value: unknown, strong = false): string {
  if (typeof value !== "string" || !value.length || value.length > 128) fail(400, "Password must be between 1 and 128 characters.");
  if (strong && (value.length < 10 || !/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/[0-9]/.test(value))) fail(400, "Use a password of at least 10 characters with uppercase, lowercase, and a number.");
  return value;
}
function integer(value: unknown, label: string, max = 100000, min = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) fail(400, `${label} must be a whole number between ${min} and ${max}.`);
  return value;
}
function category(value: unknown): string {
  const result = text(value, "Document category", 50, true).toUpperCase();
  if (!/^[A-Z][A-Z0-9_]*$/.test(result)) fail(400, "Document category must use letters, numbers, and underscores.");
  return result;
}
function details(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > 30) fail(400, "Application details must be an object with at most 30 fields.");
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,49}$/.test(key) || ["__proto__", "constructor", "prototype"].includes(key)) fail(400, "Invalid details field.");
    result[key] = text(item, key, 4000);
  }
  return result;
}
function documentIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 25 || value.some(item => typeof item !== "string" || item.length > 100)) fail(400, "Choose up to 25 documents.");
  return [...new Set(value)] as string[];
}
async function validateDocuments(userId: string, ids: string[]) {
  if (await db.document.count({ where: { id: { in: ids }, userId } }) !== ids.length) fail(403, "Choose only documents belonging to this applicant.");
}
async function body(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get("content-length") ?? 0) > 131072) fail(413, "Request too large.");
  const raw = await request.text();
  if (raw.length > 131072) fail(413, "Request too large.");
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) fail(400, "A JSON object is required.");
    return parsed as Record<string, unknown>;
  } catch (error) { if (error instanceof ApiError) throw error; fail(400, "Invalid JSON request."); }
}
function checkOrigin(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  if (request.headers.get("sec-fetch-site") === "cross-site") fail(403, "Cross-site writes are not allowed.");
  const origin = request.headers.get("origin");
  if (!origin) return; // Non-browser API clients authenticate with the same session cookie.
  const allowed = [new URL(request.url).origin];
  if (process.env.APP_ORIGIN) { try { allowed.push(new URL(process.env.APP_ORIGIN).origin); } catch { /* invalid optional config is ignored */ } }
  if (!allowed.includes(origin)) fail(403, "Request origin does not match this application.");
}
async function serializable<T>(action: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return await db.$transaction(action, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10000 }); }
    catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 3) continue; throw error; }
  }
  throw new Error("Transaction failed.");
}
async function audit(tx: Prisma.TransactionClient, user: User, action: string, entityType: string, entityId: string, data: Prisma.InputJsonValue = {}) {
  await tx.auditLog.create({ data: { actorId: user.id, action, entityType, entityId, details: data } });
}
async function history(tx: Prisma.TransactionClient, user: User, application: { id: string; userId: string; reference: string; status: ApplicationStatus }, toStatus: ApplicationStatus, remark: string) {
  await tx.applicationHistory.create({ data: { applicationId: application.id, fromStatus: application.status, toStatus, remark, actorId: user.id, actorName: user.name } });
  await tx.notification.create({ data: { userId: application.userId, title: `${application.reference}: ${toStatus.replaceAll("_", " ")}`, message: remark || "Your application status has been updated." } });
  await audit(tx, user, "APPLICATION_STATUS", "Application", application.id, { from: application.status, to: toStatus, remark });
}
function serviceData(input: Record<string, unknown>, partial = false): Prisma.ServiceUncheckedCreateInput {
  const data: Record<string, unknown> = {};
  for (const key of ["code", "name", "description"]) if (!partial || input[key] !== undefined) data[key] = text(input[key], key, key === "description" ? 4000 : 150, true);
  if (data.code && !/^[A-Z][A-Z0-9_-]{1,39}$/.test(String(data.code))) fail(400, "Service code must be 2–40 uppercase letters, numbers, or hyphens.");
  for (const key of ["standardFee", "priorityFee"]) if (!partial || input[key] !== undefined) data[key] = integer(input[key] ?? 0, key);
  for (const key of ["requiresAppointment", "requiresIdentity", "priorityAllowed", "active", "applicationEnabled"]) if (input[key] !== undefined) data[key] = boolean(input[key], key);
  if (!partial || input.requirements !== undefined) {
    if (!Array.isArray(input.requirements) || input.requirements.length > 20) fail(400, "Requirements must be a list of up to 20 documents.");
    const requirements = input.requirements.map(value => {
      if (!value || typeof value !== "object") fail(400, "Invalid requirement.");
      const item = value as Record<string, unknown>;
      return { category: category(item.category), label: text(item.label, "Requirement label", 150, true), required: boolean(item.required ?? true, "Required") };
    });
    if (new Set(requirements.map(item => item.category)).size !== requirements.length) fail(400, "Requirement categories must be unique.");
    data.requirements = requirements;
  }
  for (const key of ["eligibility", "procedures"]) if (!partial || input[key] !== undefined) {
    if (!Array.isArray(input[key]) || (input[key] as unknown[]).length > 20) fail(400, `${key} must be a list of up to 20 items.`);
    data[key] = (input[key] as unknown[]).map(item => text(item, key, 1000, true));
  }
  return data as unknown as Prisma.ServiceUncheckedCreateInput;
}
function requiredMissing(application: FullApplication, verified: boolean) {
  const requirements = application.service.requirements as unknown as Requirement[];
  return requirements.filter(item => item.required && !application.documents.some(link => link.document.category === item.category && (verified ? link.document.status === "VERIFIED" : link.document.status !== "REJECTED"))).map(item => item.label);
}
async function getReport() {
  const [applications, payments, totalCitizens, appointmentCount, auditCount] = await Promise.all([
    db.application.findMany({ include: { service: true } }), db.payment.findMany(), db.user.count({ where: { role: "CITIZEN" } }),
    db.appointment.count({ where: { status: { not: "CANCELLED" } } }), db.auditLog.count(),
  ]);
  const byStatus: Record<string, number> = {};
  const byService: Record<string, number> = {};
  for (const application of applications) { byStatus[application.status] = (byStatus[application.status] ?? 0) + 1; byService[application.service.name] = (byService[application.service.name] ?? 0) + 1; }
  const completed = applications.filter(item => item.status === "COMPLETED");
  return { totalApplications: applications.length, byStatus, byService: Object.entries(byService).map(([service, count]) => ({ service, count })), priorityApplications: applications.filter(item => item.priority).length, completedApplications: completed.length, pendingApplications: applications.filter(item => !["DRAFT", "COMPLETED", "REJECTED"].includes(item.status)).length, collectedRevenue: payments.filter(item => item.status === "PAID").reduce((sum, item) => sum + item.amount, 0), waivedAmount: payments.filter(item => item.status === "WAIVED").reduce((sum, item) => sum + item.amount, 0), averageCompletionDays: completed.length ? Math.round(completed.reduce((sum, item) => sum + (item.updatedAt.getTime() - (item.submittedAt ?? item.createdAt).getTime()) / 86400000, 0) / completed.length * 10) / 10 : 0, totalCitizens, appointmentCount, auditCount, currency: "MYR" };
}
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!)); }

export async function handleApi(request: Request, segments: string[]): Promise<Response> {
  try {
    checkOrigin(request);
    const [area, id, operation] = segments;
    const method = request.method;
    if (area === "health" && method === "GET") { await db.$queryRaw`SELECT 1`; return json({ status: "ok", database: "ready", service: "ConsulEase" }); }
    if (area === "auth" && method === "POST" && ["login", "register", "logout"].includes(id)) {
      if (id === "logout") { const token = readCookie(request); if (token) await db.session.deleteMany({ where: { tokenHash: tokenHash(token) } }); return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", request) }); }
      const input = await body(request);
      const email = text(input.email, "Email", 254, true).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, "Enter a valid email address.");
      const password = passwordValue(input.password, id === "register");
      let user: User;
      if (id === "register") {
        user = await db.user.create({ data: { name: text(input.name, "Name", 150, true), email, passwordHash: hashPassword(password) } });
      } else {
        const attempts = loginFailures.get(email);
        if (attempts && attempts.expiresAt > Date.now() && attempts.count >= 10) fail(429, "Too many failed attempts. Wait 10 minutes before trying again.");
        const existing = await db.user.findUnique({ where: { email } });
        // Perform the same expensive derivation for unknown accounts to limit timing differences.
        if (!existing) { hashPassword(password); failedLogin(email); fail(401, "Invalid email or password."); }
        if (!verifyPassword(password, existing.passwordHash) || !existing.active) { failedLogin(email); fail(401, "Invalid email or password."); }
        loginFailures.delete(email);
        user = existing;
      }
      return json({ user: safeUser(user) }, id === "register" ? 201 : 200, { "Set-Cookie": sessionCookie(await createSession(user.id), request) });
    }
    const user = await currentUser(request);
    if (!user) fail(401, "Sign in to continue.");
    if (area === "auth" && id === "password" && method === "POST") {
      const input = await body(request);
      const currentPassword = passwordValue(input.currentPassword);
      const newPassword = passwordValue(input.newPassword, true);
      const attempts = loginFailures.get(user.email);
      if (attempts && attempts.expiresAt > Date.now() && attempts.count >= 10) fail(429, "Too many failed attempts. Wait 10 minutes before trying again.");
      if (!verifyPassword(currentPassword, user.passwordHash)) { failedLogin(user.email); fail(401, "Current password is incorrect."); }
      if (verifyPassword(newPassword, user.passwordHash)) fail(400, "Choose a different password.");
      const token = randomBytes(32).toString("hex");
      const updated = await serializable(async tx => {
        const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
        if (current.passwordHash !== user.passwordHash) fail(409, "Your password changed during this request. Sign in and try again.");
        const value = await tx.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(newPassword) } });
        await tx.session.deleteMany({ where: { userId: user.id } });
        await tx.session.create({ data: { userId: user.id, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000) } });
        await audit(tx, user, "PASSWORD_CHANGE", "User", user.id, { sessionsRevoked: true });
        return value;
      });
      loginFailures.delete(user.email);
      return json({ user: safeUser(updated) }, 200, { "Set-Cookie": sessionCookie(token, request) });
    }
    if (area === "bootstrap" && method === "GET") {
      const citizen = user.role === "CITIZEN";
      const scope = citizen ? { userId: user.id } : {};
      const [services, applications, documents, slots, appointments, payments, notifications, announcements, users, report] = await Promise.all([
        db.service.findMany({ where: citizen ? { active: true } : {}, orderBy: { createdAt: "asc" } }),
        db.application.findMany({ where: scope, include: applicationInclude, orderBy: [{ priority: "desc" }, { updatedAt: "desc" }] }),
        db.document.findMany({ where: scope, orderBy: { createdAt: "desc" } }),
        db.slot.findMany({ where: { startsAt: { gte: new Date(Date.now() - 86400000) } }, include: { appointments: { where: { status: { in: [...activeAppointments] } }, select: { id: true } } }, orderBy: { startsAt: "asc" } }),
        db.appointment.findMany({ where: citizen ? { application: { userId: user.id } } : {}, include: { slot: true, application: { include: { user: true, service: true } } }, orderBy: { createdAt: "desc" } }),
        db.payment.findMany({ where: citizen ? { application: { userId: user.id } } : {}, include: { application: { include: { user: true, service: true } } }, orderBy: { createdAt: "desc" } }),
        db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 }),
        db.announcement.findMany({ where: citizen ? { published: true } : {}, orderBy: { createdAt: "desc" } }),
        user.role === "ADMIN" ? db.user.findMany({ orderBy: { createdAt: "desc" } }) : Promise.resolve(undefined),
        user.role === "ADMIN" ? getReport() : Promise.resolve(undefined),
      ]);
      return json({ user: safeUser(user), services, applications: applications.map(applicationPublic), documents: documents.map(documentPublic), slots: slots.map(({ appointments: bookings, ...slot }) => ({ ...slot, bookedCount: bookings.length })), appointments: appointments.map(item => ({ ...item, application: { reference: item.application.reference, user: safeUser(item.application.user), service: item.application.service } })), payments: payments.map(item => ({ ...item, application: { reference: item.application.reference, user: safeUser(item.application.user), service: item.application.service } })), notifications, announcements, users: users?.map(safeUser), report });
    }
    if (area === "profile" && ["POST", "PATCH"].includes(method)) {
      const input = await body(request);
      const changes: Record<string, string> = {};
      for (const key of ["name", "phone", "passportNumber", "nationality", "dateOfBirth", "address"]) if (input[key] !== undefined) changes[key] = text(input[key], key, key === "address" ? 1000 : 150, key === "name");
      if (changes.dateOfBirth && (!/^\d{4}-\d{2}-\d{2}$/.test(changes.dateOfBirth) || Number.isNaN(Date.parse(changes.dateOfBirth)) || new Date(changes.dateOfBirth).toISOString().slice(0, 10) !== changes.dateOfBirth || new Date(changes.dateOfBirth) > new Date())) fail(400, "Enter a valid date of birth in YYYY-MM-DD format.");
      return json({ user: safeUser(await db.user.update({ where: { id: user.id }, data: changes })) });
    }
    if (area === "documents") {
      if (method === "POST" && !id) {
        if (user.role !== "CITIZEN") fail(403, "Citizen access required to upload a personal document.");
        if (Number(request.headers.get("content-length") ?? 0) > 5 * 1024 * 1024 + 32768) fail(413, "Files must be at most 5 MB.");
        let form: FormData;
        try { form = await request.formData(); } catch { fail(400, "Submit the document as multipart form data."); }
        const file = form.get("file");
        if (!(file instanceof File) || !file.size) fail(400, "Choose a PDF, JPEG, or PNG file.");
        if (file.size > 5 * 1024 * 1024) fail(413, "Files must be at most 5 MB.");
        const cat = category(form.get("category"));
        const bytes = Buffer.from(await file.arrayBuffer());
        const isPdf = bytes.subarray(0, 5).toString("ascii") === "%PDF-";
        const isPng = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        const isJpg = bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
        const mimeType = isPdf ? "application/pdf" : isPng ? "image/png" : isJpg ? "image/jpeg" : "";
        if (!mimeType || (file.type && file.type !== mimeType)) fail(400, "File contents must match a PDF, JPEG, or PNG document.");
        const storageKey = `${randomUUID()}.${isPdf ? "pdf" : isPng ? "png" : "jpg"}`;
        const filePath = path.join(uploadRoot(), storageKey);
        await mkdir(uploadRoot(), { recursive: true, mode: 0o700 });
        await writeFile(filePath, bytes, { flag: "wx", mode: 0o600 });
        try {
          const document = await db.document.create({ data: { userId: user.id, name: text(path.basename(file.name), "Filename", 180, true), category: cat, mimeType, size: bytes.length, storageKey } });
          return json({ document: documentPublic(document) }, 201);
        } catch (error) { await unlink(filePath).catch(() => undefined); throw error; }
      }
      if (id && ["GET", "PATCH"].includes(method)) {
        const document = await db.document.findUnique({ where: { id }, include: { applications: { include: { application: true } } } });
        if (!document) fail(404, "Document not found.");
        own(user, document.userId);
        if (method === "GET") {
          if (!/^[a-f0-9-]{36}\.(pdf|png|jpg)$/.test(document.storageKey)) fail(500, "Document storage is invalid.");
          let bytes: Buffer;
          try { bytes = await readFile(path.join(uploadRoot(), document.storageKey)); } catch { fail(404, "Document file is unavailable."); }
          return new Response(new Uint8Array(bytes), { headers: { "Content-Type": document.mimeType, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(document.name)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
        }
        staff(user);
        const input = await body(request);
        if (!["VERIFIED", "REJECTED"].includes(String(input.status))) fail(400, "Choose VERIFIED or REJECTED.");
        const remark = text(input.remark, "Review remark", 2000, input.status === "REJECTED");
        const updated = await serializable(async tx => {
          // Read application states in the same transaction as the document write.
          // Approval reads this document and writes its application, so concurrent
          // decisions conflict under serializable isolation rather than invalidate evidence.
          const current = await tx.document.findUniqueOrThrow({ where: { id }, include: { applications: { include: { application: { select: { status: true } } } } } });
          if (!current.applications.some(item => ["SUBMITTED", "UNDER_REVIEW", "NEEDS_INFO", "APPOINTMENT_REQUIRED"].includes(item.application.status))) fail(409, "Only documents linked to an active submitted application can be reviewed.");
          if (current.applications.some(item => ["APPROVED", "READY_FOR_COLLECTION", "COMPLETED"].includes(item.application.status))) fail(409, "Documents used for an approved application are preserved as reviewed evidence.");
          const value = await tx.document.update({ where: { id }, data: { status: input.status as "VERIFIED" | "REJECTED", remark, verifiedBy: user.id } });
          await audit(tx, user, "DOCUMENT_REVIEW", "Document", id, { status: String(input.status), remark });
          await tx.notification.create({ data: { userId: current.userId, title: `Document ${String(input.status).toLowerCase()}`, message: `${current.name}: ${remark || "Your document has been verified."}` } });
          return value;
        });
        return json({ document: documentPublic(updated) });
      }
    }
    if (area === "applications") {
      if (method === "POST" && !id) {
        if (user.role !== "CITIZEN") fail(403, "Citizen access required to create an application.");
        const input = await body(request);
        const service = await db.service.findUnique({ where: { id: text(input.serviceId, "Service", 100, true) } });
        if (!service || !service.active || !service.applicationEnabled) fail(400, "Choose an available application service.");
        const priority = input.priority === undefined ? false : boolean(input.priority, "Priority");
        if (priority && !service.priorityAllowed) fail(400, "Priority handling is unavailable for this service.");
        const ids = documentIds(input.documentIds ?? []);
        await validateDocuments(user.id, ids);
        const application = await db.application.create({ data: { userId: user.id, serviceId: service.id, reference: `CE-${new Date().getUTCFullYear()}-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`, details: details(input.details ?? {}), priority, feeAmount: priority ? service.priorityFee : service.standardFee, documents: { create: ids.map(documentId => ({ documentId })) }, history: { create: { toStatus: "DRAFT", actorId: user.id, actorName: user.name, remark: "Application draft created." } } }, include: applicationInclude });
        return json({ application: applicationPublic(application) }, 201);
      }
      if (id) {
        const application = await getApplication(id);
        own(user, application.userId);
        if (method === "GET" && !operation) return json({ application: applicationPublic(application) });
        if (method === "PATCH" && !operation) {
          if (user.id !== application.userId || !["DRAFT", "NEEDS_INFO"].includes(application.status)) fail(409, "Only the applicant can edit drafts or applications needing information.");
          const input = await body(request);
          const changes: Prisma.ApplicationUpdateInput = {};
          if (input.details !== undefined) changes.details = details(input.details);
          if (input.documentIds !== undefined) {
            const ids = documentIds(input.documentIds); await validateDocuments(application.userId, ids);
            changes.documents = { deleteMany: {}, create: ids.map(documentId => ({ documentId })) };
          }
          await serializable(async tx => {
            const current = await tx.application.findUniqueOrThrow({ where: { id } });
            if (!["DRAFT", "NEEDS_INFO"].includes(current.status)) fail(409, "Application can no longer be edited.");
            await tx.application.update({ where: { id }, data: changes });
            await audit(tx, user, "APPLICATION_EDIT", "Application", id);
          });
          return json({ application: applicationPublic(await getApplication(id)) });
        }
        if (method === "POST" && operation === "submit") {
          if (user.id !== application.userId) fail(403, "Only the applicant can submit this application.");
          await serializable(async tx => {
            const current = await tx.application.findUniqueOrThrow({ where: { id }, include: applicationInclude });
            if (!["DRAFT", "NEEDS_INFO"].includes(current.status)) fail(409, "This application cannot be submitted in its current state.");
            if (!current.service.active || !current.service.applicationEnabled) fail(409, "This service is currently unavailable.");
            const missing = requiredMissing(current, false);
            if (missing.length) fail(400, `Attach the required documents: ${missing.join(", ")}.`);
            const formDetails = current.details as Record<string, string>;
            if (!formDetails.purpose?.trim()) fail(400, "Describe the purpose of your application.");
            if (current.priority && !formDetails.emergencyReason?.trim()) fail(400, "Describe the emergency reason for priority handling.");
            await tx.application.update({ where: { id }, data: { status: "SUBMITTED", submittedAt: current.submittedAt ?? new Date() } });
            await history(tx, user, current, "SUBMITTED", "Application submitted for consular review.");
          });
          return json({ application: applicationPublic(await getApplication(id)) });
        }
        if (method === "POST" && operation === "status") {
          staff(user);
          const input = await body(request);
          const target = String(input.status) as ApplicationStatus;
          const remark = text(input.remark, "Status remark", 2000, ["NEEDS_INFO", "REJECTED"].includes(target));
          const transitions: Partial<Record<ApplicationStatus, ApplicationStatus[]>> = { SUBMITTED: ["UNDER_REVIEW", "REJECTED"], UNDER_REVIEW: ["NEEDS_INFO", "APPOINTMENT_REQUIRED", "APPROVED", "REJECTED"], APPOINTMENT_REQUIRED: ["UNDER_REVIEW", "NEEDS_INFO", "REJECTED"], APPROVED: ["READY_FOR_COLLECTION"], READY_FOR_COLLECTION: ["COMPLETED"] };
          await serializable(async tx => {
            const current = await tx.application.findUniqueOrThrow({ where: { id }, include: applicationInclude });
            if (!transitions[current.status]?.includes(target)) fail(409, `Cannot change ${current.status} to ${target}.`);
            const identityVerified = input.identityVerified === undefined ? current.identityVerified : boolean(input.identityVerified, "Identity verification");
            if (["APPROVED", "READY_FOR_COLLECTION", "COMPLETED"].includes(target)) {
              const missing = requiredMissing(current, true);
              if (missing.length) fail(409, `Verify the required documents before approval: ${missing.join(", ")}.`);
              if (current.feeAmount > 0 && !current.payments.some(item => ["PAID", "WAIVED"].includes(item.status))) fail(409, "Record payment or an authorized waiver before approval.");
              if (current.service.requiresIdentity && !identityVerified) fail(409, "Identity verification is required before approval.");
              if (current.service.requiresAppointment && !current.appointments.some(item => item.status === "COMPLETED")) fail(409, "Complete the required appointment before approval.");
            }
            if (target === "APPOINTMENT_REQUIRED" && !current.service.requiresAppointment) fail(409, "This service does not require an appointment.");
            if (current.status === "APPOINTMENT_REQUIRED" && target === "UNDER_REVIEW" && !current.appointments.some(item => ["CHECKED_IN", "COMPLETED"].includes(item.status))) fail(409, "Check in the applicant before returning to review.");
            await tx.application.update({ where: { id }, data: { status: target, identityVerified } });
            if (target === "REJECTED") await tx.appointment.updateMany({ where: { applicationId: id, status: { in: [...activeAppointments] } }, data: { status: "CANCELLED" } });
            await history(tx, user, current, target, remark);
          });
          return json({ application: applicationPublic(await getApplication(id)) });
        }
      }
    }
    if (area === "slots" && method === "POST" && !id) {
      staff(user); const input = await body(request);
      const startsAt = new Date(text(input.startsAt, "Appointment date", 100, true));
      if (Number.isNaN(startsAt.getTime()) || startsAt <= new Date() || startsAt.getTime() > Date.now() + 366 * 86400000) fail(400, "Choose a future appointment date within one year.");
      const slot = await db.slot.create({ data: { startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60000), capacity: integer(input.capacity ?? 4, "Capacity", 100, 1), purpose: text(input.purpose ?? "Consular services", "Purpose", 200, true) } });
      return json({ slot: { ...slot, bookedCount: 0 } }, 201);
    }
    if (area === "appointments") {
      if (method === "POST" && !id) {
        const input = await body(request);
        const applicationId = text(input.applicationId, "Application", 100, true);
        const slotId = text(input.slotId, "Slot", 100, true);
        const appointment = await serializable(async tx => {
          const application = await tx.application.findUnique({ where: { id: applicationId }, include: { service: true } });
          if (!application) fail(404, "Application not found."); own(user, application.userId);
          if (application.status !== "APPOINTMENT_REQUIRED") fail(409, "An appointment can be booked after staff requests one.");
          await tx.$queryRaw`SELECT id FROM "Slot" WHERE id = ${slotId} FOR UPDATE`;
          const slot = await tx.slot.findUnique({ where: { id: slotId } });
          if (!slot || !slot.active || slot.startsAt <= new Date()) fail(400, "Choose an available future slot.");
          if (await tx.appointment.count({ where: { applicationId, status: { in: [...activeAppointments] } } })) fail(409, "This application already has an active appointment.");
          if (await tx.appointment.count({ where: { slotId, status: { in: [...activeAppointments] } } }) >= slot.capacity) fail(409, "This slot is full. Choose another time.");
          const value = await tx.appointment.create({ data: { applicationId, slotId }, include: { slot: true } });
          await tx.notification.create({ data: { userId: application.userId, title: "Appointment booked", message: `${application.reference}: ${slot.startsAt.toISOString()}. Queue number ${value.queueNumber}.` } });
          await audit(tx, user, "APPOINTMENT_BOOKED", "Appointment", value.id, { applicationId, slotId });
          return value;
        });
        return json({ appointment }, 201);
      }
      if (method === "PATCH" && id) {
        const input = await body(request); const action = text(input.action, "Action", 30, true);
        if (!["reschedule", "cancel", "check-in", "complete"].includes(action)) fail(400, "Choose a valid appointment action.");
        const appointment = await serializable(async tx => {
          const existing = await tx.appointment.findUnique({ where: { id }, include: { application: true, slot: true } });
          if (!existing) fail(404, "Appointment not found."); own(user, existing.application.userId);
          if (action === "check-in" || action === "complete") staff(user);
          if (action === "complete" && existing.status !== "CHECKED_IN") fail(409, "Check in the appointment before completing it.");
          if (action !== "complete" && existing.status !== "BOOKED") fail(409, "Only booked appointments can be changed or checked in.");
          if (["COMPLETED", "REJECTED"].includes(existing.application.status)) fail(409, "This application is closed.");
          const data: Prisma.AppointmentUpdateInput = {};
          if (action === "reschedule") {
            const slotId = text(input.slotId, "New slot", 100, true);
            if (slotId === existing.slotId) fail(400, "Choose a different appointment slot.");
            await tx.$queryRaw`SELECT id FROM "Slot" WHERE id = ${slotId} FOR UPDATE`;
            const slot = await tx.slot.findUnique({ where: { id: slotId } });
            if (!slot || !slot.active || slot.startsAt <= new Date()) fail(400, "Choose an available future slot.");
            if (await tx.appointment.count({ where: { slotId, status: { in: [...activeAppointments] } } }) >= slot.capacity) fail(409, "This slot is full.");
            data.slot = { connect: { id: slotId } };
          } else data.status = action === "cancel" ? "CANCELLED" : action === "check-in" ? "CHECKED_IN" : "COMPLETED";
          const value = await tx.appointment.update({ where: { id }, data, include: { slot: true } });
          await tx.notification.create({ data: { userId: existing.application.userId, title: `Appointment ${action}`, message: `${existing.application.reference}: appointment ${action}.` } });
          await audit(tx, user, `APPOINTMENT_${action.toUpperCase()}`, "Appointment", id);
          return value;
        });
        return json({ appointment });
      }
    }
    if (area === "payments") {
      if (method === "POST" && !id) {
        staff(user); const input = await body(request);
        const applicationId = text(input.applicationId, "Application", 100, true);
        const methodValue = input.method ?? "CASH";
        if (!["CASH", "BANK_TRANSFER"].includes(String(methodValue))) fail(400, "Choose cash or bank transfer.");
        const waived = input.waived === undefined ? false : boolean(input.waived, "Waived");
        if (waived) admin(user);
        const reference = text(input.reference, "Payment reference or waiver reason", 250, waived || methodValue === "BANK_TRANSFER");
        const payment = await serializable(async tx => {
          const application = await tx.application.findUnique({ where: { id: applicationId } });
          if (!application) fail(404, "Application not found.");
          if (["DRAFT", "COMPLETED", "REJECTED"].includes(application.status)) fail(409, "Record fees only for an active submitted application.");
          if (await tx.payment.count({ where: { applicationId } })) fail(409, "A payment or waiver is already recorded for this application.");
          if (application.feeAmount === 0) fail(409, "This application has no fee to record.");
          const value = await tx.payment.create({ data: { applicationId, amount: application.feeAmount, method: methodValue as "CASH" | "BANK_TRANSFER", status: waived ? "WAIVED" : "PAID", reference, receiptNumber: `CE-R-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`, recordedBy: user.name } });
          await tx.notification.create({ data: { userId: application.userId, title: waived ? "Fee waived" : "Payment recorded", message: `${application.reference}: MYR ${application.feeAmount}. Receipt ${value.receiptNumber}.` } });
          await audit(tx, user, "PAYMENT_RECORD", "Payment", value.id, { applicationId, amount: value.amount, status: value.status });
          return value;
        });
        return json({ payment }, 201);
      }
      if (method === "GET" && id && operation === "receipt") {
        const payment = await db.payment.findUnique({ where: { id }, include: { application: { include: { user: true, service: true } } } });
        if (!payment) fail(404, "Receipt not found."); own(user, payment.application.userId);
        const lines = [["Receipt", payment.receiptNumber], ["Citizen", payment.application.user.name], ["Application", payment.application.reference], ["Service", payment.application.service.name], ["Amount", `${payment.currency} ${payment.amount.toFixed(2)}`], ["Status", payment.status], ["Method", payment.method.replaceAll("_", " ")], ["Reference / reason", payment.reference || "—"], ["Recorded by", payment.recordedBy], ["Date", payment.createdAt.toISOString()]];
        return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(payment.receiptNumber)} · ConsulEase</title><style>body{font:16px system-ui;max-width:720px;margin:60px auto;color:#123c35;padding:24px}h1{font-size:32px}table{width:100%;border-collapse:collapse}td{padding:14px 0;border-bottom:1px solid #ddd}td:last-child{text-align:right}p{color:#666}button{padding:12px 20px;margin:24px 0}@media print{button{display:none}}</style><h1>ConsulEase</h1><h2>Official payment record</h2><p>Demonstration system · illustrative consular fees</p><table>${lines.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join("")}</table><button onclick="window.print()">Print receipt</button><p>This records a staff-confirmed payment or waiver; it is not an online payment gateway transaction.</p></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" } });
      }
    }
    if (area === "notifications" && id === "read" && method === "POST") { await db.notification.updateMany({ where: { userId: user.id, read: false }, data: { read: true } }); return json({ ok: true }); }
    if (area === "services" && ["POST", "PATCH"].includes(method)) {
      admin(user); const input = await body(request);
      if (method === "POST" && !id) { const service = await db.service.create({ data: serviceData(input) }); await db.auditLog.create({ data: { actorId: user.id, action: "SERVICE_CREATE", entityType: "Service", entityId: service.id, details: {} } }); return json({ service }, 201); }
      if (method === "PATCH" && id) { if (!await db.service.findUnique({ where: { id } })) fail(404, "Service not found."); const service = await db.service.update({ where: { id }, data: serviceData(input, true) }); await db.auditLog.create({ data: { actorId: user.id, action: "SERVICE_UPDATE", entityType: "Service", entityId: id, details: {} } }); return json({ service }); }
    }
    if (area === "announcements" && ["POST", "PATCH", "DELETE"].includes(method)) {
      admin(user);
      if (id && !await db.announcement.findUnique({ where: { id } })) fail(404, "Announcement not found.");
      if (method === "DELETE" && id) { await db.announcement.delete({ where: { id } }); await db.auditLog.create({ data: { actorId: user.id, action: "ANNOUNCEMENT_DELETE", entityType: "Announcement", entityId: id, details: {} } }); return json({ ok: true }); }
      const input = await body(request);
      const data: Record<string, unknown> = {};
      for (const key of ["title", "body"]) if (method === "POST" || input[key] !== undefined) data[key] = text(input[key], key, key === "body" ? 10000 : 200, true);
      if (input.published !== undefined) data.published = boolean(input.published, "Published");
      const announcement = method === "POST" && !id ? await db.announcement.create({ data: data as { title: string; body: string; published?: boolean } }) : id ? await db.announcement.update({ where: { id }, data }) : fail(404, "Endpoint not found.");
      await db.auditLog.create({ data: { actorId: user.id, action: "ANNOUNCEMENT_SAVE", entityType: "Announcement", entityId: announcement.id, details: {} } });
      return json({ announcement }, method === "POST" ? 201 : 200);
    }
    if (area === "users" && ["POST", "PATCH"].includes(method)) {
      admin(user); const input = await body(request);
      if (method === "POST" && !id) {
        const email = text(input.email, "Email", 254, true).toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, "Enter a valid email address.");
        const password = passwordValue(input.password, true);
        if (!["CITIZEN", "OFFICER", "ADMIN"].includes(String(input.role))) fail(400, "Choose a valid role.");
        const created = await db.user.create({ data: { name: text(input.name, "Name", 150, true), email, passwordHash: hashPassword(password), role: input.role as "CITIZEN" | "OFFICER" | "ADMIN" } });
        await db.auditLog.create({ data: { actorId: user.id, action: "USER_CREATE", entityType: "User", entityId: created.id, details: { role: created.role } } });
        return json({ user: safeUser(created) }, 201);
      }
      if (method === "PATCH" && id) {
        const changed = await serializable(async tx => {
          const existing = await tx.user.findUnique({ where: { id } });
          if (!existing) fail(404, "User not found.");
          const data: Prisma.UserUpdateInput = {};
          if (input.name !== undefined) data.name = text(input.name, "Name", 150, true);
          if (input.role !== undefined) { if (!["CITIZEN", "OFFICER", "ADMIN"].includes(String(input.role))) fail(400, "Choose a valid role."); data.role = input.role as "CITIZEN" | "OFFICER" | "ADMIN"; }
          if (input.active !== undefined) data.active = boolean(input.active, "Active");
          if (existing.role === "ADMIN" && existing.active && (data.role && data.role !== "ADMIN" || data.active === false) && await tx.user.count({ where: { role: "ADMIN", active: true } }) <= 1) fail(409, "At least one active administrator must remain.");
          const value = await tx.user.update({ where: { id }, data });
          if (data.role || data.active === false) await tx.session.deleteMany({ where: { userId: id } });
          await audit(tx, user, "USER_UPDATE", "User", id, { role: value.role, active: value.active });
          return value;
        });
        return json({ user: safeUser(changed) });
      }
    }
    if (area === "reports" && method === "GET") {
      admin(user); const report = await getReport();
      if (new URL(request.url).searchParams.get("format") === "csv") {
        const quote = (value: unknown) => {
          let safe = String(value);
          if (typeof value === "string" && /^[=+\-@\t\r]/.test(safe)) safe = `'${safe}`;
          return `"${safe.replaceAll('"', '""')}"`;
        };
        const rows: unknown[][] = [["metric", "value"], ...Object.entries(report).filter(([, value]) => typeof value !== "object"), ...Object.entries(report.byStatus).map(([status, count]) => [`status:${status}`, count]), ...report.byService.map(item => [`service:${item.service}`, item.count])];
        return new Response(rows.map(row => row.map(quote).join(",")).join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=consulease-report.csv", "Cache-Control": "private, no-store" } });
      }
      return json({ report });
    }
    fail(404, "Endpoint not found.");
  } catch (error) {
    if (error instanceof ApiError) return json({ error: error.message }, error.status);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") return json({ error: "This record already exists. Use a different email, service code, or appointment time." }, 409);
      if (error.code === "P2025") return json({ error: "Record not found." }, 404);
      if (error.code === "P2034") return json({ error: "The record changed during your request. Please try again." }, 409);
    }
    console.error("ConsulEase API error", error instanceof Error ? error.name + ": " + error.message : "Unknown error");
    return json({ error: "The request could not be completed. Please try again." }, 500);
  }
}
