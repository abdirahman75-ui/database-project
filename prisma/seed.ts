import { Prisma, type Service } from "@prisma/client";
import { existsSync } from "node:fs";
import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";

if (!process.env.DATABASE_URL && existsSync(".env")) process.loadEnvFile(".env");
const requirement = (category: string, label: string, required = true) => ({ category, label, required });
const services: Prisma.ServiceCreateInput[] = [
  { code: "PASSPORT", name: "Passport Renewal", description: "Renew an expired or expiring Somali passport, with document review and an in-person identity appointment.", standardFee: 250, priorityFee: 350, requirements: [requirement("PASSPORT", "Current passport"), requirement("PHOTO", "Recent passport photo")], eligibility: ["Somali citizens with an existing passport.", "An identity appointment is required before approval."], procedures: ["Complete your profile and upload your documents.", "Submit your application for review.", "Attend your appointment and complete identity verification.", "Collect your renewed passport when notified."], requiresAppointment: true, requiresIdentity: true },
  { code: "ENTRY_VISA", name: "Entry Visa Application", description: "Apply for an entry visa to Somalia, with travel-purpose documentation and consular review.", standardFee: 150, priorityFee: 220, requirements: [requirement("PASSPORT", "Valid passport"), requirement("PHOTO", "Recent passport photo"), requirement("SUPPORTING_LETTER", "Travel itinerary or invitation")], eligibility: ["Applicants must provide a valid passport.", "Explain your travel purpose and intended stay."], procedures: ["Enter your travel purpose and details.", "Upload passport, photo, and itinerary or invitation.", "Attend an interview when required by the reviewing officer.", "Collect the issued visa after approval."], requiresAppointment: true, requiresIdentity: true },
  { code: "ATTESTATION", name: "Document Attestation / Notarial Certification", description: "Request consular verification, attestation, or notarial certification of an eligible official document.", standardFee: 60, priorityFee: 100, requirements: [requirement("IDENTITY", "Applicant identity document"), requirement("SUPPORTING_LETTER", "Document to attest or certify")], eligibility: ["The submitted document must be legible and complete.", "Original documents may be requested during review."], procedures: ["Upload the document and explain where it will be used.", "Consular staff review the document's authenticity.", "Pay the applicable attestation fee.", "Collect the attested or certified document."], requiresAppointment: false, requiresIdentity: false },
  { code: "CITIZEN_REGISTRATION", name: "Citizen Registration", description: "Register your presence and contact information with the embassy while living, working, or studying in Malaysia.", standardFee: 40, priorityFee: 60, requirements: [requirement("PASSPORT", "Somali passport"), requirement("ADDRESS_PROOF", "Malaysian address or residency evidence")], eligibility: ["Somali citizens living, working, or studying in Malaysia.", "Provide current address and contact details."], procedures: ["Complete your personal and contact profile.", "Upload passport and address or residency evidence.", "Respond to any document clarification requests.", "Receive your registration confirmation."], requiresAppointment: false, requiresIdentity: false },
  { code: "VISA_SUPPORT", name: "Visa Support / Reference Letters", description: "Request a consular support or reference letter for a visa, study, employment, or administrative application.", standardFee: 70, priorityFee: 110, requirements: [requirement("PASSPORT", "Applicant passport"), requirement("SUPPORTING_LETTER", "Request details or supporting evidence")], eligibility: ["Explain the recipient and purpose of the requested letter.", "Provide evidence supporting the request."], procedures: ["Enter your letter purpose and recipient.", "Upload passport and supporting evidence.", "Consular staff review and prepare the letter.", "Collect the letter when it is ready."], requiresAppointment: false, requiresIdentity: false },
  { code: "EMERGENCY_TRAVEL", name: "Emergency Travel Document", description: "Request a temporary travel document after a lost, damaged, or inaccessible passport, including urgent cases.", standardFee: 120, priorityFee: 180, requirements: [requirement("IDENTITY", "Identity evidence"), requirement("PHOTO", "Recent passport photo"), requirement("SUPPORTING_LETTER", "Police report or explanation")], eligibility: ["Somali citizens who need urgent return travel.", "Explain the emergency and intended travel date."], procedures: ["Upload identity evidence and explain your travel need.", "Mark an urgent case for priority review when appropriate.", "Attend the identity appointment.", "Collect the travel document after approval."], requiresAppointment: true, requiresIdentity: true },
  { code: "NATIONAL_ID", name: "National ID Card Application", description: "Apply for a Somali national identity card with supporting evidence and in-person identity verification.", standardFee: 90, priorityFee: 140, requirements: [requirement("PASSPORT", "Passport or citizenship evidence"), requirement("PHOTO", "Recent identification photo"), requirement("BIRTH_CERTIFICATE", "Birth record or supporting evidence")], eligibility: ["Somali citizens with evidence of identity and citizenship.", "An in-person identity appointment is required."], procedures: ["Complete your identity details.", "Upload citizenship and identity evidence.", "Attend your appointment for the required physical verification.", "Collect the identity card after approval."], requiresAppointment: true, requiresIdentity: true },
  { code: "COMMUNITY", name: "Community Announcements", description: "Stay informed about community events, consular notices, office hours, and service updates.", standardFee: 0, priorityFee: 0, requirements: [], eligibility: ["Available to the community."], procedures: ["Read the latest published notices on your dashboard."], requiresAppointment: false, requiresIdentity: false, priorityAllowed: false, applicationEnabled: false },
];

