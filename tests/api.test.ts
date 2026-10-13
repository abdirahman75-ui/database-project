import assert from 'node:assert/strict';
import { before, test } from 'node:test';

const origin = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3000';
const password = 'ConsulEase2026!';
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
function samplePdf() {
  let file = '%PDF-1.4\n';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>',
  ];
  const offsets: number[] = [0];
  for (let index = 0; index < objects.length; index++) {
    offsets.push(Buffer.byteLength(file));
    file += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(file);
  file += `xref\n0 4\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(file);
}
const pdf = samplePdf();

class Client {
  cookies = new Map<string, string>();

  async request(path: string, method = 'GET', body?: unknown) {
    const headers = new Headers();
    if (this.cookies.size) headers.set('cookie', [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; '));
    const multipart = body instanceof FormData;
    if (body !== undefined && !multipart) headers.set('content-type', 'application/json');
    const response = await fetch(`${origin}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : multipart ? body as FormData : JSON.stringify(body),
      redirect: 'manual',
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';');
      const separator = pair.indexOf('=');
      const key = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value) this.cookies.set(key, value);
      else this.cookies.delete(key);
    }
    const contentType = response.headers.get('content-type') ?? '';
    const data = contentType.includes('application/json') ? await response.json() : await response.text();
    return { response, status: response.status, data };
  }

  async ok(path: string, method = 'GET', body?: unknown) {
    const result = await this.request(path, method, body);
    assert.ok(result.status >= 200 && result.status < 300, `${method} ${path}: ${result.status} ${JSON.stringify(result.data)}`);
    return result.data;
  }

  async upload(category = 'PASSPORT', bytes = pdf, fileName = 'passport.pdf', type = 'application/pdf') {
    const form = new FormData();
    form.set('category', category);
    form.set('file', new Blob([new Uint8Array(bytes)], { type }), fileName);
    return this.request('/documents', 'POST', form);
  }
}

const anonymous = new Client();
const citizen = new Client();
const otherCitizen = new Client();
const officer = new Client();
const admin = new Client();
let citizenId: string;
let requiredService: any;
let onlineService: any;

async function register(client: Client, suffix: string) {
  const email = `integration-${runId}-${suffix}@example.test`;
  const result = await client.ok('/auth/register', 'POST', { name: `Integration ${suffix}`, email, password });
  assert.equal(result.user.role, 'CITIZEN');
  return result.user;
}

async function login(client: Client, email: string) {
  const result = await client.ok('/auth/login', 'POST', { email, password });
  assert.ok(result.user.id);
  assert.ok(client.cookies.size, 'Login must establish an HTTP cookie session');
  return result.user;
}

async function createService(overrides: Record<string, unknown> = {}) {
  const result = await admin.ok('/services', 'POST', {
    code: `TEST_${runId.replaceAll('-', '_')}_${Math.random().toString(36).slice(2, 6)}`.toUpperCase(),
    name: `Integration service ${runId}`,
    description: 'Isolated automated validation service.',
    requirements: [{ category: 'PASSPORT', label: 'Passport copy', required: true }],
    eligibility: ['A valid citizen account'],
    procedures: ['Submit documents', 'Attend verification appointment'],
    standardFee: 75,
    priorityFee: 100,
    requiresAppointment: true,
    requiresIdentity: true,
    priorityAllowed: true,
    ...overrides,
  });
  return result.service;
}

async function createApplication(client: Client, service = onlineService, documentIds: string[] = []) {
  const result = await client.ok('/applications', 'POST', {
    serviceId: service.id,
    details: { purpose: 'Integration verification', contactPhone: '+60123456789', nationality: 'Somali' },
    documentIds,
    priority: false,
  });
  assert.equal(result.application.status, 'DRAFT');
  return result.application;
}

async function uploadedPassport(client: Client) {
  const result = await client.upload();
  assert.ok([200, 201].includes(result.status), JSON.stringify(result.data));
  assert.ok(result.data.document.id);
  return result.data.document;
}

before(async () => {
  const health = await anonymous.ok('/health');
  assert.equal(health.status, 'ok');
  assert.equal(health.database, 'ready');
  await login(officer, 'officer@consulease.test');
  await login(admin, 'admin@consulease.test');
  citizenId = (await register(citizen, 'owner')).id;
  await register(otherCitizen, 'other');
  requiredService = await createService();
  onlineService = await createService({ standardFee: 0, priorityFee: 0, requiresIdentity: false, requiresAppointment: false });
});

