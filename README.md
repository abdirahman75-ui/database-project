# ConsulEase

A working academic prototype for consular services at the Embassy of Somalia in Malaysia, built from the supplied ConsulEase proposal. Next.js and TypeScript provide the citizen portal and staff dashboard; PostgreSQL and Prisma store accounts, documents, cases, appointment queues, payments, notifications, and audit history. Tailwind CSS and a responsive custom stylesheet provide the interface.

The proposal explicitly names eight services. ConsulEase implements seven application workflows plus **Community Announcements**. The later references to nine services are treated as a wording inconsistency.

## Run locally

Prerequisites: Node.js 24 (22+ also supported), npm, and a supported PostgreSQL platform. The included development database starts PostgreSQL 17 on loopback using `embedded-postgres`; no Docker or administrator installation is needed. Use a non-root OS user for the local database.

```sh
cd /workspace/database-project
npm ci
npm run setup
npm run dev
```

`setup` creates a private, ignored `.env` with a randomly generated local database password, starts a persistent database on port **54329**, applies checked-in migrations, and seeds fictional demonstration records. Re-running it preserves accounts, edits, payments, and uploaded files. It does not overwrite an existing `.env`. Open the app on port **3000** from a browser where the server is reachable. Cloud onboarding does not provide a public preview link.

On Windows, open PowerShell in the folder containing `package.json` and use `npm.cmd ci`, `npm.cmd run setup`, and `npm.cmd run dev`. Wait for **Database is ready** before starting the web server. Setup launches the installed Prisma and TypeScript commands directly through Node, so it does not depend on Windows batch-file execution. If using an older downloaded copy that stops after creating configuration, run `npm.cmd run db:migrate` and `npm.cmd run db:seed` to complete database preparation, or update `scripts/setup.mjs` from this repository and rerun setup.

To use an existing database, create `.env` from `.env.example` with your own `DATABASE_URL` before running setup. Required network hosts for a fresh npm/Prisma installation are `registry.npmjs.org` and `binaries.prisma.sh`. Downloads retain TLS and checksum verification.

## Demo accounts

| Role          | Email                   | Local demo password |
| ------------- | ----------------------- | ------------------- |
| Citizen       | citizen@consulease.test | ConsulEase2026!     |
| Staff Officer | officer@consulease.test | ConsulEase2026!     |
| Staff Admin   | admin@consulease.test   | ConsulEase2026!     |

The login page also has demo-role buttons. All seed documents and cases are synthetic. Seed credentials are for an isolated demonstration installation. For a hosted installation, remove demo access, change demo account passwords through **My profile**, and deactivate unused accounts. The seeder never resets an existing password or reactivates a disabled account.

## Supported workflows

- Citizens register, sign in, change their passwords and profile, upload and reuse PDF/JPEG/PNG documents, save/edit drafts, submit applications, follow reference numbers and history, book/reschedule/cancel visits, download receipts, and read notifications and announcements.
- Officers review submitted applications, verify or reject documents with feedback, request missing information, create appointment slots, manage check-in and queue completion, record confirmed cash/bank payments, record an in-person identity check, and make guarded decisions.
- Admins also create/manage staff accounts, configure service fees and document/eligibility/procedure requirements, authorize fee waivers, publish/edit/remove announcements, and review/export operational reports.
- The catalog covers Passport Renewal; Entry Visa Application; Document Attestation / Notarial Certification; Citizen Registration; Visa Support / Reference Letters; Emergency Travel Document; National ID Card Application; and Community Announcements.

An application normally follows **Draft → Submitted → Under review → Approved → Ready for collection → Completed**. Staff may request **Needs info** (citizen edits and resubmits), require an **Appointment**, or reject a case with a reason. Approval checks required documents, the case's saved fee, any required completed appointment, and identity verification. Priority cases require an emergency reason and sort ahead of routine cases. Fee changes affect new drafts; existing case fees are retained. Fees are whole MYR amounts and are illustrative, not official embassy tariffs.

Document downloads and receipts require authentication and ownership or staff access. File size/type validation, secure session cookies, scrypt password hashes, hashed session tokens, same-origin writes, account deactivation, guarded status changes, serializable appointment/payment transactions, and audit records are enforced on the server.

## Validate

Keep a server running, then in another terminal run:

```sh
npm run typecheck
npm run test:api
npm run test:e2e
npm run build
```

API tests exercise the real PostgreSQL-backed HTTP API. Browser tests exercise citizen, officer and admin journeys in Chromium, including mobile navigation. The cloud machine supplies `/usr/bin/chromium`. Elsewhere install Chromium with `npx playwright install chromium` or set `CHROMIUM_PATH` to an existing browser binary. Tests use isolated synthetic fixtures; test cases/audit events remain in the development database as evidence, and temporary service fixtures are disabled after the suite.

For production-mode local verification:

```sh
npm run build
npm run start
# In a second terminal:
npm run test
```

`TEST_BASE_URL` can point both suites at another local test server. Run the tests against a disposable development database. Human stakeholder acceptance remains separate: [UAT checklist](docs/UAT.md). See [validation evidence](docs/VALIDATION.md) and [architecture and API](docs/ARCHITECTURE.md).

## Persistence and restart

`.data/postgres` stores the local cluster and `.data/uploads` stores private files; `.env` and these directories are ignored by Git. Preserve both database and uploads together. The database process can be restarted with `npm run db:start` if needed; `npm run setup` automatically reuses a reachable database. Application processes must restart after a cloud snapshot restore. `npm run setup`, then `npm run dev` or `npm run start` restores the workflow; do not create a separate Git worktree for an already isolated cloud task.

`npm run db:migrate` applies migrations and `npm run db:seed` refreshes missing demo fixtures. Neither command drops the database. Cloud installation and startup instructions are saved separately in the environment configuration for review; saving them does not publish a snapshot.

## Integration and hosting boundaries

This is a functional prototype with **in-app notifications, staff-recorded payments, and staff-recorded in-person verification**. It does not send email/SMS, charge cards, capture biometric data, verify document authenticity automatically, or issue real passports/visas. Those functions require embassy policies and authorized providers. No connection to a live embassy system is implied.

For hosting, use a managed PostgreSQL database, persistent private document storage, HTTPS, an `APP_ORIGIN` matching the public domain, `COOKIE_SECURE=true`, and a private database connection. Set `NODE_ENV=production`, apply migrations, then run the production build and server behind an HTTPS reverse proxy. Demo-role shortcuts and accounts must be disabled before accepting real applicants. Use managed backups and verify restoration of the database together with uploaded files. Distributed authentication throttling, malware scanning, external notification/payment providers, official fees and workflows, and security/privacy review remain work for a real embassy deployment. This repository has not been deployed publicly.