function samplePdf(label: string) {
  const safe = label.replace(/[()\\]/g, "");
  const content = `BT /F1 18 Tf 50 740 Td (ConsulEase demo document) Tj 0 -35 Td (${safe}) Tj 0 -35 Td (Synthetic sample - not an identity document) Tj ET`;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`];
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(output)); output += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output);
}

async function seed() {
  const [citizen, officer] = await Promise.all([
    db.user.upsert({ where: { email: "citizen@consulease.test" }, update: {}, create: { name: "Amina Hassan", email: "citizen@consulease.test", passwordHash: hashPassword("ConsulEase2026!"), role: "CITIZEN", phone: "+60 12 345 6789", passportNumber: "DEMO-P123456", nationality: "Somali", dateOfBirth: "1994-06-18", address: "Kuala Lumpur, Malaysia" } }),
    db.user.upsert({ where: { email: "officer@consulease.test" }, update: {}, create: { name: "Omar Mohamed", email: "officer@consulease.test", passwordHash: hashPassword("ConsulEase2026!"), role: "OFFICER" } }),
    db.user.upsert({ where: { email: "admin@consulease.test" }, update: {}, create: { name: "Fatima Ali", email: "admin@consulease.test", passwordHash: hashPassword("ConsulEase2026!"), role: "ADMIN" } }),
  ]);
  const savedServices: Record<string, Service> = {};
  for (const service of services) savedServices[service.code] = await db.service.upsert({ where: { code: service.code }, update: {}, create: service });
  const uploadDir = path.join(process.cwd(), ".data", "uploads");
  await mkdir(uploadDir, { recursive: true, mode: 0o700 });
  const documents: Record<string, string> = {};
  const categories = ["PASSPORT", "PHOTO", "BIRTH_CERTIFICATE", "IDENTITY", "SUPPORTING_LETTER", "ADDRESS_PROOF"];
  for (const [index, cat] of categories.entries()) {
    const storageKey = `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}.pdf`;
    const existing = await db.document.findUnique({ where: { storageKey } });
    const bytes = samplePdf(`${cat.replaceAll("_", " ")} - Amina Hassan`);
    try { await access(path.join(uploadDir, storageKey)); } catch { await writeFile(path.join(uploadDir, storageKey), bytes, { flag: "wx", mode: 0o600 }); }
    const document = existing ?? await db.document.create({ data: { userId: citizen.id, name: `${cat.toLowerCase().replaceAll("_", "-")}-demo.pdf`, category: cat, mimeType: "application/pdf", size: bytes.length, storageKey, status: "VERIFIED", remark: "Synthetic demonstration document.", verifiedBy: officer.id } });
    documents[cat] = document.id;
  }
  const cases = [
    { reference: "CE-DEMO-2026-001", code: "PASSPORT", status: "APPOINTMENT_REQUIRED" as const, priority: false, purpose: "Renew my passport before it expires.", cats: ["PASSPORT", "PHOTO"], remark: "Documents reviewed. Please book your identity appointment." },
    { reference: "CE-DEMO-2026-002", code: "EMERGENCY_TRAVEL", status: "SUBMITTED" as const, priority: true, purpose: "Emergency return travel following the loss of my passport.", cats: ["IDENTITY", "PHOTO", "SUPPORTING_LETTER"], remark: "Urgent travel request awaiting consular review." },
    { reference: "CE-DEMO-2026-003", code: "CITIZEN_REGISTRATION", status: "READY_FOR_COLLECTION" as const, priority: false, purpose: "Register my residency and contact details in Malaysia.", cats: ["ADDRESS_PROOF", "PASSPORT"], remark: "Your citizen registration confirmation is ready for collection." },
    { reference: "CE-DEMO-2026-004", code: "ATTESTATION", status: "DRAFT" as const, priority: false, purpose: "Attest an academic document for an administrative application.", cats: ["IDENTITY", "SUPPORTING_LETTER"], remark: "Draft saved. Review your details before submission." },
  ];
  for (const item of cases) {
    if (await db.application.findUnique({ where: { reference: item.reference } })) continue;
    const service = savedServices[item.code];
    const submittedAt = new Date(Date.now() - (item.code === "CITIZEN_REGISTRATION" ? 8 : 2) * 86400000);
    const statuses = item.status === "DRAFT" ? ["DRAFT" as const] : item.status === "SUBMITTED" ? ["DRAFT" as const, "SUBMITTED" as const] : item.status === "APPOINTMENT_REQUIRED" ? ["DRAFT" as const, "SUBMITTED" as const, "UNDER_REVIEW" as const, "APPOINTMENT_REQUIRED" as const] : ["DRAFT" as const, "SUBMITTED" as const, "UNDER_REVIEW" as const, "APPROVED" as const, "READY_FOR_COLLECTION" as const];
    const feeAmount = item.priority ? service.priorityFee : service.standardFee;
    const application = await db.application.create({ data: { reference: item.reference, userId: citizen.id, serviceId: service.id, status: item.status, priority: item.priority, details: { purpose: item.purpose, passportNumber: citizen.passportNumber, emergencyReason: item.priority ? "Passport lost; urgent family return travel is required." : "" }, feeAmount, identityVerified: item.status === "READY_FOR_COLLECTION", submittedAt: item.status === "DRAFT" ? null : submittedAt, documents: { create: item.cats.map(cat => ({ documentId: documents[cat] })) }, history: { create: statuses.map((status, index) => ({ fromStatus: index ? statuses[index - 1] : null, toStatus: status, actorId: index > 1 ? officer.id : citizen.id, actorName: index > 1 ? officer.name : citizen.name, remark: index === statuses.length - 1 ? item.remark : "Demonstration application workflow.", createdAt: new Date(submittedAt.getTime() + index * 86400000 / Math.max(statuses.length, 1)) })) }, ...(item.status === "READY_FOR_COLLECTION" ? { payments: { create: { amount: feeAmount, method: "BANK_TRANSFER" as const, status: "PAID" as const, receiptNumber: "CE-R-DEMO-2026-001", reference: "DEMO-BANK-TRANSFER", recordedBy: officer.name } } } : {}) } });
    await db.notification.create({ data: { id: `notification-${item.reference}`, userId: citizen.id, title: `${application.reference}: ${item.status.replaceAll("_", " ")}`, message: item.remark } });
  }
  const now = new Date();
  for (let day = 1; day <= 14; day++) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + day));
    if ([0, 6].includes(date.getUTCDay())) continue;
    for (const hour of [2, 4, 6]) {
      const startsAt = new Date(date.getTime() + hour * 3600000);
      await db.slot.upsert({ where: { startsAt }, update: {}, create: { startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60000), capacity: 4, purpose: "Identity verification and consular services" } });
    }
  }
  const announcements = [
    { id: "notice-community", title: "Community consultation day", body: "Join the next community consultation session to discuss consular services and share feedback. Contact the consular office for the confirmed date and location." },
    { id: "notice-hours", title: "Plan your visit", body: "Appointments are available Monday to Friday. Bring original identity documents and your application reference. Check the appointment page for available times." },
    { id: "notice-demo", title: "Welcome to ConsulEase", body: "This demonstration uses synthetic documents and illustrative MYR fees. Use the portal to prepare applications, follow their progress, and book appointments." },
  ];
  for (const announcement of announcements) await db.announcement.upsert({ where: { id: announcement.id }, update: {}, create: announcement });
  console.log("Seed ready: seven application services, community notices, synthetic cases, and upcoming slots. Existing records were preserved.");
}
seed().catch(error => { console.error(error instanceof Error ? error.message : "Seed failed."); process.exitCode = 1; }).finally(() => db.$disconnect());