test('the service catalog implements the proposal\'s eight named entries', async () => {
  const bootstrap = await citizen.ok('/bootstrap');
  const expected = ['passport renewal', 'entry visa', 'document attestation', 'citizen registration', 'visa support', 'emergency travel document', 'national id', 'community announcements'];
  for (const name of expected) {
    assert.ok(bootstrap.services.some((service: any) => service.name.toLowerCase().includes(name)), `Missing proposed service: ${name}`);
  }
  const community = bootstrap.services.find((service: any) => service.name.toLowerCase().includes('community announcements'));
  assert.equal(community.applicationEnabled, false, 'Announcements are published notices rather than a consular application');
});

test('authentication rejects anonymous, invalid credentials, weak passwords, and duplicate accounts', async () => {
  assert.equal((await anonymous.request('/bootstrap')).status, 401);
  assert.equal((await anonymous.request('/documents')).status, 401);
  assert.equal((await anonymous.request('/auth/login', 'POST', { email: 'admin@consulease.test', password: 'incorrect-password' })).status, 401);
  const weak = await anonymous.request('/auth/register', 'POST', { name: 'Weak Password', email: `weak-${runId}@example.test`, password: '123' });
  assert.equal(weak.status, 400);
  const duplicate = await anonymous.request('/auth/register', 'POST', { name: 'Duplicate', email: `integration-${runId}-owner@example.test`, password });
  assert.ok([400, 409].includes(duplicate.status));
  const bootstrap = await citizen.ok('/bootstrap');
  assert.equal(bootstrap.user.id, citizenId);
  assert.equal(bootstrap.user.role, 'CITIZEN');
  assert.equal(bootstrap.users, undefined, 'Citizen bootstrap must not disclose the user directory');
  assert.ok(!JSON.stringify(bootstrap).includes('passwordHash'), 'Public data must omit credential hashes');
  const loginSession = new Client();
  const signedIn = await loginSession.request('/auth/login', 'POST', { email: 'citizen@consulease.test', password });
  assert.equal(signedIn.status, 200);
  const sessionCookie = signedIn.response.headers.getSetCookie().join(';');
  assert.ok(sessionCookie.includes('HttpOnly'));
  assert.ok(sessionCookie.includes('SameSite=Lax'));
  await loginSession.ok('/auth/logout', 'POST');
  const crossSite = await fetch(`${origin}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://untrusted.example' },
    body: JSON.stringify({ email: 'citizen@consulease.test', password }),
  });
  assert.equal(crossSite.status, 403, 'Cross-origin browser writes must be rejected');
});

test('citizen accounts cannot grant themselves staff access or use administrative endpoints', async () => {
  const malicious = new Client();
  const result = await malicious.request('/auth/register', 'POST', {
    name: 'Role injection attempt', email: `injection-${runId}@example.test`, password, role: 'ADMIN',
  });
  if (result.status < 300) assert.equal(result.data.user.role, 'CITIZEN');
  else assert.equal(result.status, 400);
  assert.equal((await citizen.request('/users', 'POST', { name: 'Forbidden staff creation', email: `forbidden-${runId}@example.test`, password, role: 'ADMIN' })).status, 403);
  assert.equal((await citizen.request('/reports')).status, 403);
  assert.equal((await citizen.request(`/services/${onlineService.id}`, 'PATCH', { standardFee: 1 })).status, 403);
  assert.equal((await citizen.request('/slots', 'POST', { startsAt: new Date(Date.now() + 86400_000 * 34).toISOString(), capacity: 1 })).status, 403);
  assert.equal((await officer.request('/users', 'POST', { name: 'Forbidden staff creation', email: `forbidden-officer-${runId}@example.test`, password, role: 'ADMIN' })).status, 403);
  assert.equal((await citizen.request('/profile', 'PATCH', { role: 'ADMIN' })).data.user?.role ?? (await citizen.ok('/bootstrap')).user.role, 'CITIZEN');
});

test('profile changes persist and uploaded documents validate content and enforce ownership', async () => {
  await citizen.ok('/profile', 'PATCH', { name: 'Integration Updated Citizen', phone: '+60123456789', address: 'Kuala Lumpur', nationality: 'Somali' });
  assert.equal((await citizen.ok('/bootstrap')).user.name, 'Integration Updated Citizen');
  const fake = await citizen.upload('PASSPORT', Buffer.from('Not a PDF'), 'fake.pdf', 'application/pdf');
  assert.equal(fake.status, 400, 'A forged content type or extension cannot replace document signature validation');
  const unsupported = await citizen.upload('PASSPORT', Buffer.from('<script>alert(1)</script>'), 'unsafe.html', 'text/html');
  assert.equal(unsupported.status, 400);
  const oversized = await citizen.upload('PASSPORT', Buffer.alloc(5 * 1024 * 1024 + 1), 'oversized.pdf', 'application/pdf');
  assert.equal(oversized.status, 413);
  const uploaded = await uploadedPassport(citizen);
  const download = await citizen.request(`/documents/${uploaded.id}`);
  assert.equal(download.status, 200);
  assert.ok(download.response.headers.get('content-type')?.includes('application/pdf'));
  assert.ok(download.response.headers.get('content-disposition')?.includes('attachment'));
  assert.equal(download.data, pdf.toString(), 'Download must return the original bytes');
  const outsider = await otherCitizen.request(`/documents/${uploaded.id}`);
  assert.ok([403, 404].includes(outsider.status));
  assert.equal((await anonymous.request(`/documents/${uploaded.id}`)).status, 401);
  assert.equal((await citizen.request(`/documents/${uploaded.id}`, 'PATCH', { status: 'VERIFIED', remark: 'Self verification' })).status, 403);
  const application = await createApplication(citizen, onlineService, [uploaded.id]);
  await citizen.ok(`/applications/${application.id}/submit`, 'POST');
  const reviewed = await officer.ok(`/documents/${uploaded.id}`, 'PATCH', { status: 'VERIFIED', remark: 'Original passport inspected' });
  assert.equal(reviewed.document.status, 'VERIFIED');
});

test('applications require supporting documents, reject cross-owner attachments, and retain an audit trail', async () => {
  const application = await createApplication(citizen);
  assert.equal((await citizen.request(`/applications/${application.id}/submit`, 'POST')).status, 400);
  const otherDocument = await uploadedPassport(otherCitizen);
  const foreignAttachment = await citizen.request(`/applications/${application.id}`, 'PATCH', { documentIds: [otherDocument.id] });
  assert.ok([400, 403].includes(foreignAttachment.status));
  assert.ok([403, 404].includes((await otherCitizen.request(`/applications/${application.id}`, 'PATCH', { details: { purpose: 'Changed by another person' } })).status));
  const document = await uploadedPassport(citizen);
  await citizen.ok(`/applications/${application.id}`, 'PATCH', { documentIds: [document.id], details: { purpose: 'Updated application purpose' } });
  const submitted = await citizen.ok(`/applications/${application.id}/submit`, 'POST');
  assert.equal(submitted.application.status, 'SUBMITTED');
  assert.ok(submitted.application.reference);
  assert.equal((await citizen.request(`/applications/${application.id}/status`, 'POST', { status: 'APPROVED', remark: 'Self approval' })).status, 403);
  assert.ok([400, 409].includes((await officer.request(`/applications/${application.id}/status`, 'POST', { status: 'COMPLETED', remark: 'Invalid transition' })).status));
  await officer.ok(`/applications/${application.id}/status`, 'POST', { status: 'UNDER_REVIEW', remark: 'Review started' });
  await officer.ok(`/applications/${application.id}/status`, 'POST', { status: 'NEEDS_INFO', remark: 'Please clarify your purpose' });
  await citizen.ok(`/applications/${application.id}`, 'PATCH', { details: { purpose: 'Clarified purpose' }, documentIds: [document.id] });
  await citizen.ok(`/applications/${application.id}/submit`, 'POST');
  const bootstrap = await citizen.ok('/bootstrap');
  assert.ok(bootstrap.documents.every((item: any) => item.userId === citizenId));
  assert.ok(bootstrap.applications.every((item: any) => item.userId === citizenId));
  const stored = bootstrap.applications.find((item: any) => item.id === application.id);
  assert.equal(stored.status, 'SUBMITTED');
  assert.ok(stored.history.length >= 4, 'Submission and staff decisions must have an auditable history');
  assert.ok(bootstrap.notifications.some((item: any) => item.message?.includes('clarify') || item.applicationId === application.id), 'Staff decisions must notify the citizen');
  await citizen.ok('/notifications/read', 'POST');
  assert.ok((await citizen.ok('/bootstrap')).notifications.every((item: any) => item.readAt || item.read === true), 'Notifications can be marked read');
});

test('appointment capacity remains consistent under concurrent bookings and supports cancellation, rescheduling, and queue check-in', async () => {
  const passport = await uploadedPassport(citizen);
  const otherPassport = await uploadedPassport(otherCitizen);
  const first = await createApplication(citizen, requiredService, [passport.id]);
  const second = await createApplication(otherCitizen, requiredService, [otherPassport.id]);
  await citizen.ok(`/applications/${first.id}/submit`, 'POST');
  await otherCitizen.ok(`/applications/${second.id}/submit`, 'POST');
  for (const application of [first, second]) {
    await officer.ok(`/applications/${application.id}/status`, 'POST', { status: 'UNDER_REVIEW', remark: 'Verification appointment needed' });
    await officer.ok(`/applications/${application.id}/status`, 'POST', { status: 'APPOINTMENT_REQUIRED', remark: 'Attend passport verification' });
  }
  const future = new Date(Date.now() + 86400_000 * 31);
  const firstSlot = (await officer.ok('/slots', 'POST', { startsAt: future.toISOString(), capacity: 1, purpose: 'Integration capacity test' })).slot;
  const bookings = await Promise.all([
    citizen.request('/appointments', 'POST', { applicationId: first.id, slotId: firstSlot.id }),
    otherCitizen.request('/appointments', 'POST', { applicationId: second.id, slotId: firstSlot.id }),
  ]);
  assert.equal(bookings.filter((item) => item.status < 300).length, 1, 'Exactly one concurrent request may occupy a capacity-one slot');
  assert.equal(bookings.filter((item) => item.status === 409).length, 1, 'The losing request must receive a capacity conflict');
  const winnerIndex = bookings[0].status < 300 ? 0 : 1;
  const winner = winnerIndex === 0 ? citizen : otherCitizen;
  const loser = winnerIndex === 0 ? otherCitizen : citizen;
  const loserApplication = winnerIndex === 0 ? second : first;
  const appointment = bookings[winnerIndex].data.appointment;
  assert.equal((await winner.request(`/appointments/${appointment.id}`, 'PATCH', { action: 'check-in' })).status, 403);
  assert.ok([403, 404].includes((await loser.request(`/appointments/${appointment.id}`, 'PATCH', { action: 'cancel' })).status));
  const secondSlot = (await officer.ok('/slots', 'POST', { startsAt: new Date(future.getTime() + 3600_000).toISOString(), capacity: 1, purpose: 'Integration reschedule test' })).slot;
  const moved = await winner.ok(`/appointments/${appointment.id}`, 'PATCH', { action: 'reschedule', slotId: secondSlot.id });
  assert.equal(moved.appointment.slotId, secondSlot.id);
  const released = await loser.ok('/appointments', 'POST', { applicationId: loserApplication.id, slotId: firstSlot.id });
  assert.equal(released.appointment.slotId, firstSlot.id, 'Rescheduling releases the old capacity');
  await loser.ok(`/appointments/${released.appointment.id}`, 'PATCH', { action: 'cancel' });
  const rebooked = await loser.ok('/appointments', 'POST', { applicationId: loserApplication.id, slotId: firstSlot.id });
  const checked = await officer.ok(`/appointments/${rebooked.appointment.id}`, 'PATCH', { action: 'check-in' });
  assert.equal(checked.appointment.status, 'CHECKED_IN');
  const completed = await officer.ok(`/appointments/${rebooked.appointment.id}`, 'PATCH', { action: 'complete' });
  assert.equal(completed.appointment.status, 'COMPLETED');
});

test('required identity, reviewed documents, appointment and payment protect approval; staff can complete the workflow and issue a receipt', async () => {
  const document = await uploadedPassport(citizen);
  const application = await createApplication(citizen, requiredService, [document.id]);
  await citizen.ok(`/applications/${application.id}/submit`, 'POST');
  await officer.ok(`/applications/${application.id}/status`, 'POST', { status: 'UNDER_REVIEW', remark: 'All checks will be recorded' });
  assert.ok([400, 409].includes((await officer.request(`/applications/${application.id}/status`, 'POST', { status: 'APPROVED', remark: 'Missing prerequisites' })).status));
  await officer.ok(`/documents/${document.id}`, 'PATCH', { status: 'VERIFIED', remark: 'Passport reviewed' });
  await officer.ok(`/applications/${application.id}/status`, 'POST', { status: 'APPOINTMENT_REQUIRED', remark: 'Attend original document and identity verification' });
  const slot = (await officer.ok('/slots', 'POST', { startsAt: new Date(Date.now() + 86400_000 * 32).toISOString(), capacity: 1, purpose: 'Integration identity verification' })).slot;
  const appointment = (await citizen.ok('/appointments', 'POST', { applicationId: application.id, slotId: slot.id })).appointment;
  await officer.ok(`/appointments/${appointment.id}`, 'PATCH', { action: 'check-in' });
  await officer.ok(`/appointments/${appointment.id}`, 'PATCH', { action: 'complete' });
  await officer.ok(`/applications/${application.id}/status`, 'POST', { status: 'UNDER_REVIEW', remark: 'Identity inspected in person', identityVerified: true });
  assert.ok([400, 409].includes((await officer.request(`/applications/${application.id}/status`, 'POST', { status: 'APPROVED', remark: 'Payment still pending' })).status));
  assert.equal((await citizen.request('/payments', 'POST', { applicationId: application.id, method: 'CASH' })).status, 403);
  const payment = (await officer.ok('/payments', 'POST', { applicationId: application.id, method: 'CASH', reference: `TEST-${runId}` })).payment;
  assert.equal(payment.status, 'PAID');
  assert.equal(Number(payment.amount), 75);
  assert.ok([400, 409].includes((await officer.request('/payments', 'POST', { applicationId: application.id, method: 'CASH' })).status), 'Duplicate fee collection must be rejected');
  const receipt = await citizen.request(`/payments/${payment.id}/receipt`);
  assert.equal(receipt.status, 200);
  assert.ok(receipt.response.headers.get('content-type')?.includes('text/html'));
  assert.ok(receipt.data.includes(application.reference));
  assert.ok([403, 404].includes((await otherCitizen.request(`/payments/${payment.id}/receipt`)).status));
  await officer.ok(`/applications/${application.id}/status`, 'POST', { status: 'APPROVED', remark: 'All approval checks passed' });
  await officer.ok(`/applications/${application.id}/status`, 'POST', { status: 'READY_FOR_COLLECTION', remark: 'Document prepared for collection' });
  const completed = await officer.ok(`/applications/${application.id}/status`, 'POST', { status: 'COMPLETED', remark: 'Document collected' });
  assert.equal(completed.application.status, 'COMPLETED');
  assert.ok(completed.application.history.some((item: any) => item.remark === 'All approval checks passed'));
  assert.equal((await officer.request(`/documents/${document.id}`, 'PATCH', { status: 'REJECTED', remark: 'Attempt to alter completed evidence' })).status, 409);
  assert.equal((await officer.request(`/applications/${application.id}/status`, 'POST', { status: 'UNDER_REVIEW', remark: 'Attempt to reopen a terminal case' })).status, 409);
});

test('priority cases snapshot their fees, require an emergency reason, support reusable documents, and distinguish waivers from paid fees', async () => {
  const document = await uploadedPassport(citizen);
  const application = (await citizen.ok('/applications', 'POST', {
    serviceId: requiredService.id, details: { purpose: 'Emergency travel' }, documentIds: [document.id], priority: true,
  })).application;
  assert.equal(application.feeAmount, 100);
  assert.equal((await citizen.request(`/applications/${application.id}/submit`, 'POST')).status, 400, 'Priority requires an emergency reason');
  await citizen.ok(`/applications/${application.id}`, 'PATCH', { details: { purpose: 'Emergency travel', emergencyReason: 'Fictional lost passport test' } });
  await citizen.ok(`/applications/${application.id}/submit`, 'POST');
  const reused = await createApplication(citizen, onlineService, [document.id]);
  assert.ok(reused.documents.some((item: any) => item.id === document.id), 'One uploaded document may support multiple applications');
  await admin.ok(`/services/${requiredService.id}`, 'PATCH', { priorityFee: 110 });
  assert.equal((await citizen.ok(`/applications/${application.id}`)).application.feeAmount, 100, 'Changing a service fee must not alter an existing application');
  await admin.ok(`/services/${requiredService.id}`, 'PATCH', { priorityFee: 100 });
  assert.equal((await officer.request('/payments', 'POST', { applicationId: application.id, method: 'BANK_TRANSFER' })).status, 400, 'Bank transfer needs a reference');
  assert.equal((await officer.request('/payments', 'POST', { applicationId: application.id, method: 'CASH', waived: true, reference: 'Officer cannot authorize a waiver' })).status, 403, 'Only an administrator can authorize a waiver');
  assert.equal((await admin.request('/payments', 'POST', { applicationId: application.id, method: 'CASH', waived: true })).status, 400, 'A waiver needs a recorded reason');
  const waiver = (await admin.ok('/payments', 'POST', { applicationId: application.id, method: 'CASH', waived: true, reference: 'Approved hardship waiver for validation' })).payment;
  assert.equal(waiver.status, 'WAIVED');
  assert.equal(waiver.amount, 100);
  const receipt = await citizen.request(`/payments/${waiver.id}/receipt`);
  assert.equal(receipt.status, 200);
  assert.ok(receipt.data.includes('WAIVED'));
  const rejected = await officer.ok(`/documents/${document.id}`, 'PATCH', { status: 'REJECTED', remark: 'Please upload a legible passport copy' });
  assert.equal(rejected.document.status, 'REJECTED');
  assert.equal((await citizen.request(`/applications/${reused.id}/submit`, 'POST')).status, 400, 'A rejected document cannot satisfy another application\'s requirements');
});

test('concurrent document rejection and application approval preserve the evidence used for a final decision', async () => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const document = await uploadedPassport(citizen);
    const application = await createApplication(citizen, onlineService, [document.id]);
    await citizen.ok(`/applications/${application.id}/submit`, 'POST');
    await officer.ok(`/documents/${document.id}`, 'PATCH', { status: 'VERIFIED', remark: 'Verified before concurrent processing' });
    await officer.ok(`/applications/${application.id}/status`, 'POST', { status: 'UNDER_REVIEW', remark: 'Ready for decision' });
    const results = await Promise.all([
      officer.request(`/applications/${application.id}/status`, 'POST', { status: 'APPROVED', remark: 'Concurrent approval attempt' }),
      officer.request(`/documents/${document.id}`, 'PATCH', { status: 'REJECTED', remark: 'Concurrent rejection attempt' }),
    ]);
    assert.equal(results.filter(result => result.status < 300).length, 1, 'Approval and invalidation of its required evidence cannot both succeed');
    assert.equal(results.filter(result => result.status === 409).length, 1, 'The conflicting operation receives a domain conflict');
    const final = (await citizen.ok(`/applications/${application.id}`)).application;
    if (final.status === 'APPROVED') assert.equal(final.documents[0].status, 'VERIFIED');
    else {
      assert.equal(final.status, 'UNDER_REVIEW');
      assert.equal(final.documents[0].status, 'REJECTED');
    }
  }
});

test('administrators manage isolated services, announcements and staff; reports export CSV and the active administrator stays protected', async () => {
  const service = (await admin.ok(`/services/${onlineService.id}`, 'PATCH', { standardFee: 10, description: 'Updated validation service' })).service;
  assert.equal(Number(service.standardFee), 10);
  const announcement = (await admin.ok('/announcements', 'POST', { title: `Integration announcement ${runId}`, body: 'Automated validation announcement.', published: true, priority: false })).announcement;
  assert.ok((await citizen.ok('/bootstrap')).announcements.some((item: any) => item.id === announcement.id));
  await admin.ok(`/announcements/${announcement.id}`, 'PATCH', { title: `Updated announcement ${runId}`, body: 'Updated notification information.' });
  assert.equal((await officer.request('/announcements', 'POST', { title: 'Forbidden announcement', body: 'Forbidden' })).status, 403);
  const staff = (await admin.ok('/users', 'POST', { name: 'Integration Officer', email: `staff-${runId}@example.test`, password, role: 'OFFICER' })).user;
  assert.equal(staff.role, 'OFFICER');
  const staffSession = new Client();
  await login(staffSession, staff.email);
  const changed = (await admin.ok(`/users/${staff.id}`, 'PATCH', { active: false })).user;
  assert.equal(changed.active, false);
  assert.equal((await staffSession.request('/bootstrap')).status, 401, 'Disabling staff must revoke an existing session');
  assert.ok([401, 403].includes((await anonymous.request('/auth/login', 'POST', { email: staff.email, password })).status), 'Disabled staff cannot establish a session');
  const bootstrap = await admin.ok('/bootstrap');
  assert.ok(!JSON.stringify(bootstrap).includes('passwordHash'), 'Admin bootstrap also omits password hashes');
  const self = bootstrap.user;
  assert.ok([400, 409].includes((await admin.request(`/users/${self.id}`, 'PATCH', { active: false })).status), 'The last active administrator cannot be disabled');
  assert.ok([400, 409].includes((await admin.request(`/users/${self.id}`, 'PATCH', { role: 'OFFICER' })).status), 'The last active administrator cannot be demoted');
  const report = await admin.ok('/reports');
  assert.ok(report.report.totalApplications >= 7);
  assert.ok(report.report.byStatus.COMPLETED >= 1);
  assert.ok(report.report.collectedRevenue >= 75);
  assert.ok(report.report.waivedAmount >= 100);
  assert.ok(report.report.byService.some((item: any) => item.service === requiredService.name));
  const csv = await admin.request('/reports?format=csv');
  assert.equal(csv.status, 200);
  assert.ok(csv.response.headers.get('content-type')?.includes('text/csv'));
  assert.ok(csv.data.includes('Service') || csv.data.includes('service'));
  await admin.ok(`/announcements/${announcement.id}`, 'DELETE');
  assert.ok(!(await citizen.ok('/bootstrap')).announcements.some((item: any) => item.id === announcement.id));
  await admin.ok(`/services/${requiredService.id}`, 'PATCH', { active: false });
  await admin.ok(`/services/${onlineService.id}`, 'PATCH', { active: false });
  assert.equal((await citizen.request('/applications', 'POST', { serviceId: onlineService.id, details: { purpose: 'Disabled service' }, documentIds: [] })).status, 400);
});

test('logout invalidates the server session', async () => {
  const session = new Client();
  await login(session, 'citizen@consulease.test');
  const stolenCookie = new Client();
  stolenCookie.cookies = new Map(session.cookies);
  await session.ok('/auth/logout', 'POST');
  assert.equal((await session.request('/bootstrap')).status, 401);
  assert.equal((await stolenCookie.request('/bootstrap')).status, 401, 'Clearing the browser cookie alone is insufficient; the server session must be revoked');
});

test('password changes validate the current password, revoke other sessions, and reissue only the requesting session', async () => {
  const owner = new Client();
  const user = await register(owner, 'password-change');
  const otherSession = new Client();
  await login(otherSession, user.email);
  const oldRequestSession = new Client();
  oldRequestSession.cookies = new Map(owner.cookies);
  assert.equal((await owner.request('/auth/password', 'POST', { currentPassword: 'WrongPassword2026!', newPassword: 'ChangedPassword2026!' })).status, 401);
  assert.equal((await owner.request('/auth/password', 'POST', { currentPassword: password, newPassword: 'weak' })).status, 400);
  assert.equal((await owner.request('/auth/password', 'POST', { currentPassword: password, newPassword: password })).status, 400);
  const newPassword = ' ChangedPassword2026! ';
  const changed = await owner.ok('/auth/password', 'POST', { currentPassword: password, newPassword });
  assert.equal(changed.user.id, user.id);
  assert.equal((await owner.ok('/bootstrap')).user.id, user.id, 'The requesting browser receives a replacement session');
  assert.equal((await otherSession.request('/bootstrap')).status, 401);
  assert.equal((await oldRequestSession.request('/bootstrap')).status, 401);
  assert.equal((await anonymous.request('/auth/login', 'POST', { email: user.email, password })).status, 401);
  const newSession = new Client();
  assert.equal((await newSession.request('/auth/login', 'POST', { email: user.email, password: newPassword.trim() })).status, 401, 'Password whitespace remains significant');
  assert.equal((await newSession.request('/auth/login', 'POST', { email: user.email, password: newPassword })).status, 200);
  await owner.ok('/auth/logout', 'POST');
  await newSession.ok('/auth/logout', 'POST');
});
