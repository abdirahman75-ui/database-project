import { expect, test, type BrowserContext, type Page } from '@playwright/test';

test.use({ actionTimeout: 15_000 });

const password = 'ConsulEase2026!';
const runId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
function samplePdf() {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>'];
  let content = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(content)); content += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(content);
  content += `xref\n0 4\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(content);
}
const pdf = samplePdf();

async function navigate(page: Page, name: string) {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: name === 'Notifications' ? /^Notifications/ : name, exact: name !== 'Notifications' }).click();
}

async function login(page: Page, email: string, credential = password) {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(credential);
  await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
}

async function api(context: BrowserContext, path: string, data?: unknown, method = 'POST') {
  const response = await context.request.fetch(`/api/${path}`, { method, data });
  expect(response.ok(), `${method} ${path}: ${response.status()} ${await response.text()}`).toBeTruthy();
  return response.json();
}

async function registerFixture(context: BrowserContext, identifier: string) {
  const email = `browser-${identifier}@example.test`;
  await api(context, 'auth/register', { name: `Browser ${identifier}`, email, password });
  return email;
}

async function uploadFixture(context: BrowserContext, category: string, name: string) {
  const response = await context.request.post('/api/documents', {
    multipart: { category, file: { name, mimeType: 'application/pdf', buffer: pdf } },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).document;
}

async function changeStatus(page: Page, status: string, remark: string, identity = false) {
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Next status/).selectOption(status);
  await dialog.getByLabel(/^Case remarks/).fill(remark);
  if (identity) await dialog.getByRole('checkbox', { name: 'Identity verified during the in-person appointment' }).check();
  const response = page.waitForResponse(res => res.url().includes('/status') && res.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Update case', exact: true }).click();
  expect((await response).ok()).toBeTruthy();
  await expect(dialog.locator('.case-title .badge')).toHaveText(status.toLowerCase().replaceAll('_', ' ').replace(/^./, c => c.toUpperCase()));
}

test('citizen and officer complete a real document, application, clarification, payment and decision workflow', async ({ page, browser }) => {
  test.setTimeout(180_000);
  const identifier = runId();
  const email = `browser-${identifier}@example.test`;
  const citizenName = `Browser Citizen ${identifier}`;
  const passportName = `passport-${identifier}.pdf`;
  const addressName = `address-${identifier}.pdf`;
  const browserErrors: string[] = [];
  page.on('pageerror', error => browserErrors.push(error.message));

  await page.goto('/');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByLabel('Full name', { exact: true }).fill(citizenName);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.locator('form').getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Staff & accounts', exact: true })).toHaveCount(0);

  await navigate(page, 'My profile');
  await page.getByLabel('Phone number', { exact: true }).fill('+60123456789');
  await page.getByLabel('Passport / identity number', { exact: true }).fill(`TEST-${identifier}`);
  await page.getByLabel('Nationality', { exact: true }).fill('Somali');
  await page.getByLabel('Date of birth', { exact: true }).fill('1995-05-20');
  await page.getByLabel('Address in Malaysia', { exact: true }).fill('Synthetic test address, Kuala Lumpur');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Profile updated');

  await navigate(page, 'My documents');
  for (const [category, name] of [['PASSPORT', passportName], ['ADDRESS_PROOF', addressName]]) {
    await page.getByLabel(/^Document type/).selectOption(category);
    await page.getByLabel('Choose document', { exact: true }).setInputFiles({ name, mimeType: 'application/pdf', buffer: pdf });
    const upload = page.waitForResponse(res => res.url().endsWith('/api/documents') && res.request().method() === 'POST');
    await page.getByRole('button', { name: 'Upload document', exact: true }).click();
    expect((await upload).status()).toBe(201);
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }
  await navigate(page, 'Consular services');
  const service = page.locator('article.service-card').filter({ has: page.getByRole('heading', { name: 'Citizen Registration', exact: true }) });
  await service.getByRole('button', { name: 'Apply', exact: true }).click();
  const draftDialog = page.getByRole('dialog', { name: 'Citizen Registration', exact: true });
  await draftDialog.getByLabel('Purpose of application', { exact: true }).fill('Register my current residence with the embassy');
  await draftDialog.getByRole('checkbox', { name: new RegExp(passportName.replaceAll('.', '\\.')) }).check();
  await draftDialog.getByRole('checkbox', { name: new RegExp(addressName.replaceAll('.', '\\.')) }).check();
  const draftResponse = page.waitForResponse(res => res.url().endsWith('/api/applications') && res.request().method() === 'POST');
  await draftDialog.getByRole('button', { name: 'Save draft', exact: true }).click();
  const application = (await (await draftResponse).json()).application;
  await expect(draftDialog).not.toBeVisible();
  await navigate(page, 'My applications');
  await page.getByRole('button', { name: `Open ${application.reference}`, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Submit application', exact: true }).click();
  await expect(page.getByRole('dialog').locator('.case-title .badge')).toHaveText('Submitted');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();

  const staffContext = await browser.newContext();
  const staffPage = await staffContext.newPage();
  staffPage.on('pageerror', error => browserErrors.push(error.message));
  try {
    await login(staffPage, 'officer@consulease.test');
    await expect(staffPage.getByRole('button', { name: 'Staff & accounts', exact: true })).toHaveCount(0);
    await navigate(staffPage, 'Application queue');
    await staffPage.getByLabel('Search applications', { exact: true }).fill(application.reference);
    await staffPage.getByRole('button', { name: `Open ${application.reference}`, exact: true }).click();
    for (const fileName of [passportName, addressName]) {
      const attached = staffPage.getByRole('dialog').locator('.attached-document').filter({ hasText: fileName });
      await attached.getByRole('button', { name: 'Verify', exact: true }).click();
      await expect(attached.locator('.badge')).toHaveText('Verified');
    }
    await changeStatus(staffPage, 'UNDER_REVIEW', 'Reviewing the residence registration documents');
    await changeStatus(staffPage, 'NEEDS_INFO', 'Please clarify your address for this synthetic test');

    await page.reload();
    await navigate(page, 'My applications');
    await page.getByRole('button', { name: `Open ${application.reference}`, exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Edit application', exact: true }).click();
    await page.getByRole('dialog').getByLabel('Additional information', { exact: true }).fill('Address clarification supplied by the citizen');
    await page.getByRole('dialog').getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Submit application', exact: true })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Submit application', exact: true }).click();
    await expect(page.getByRole('dialog').locator('.case-title .badge')).toHaveText('Submitted');
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();

    await staffPage.reload();
    await navigate(staffPage, 'Application queue');
    await staffPage.getByLabel('Search applications', { exact: true }).fill(application.reference);
    await staffPage.getByRole('button', { name: `Open ${application.reference}`, exact: true }).click();
    await changeStatus(staffPage, 'UNDER_REVIEW', 'Clarification received and checked');
    await staffPage.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await navigate(staffPage, 'Payments & receipts');
    await staffPage.getByLabel(/^Application/).selectOption(application.id);
    await staffPage.getByLabel(/^Transaction reference/).fill(`COUNTER-${identifier}`);
    await staffPage.getByRole('button', { name: 'Record payment', exact: true }).click();
    await expect(staffPage.getByRole('status')).toContainText('Payment recorded');
    await expect(staffPage.getByRole('row').filter({ hasText: application.reference }).locator('.badge')).toHaveText('Paid');
    await navigate(staffPage, 'Application queue');
    await staffPage.getByLabel('Search applications', { exact: true }).fill(application.reference);
    await staffPage.getByRole('button', { name: `Open ${application.reference}`, exact: true }).click();
    await changeStatus(staffPage, 'APPROVED', 'All registration requirements met');
    await changeStatus(staffPage, 'READY_FOR_COLLECTION', 'Registration confirmation prepared');
    await changeStatus(staffPage, 'COMPLETED', 'Confirmation delivered to citizen');

    await page.reload();
    await navigate(page, 'My applications');
    const completedRow = page.getByRole('row').filter({ hasText: application.reference });
    await expect(completedRow.locator('.badge')).toHaveText('Completed');
    await navigate(page, 'Payments & receipts');
    const receiptRow = page.getByRole('row').filter({ hasText: application.reference });
    const popupPromise = page.waitForEvent('popup');
    await receiptRow.getByRole('link', { name: 'Receipt', exact: true }).click();
    const receipt = await popupPromise;
    await expect(receipt.getByText(application.reference, { exact: true })).toBeVisible();
    await expect(receipt.getByRole('heading', { name: 'Official payment record', exact: true })).toBeVisible();
    await receipt.close();
    await navigate(page, 'Notifications');
    await expect(page.getByText('Confirmation delivered to citizen', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Mark all as read', exact: true }).click();
    await expect(page.getByText('0 unread', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
    expect(browserErrors).toEqual([]);
  } finally {
    await staffContext.close();
  }
});

test('citizen booking, rescheduling and cancellation lead to staff queue check-in and completed verification', async ({ page, context, browser }) => {
  test.setTimeout(120_000);
  const identifier = runId();
  await registerFixture(context, identifier);
  const passport = await uploadFixture(context, 'PASSPORT', `appointment-passport-${identifier}.pdf`);
  const photo = await uploadFixture(context, 'PHOTO', `appointment-photo-${identifier}.pdf`);
  const bootstrap = await api(context, 'bootstrap', undefined, 'GET');
  const service = bootstrap.services.find((item: any) => item.code === 'PASSPORT');
  const application = (await api(context, 'applications', {
    serviceId: service.id, details: { purpose: 'Synthetic passport appointment verification', passportNumber: `TEST-${identifier}` }, documentIds: [passport.id, photo.id], priority: false,
  })).application;
  await api(context, `applications/${application.id}/submit`, {});
  const staffContext = await browser.newContext();
  try {
    await api(staffContext, 'auth/login', { email: 'officer@consulease.test', password });
    await api(staffContext, `applications/${application.id}/status`, { status: 'UNDER_REVIEW', remark: 'Verification appointment requested' });
    await api(staffContext, `applications/${application.id}/status`, { status: 'APPOINTMENT_REQUIRED', remark: 'Please attend original passport verification' });
    const startsAt = new Date(Date.now() + 86400_000 * 45);
    const first = (await api(staffContext, 'slots', { startsAt: startsAt.toISOString(), capacity: 1, purpose: `Browser first slot ${identifier}` })).slot;
    const second = (await api(staffContext, 'slots', { startsAt: new Date(startsAt.getTime() + 3600_000).toISOString(), capacity: 1, purpose: `Browser second slot ${identifier}` })).slot;
    await page.goto('/');
    await navigate(page, 'Appointments');
    await page.getByLabel(/^Application/).selectOption(application.id);
    await page.getByLabel(/^Available time/).selectOption(first.id);
    await page.getByRole('button', { name: 'Book appointment', exact: true }).click();
    let row = page.getByRole('row').filter({ hasText: application.reference }).filter({ hasText: 'Booked' });
    await expect(row).toContainText(`Browser first slot ${identifier}`);
    await row.getByRole('button', { name: 'Reschedule', exact: true }).click();
    await page.getByLabel(/^New appointment time/).selectOption(second.id);
    await page.getByRole('button', { name: 'Confirm reschedule', exact: true }).click();
    await expect(row).toContainText(`Browser second slot ${identifier}`);
    await row.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('row').filter({ hasText: application.reference }).locator('.badge')).toHaveText('Cancelled');
    await page.getByLabel(/^Application/).selectOption(application.id);
    await page.getByLabel(/^Available time/).selectOption(first.id);
    await page.getByRole('button', { name: 'Book appointment', exact: true }).click();
    row = page.getByRole('row').filter({ hasText: application.reference }).filter({ hasText: 'Booked' });
    await expect(row).toBeVisible();

    const staffPage = await staffContext.newPage();
    await staffPage.goto('/');
    await navigate(staffPage, 'Appointments');
    const active = staffPage.getByRole('row').filter({ hasText: application.reference }).filter({ hasText: 'Booked' });
    await active.getByRole('button', { name: 'Check in', exact: true }).click();
    const checkedIn = staffPage.getByRole('row').filter({ hasText: application.reference }).filter({ hasText: 'Checked in' });
    await expect(checkedIn.locator('.queue-number')).toContainText('#');
    await checkedIn.getByRole('button', { name: 'Complete visit', exact: true }).click();
    await expect(staffPage.getByRole('row').filter({ hasText: application.reference }).filter({ hasText: 'Completed' }).locator('.badge')).toHaveText('Completed');
    await page.reload();
    await navigate(page, 'Appointments');
    await expect(page.getByRole('row').filter({ hasText: application.reference }).filter({ hasText: 'Completed' }).locator('.badge')).toHaveText('Completed');
  } finally {
    await staffContext.close();
  }
});

test('emergency priority application saves its required reason and can be submitted through the portal', async ({ page, context }) => {
  const identifier = runId();
  await registerFixture(context, identifier);
  const documents = [];
  for (const category of ['IDENTITY', 'PHOTO', 'SUPPORTING_LETTER']) documents.push(await uploadFixture(context, category, `${category.toLowerCase()}-${identifier}.pdf`));
  await page.goto('/');
  await navigate(page, 'Consular services');
  const service = page.locator('article.service-card').filter({ has: page.getByRole('heading', { name: 'Emergency Travel Document', exact: true }) });
  await service.getByRole('button', { name: 'Apply', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Emergency Travel Document', exact: true });
  await dialog.getByLabel('Purpose of application', { exact: true }).fill('Emergency return travel after lost passport');
  await dialog.getByLabel('Passport / identity number', { exact: true }).fill(`TEST-${identifier}`);
  await dialog.getByLabel('Reason for urgent processing', { exact: true }).fill('Synthetic test: lost passport and urgent return travel');
  await expect(dialog.getByRole('checkbox', { name: /Request priority processing/ })).toBeChecked();
  for (const document of documents) await dialog.getByRole('checkbox', { name: new RegExp(document.name.replaceAll('.', '\\.')) }).check();
  const response = page.waitForResponse(res => res.url().endsWith('/api/applications') && res.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Save draft', exact: true }).click();
  const application = (await (await response).json()).application;
  expect(application.priority).toBe(true);
  expect(application.details.emergencyReason).toContain('lost passport');
  await expect(dialog).not.toBeVisible();
  await navigate(page, 'My applications');
  await page.getByRole('button', { name: `Open ${application.reference}`, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Submit application', exact: true }).click();
  await expect(page.getByRole('dialog').locator('.case-title .badge')).toHaveText('Submitted');
});

test('administrator publishes a community notice, manages a new officer, and exports database reports', async ({ page, context }) => {
  const identifier = runId();
  await login(page, 'admin@consulease.test');
  await navigate(page, 'Announcements');
  await page.getByRole('button', { name: 'New announcement', exact: true }).click();
  const announcement = page.getByRole('dialog', { name: 'New community announcement', exact: true });
  await announcement.getByLabel('Title', { exact: true }).fill(`Browser community notice ${identifier}`);
  await announcement.getByLabel('Announcement', { exact: true }).fill('A synthetic community notice published through the administrator portal.');
  const saved = page.waitForResponse(res => res.url().endsWith('/api/announcements') && res.request().method() === 'POST');
  await announcement.getByRole('button', { name: 'Save announcement', exact: true }).click();
  const notice = (await (await saved).json()).announcement;
  await expect(page.getByRole('heading', { name: notice.title, exact: true })).toBeVisible();
  await navigate(page, 'Staff & accounts');
  await page.getByRole('button', { name: 'Add staff member', exact: true }).click();
  const staff = page.getByRole('dialog', { name: 'Add staff member', exact: true });
  await staff.getByLabel('Full name', { exact: true }).fill(`Browser Officer ${identifier}`);
  await staff.getByLabel('Email', { exact: true }).fill(`browser-officer-${identifier}@example.test`);
  await staff.getByLabel(/^Temporary password/).fill(password);
  await staff.getByRole('button', { name: 'Create staff account', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: `browser-officer-${identifier}@example.test` });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Deactivate', exact: true }).click();
  await expect(row.locator('.badge')).toHaveText('Inactive');
  await navigate(page, 'Reports');
  await expect(page.getByRole('heading', { name: 'Reports & insights', exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Export CSV', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('consulease-report.csv');
  await api(context, `announcements/${notice.id}`, undefined, 'DELETE');
});

test('the citizen portal remains usable on a phone viewport with no page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Citizen', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Good (morning|day), Amina/ })).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await navigate(page, 'Consular services');
  await expect(page.getByRole('heading', { name: 'How can we help?', exact: true })).toBeVisible();
  const width = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(width.page).toBeLessThanOrEqual(width.viewport + 1);
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await navigate(page, 'My documents');
  await expect(page.getByRole('button', { name: 'Upload document', exact: true })).toBeVisible();
  const docWidth = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(docWidth.page).toBeLessThanOrEqual(docWidth.viewport + 1);
});

test('the profile password form checks confirmation, changes credentials, and keeps the requesting citizen signed in', async ({ page, context }) => {
  const identifier = runId();
  const email = await registerFixture(context, identifier);
  const newPassword = 'BrowserChanged2026!';
  await page.goto('/');
  await navigate(page, 'My profile');
  await page.getByLabel('Current password', { exact: true }).fill(password);
  await page.getByLabel('New password', { exact: true }).fill(newPassword);
  await page.getByLabel('Confirm new password', { exact: true }).fill('DifferentPassword2026!');
  await page.getByRole('button', { name: 'Change password', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'The new passwords do not match.' })).toBeVisible();
  await page.getByLabel('Confirm new password', { exact: true }).fill(newPassword);
  const changed = page.waitForResponse(response => response.url().endsWith('/api/auth/password') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Change password', exact: true }).click();
  expect((await changed).status()).toBe(200);
  await expect(page.getByRole('status')).toContainText('Password changed');
  await expect(page.getByLabel('Current password', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await login(page, email, newPassword);
  await navigate(page, 'My profile');
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email);
});
