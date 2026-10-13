import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const origin = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
const directory = 'docs/screenshots';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  headless: true, args: ['--no-sandbox'],
});
async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true, animations: 'disabled' });
  console.log(`${directory}/${name}.png`);
}
try {
  const citizenContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const citizen = await citizenContext.newPage();
  await citizen.goto(origin);
  await citizen.getByRole('button', { name: 'Citizen', exact: true }).waitFor();
  await capture(citizen, 'login');
  await citizen.getByRole('button', { name: 'Citizen', exact: true }).click();
  await citizen.getByRole('navigation', { name: 'Main navigation' }).waitFor();
  await capture(citizen, 'citizen-overview');
  await citizen.setViewportSize({ width: 390, height: 844 });
  await capture(citizen, 'mobile-overview');
  await citizenContext.close();

  const staffContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const staff = await staffContext.newPage();
  await staff.goto(origin);
  await staff.getByRole('button', { name: 'Officer', exact: true }).click();
  await staff.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Application queue', exact: true }).click();
  await staff.getByRole('heading', { name: 'Application queue', exact: true }).waitFor();
  await capture(staff, 'staff-queue');
  await staffContext.close();

  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const admin = await adminContext.newPage();
  await admin.goto(origin);
  await admin.getByRole('button', { name: 'Admin', exact: true }).click();
  await admin.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Reports', exact: true }).click();
  await admin.getByRole('heading', { name: 'Reports & insights', exact: true }).waitFor();
  await capture(admin, 'reports');
  await adminContext.close();
} finally {
  await browser.close();
}
