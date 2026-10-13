# Validation record

Final validation completed on **13 October 2026 (MYT)** against the local **production build** served by `next start` at `http://127.0.0.1:3000`, using persistent PostgreSQL and synthetic test records. This validates production-mode application behavior in the cloud development environment; no live embassy deployment or stakeholder acceptance is claimed.

## Executed checks

| Check | Result |
| --- | --- |
| Frozen dependency installation (`npm ci`) | Passed |
| Reusable database/setup script (`npm run setup`) | Passed; local PostgreSQL, migrations and demonstration data ready |
| Production build (`npm run build`) | Passed |
| TypeScript (`npm run typecheck`) | Passed |
| Dependency audit (`npm audit`) | Passed; zero reported vulnerabilities |
| HTTP API integration (`npm run test:api`) | **12 passed, 0 failed**, 3.20 seconds |
| Chromium user workflows (`npm run test:e2e`) | **6 passed, 0 failed**, 15.4 seconds |
| Production screenshots (`node tests/capture.mjs`) | Five screenshots captured after validation |

Runtime: Node.js 24.19.0, Next.js 16.4.0, Prisma 6.19.3, Playwright 1.64.0 and the cloud environment's installed Chromium. The backend uses PostgreSQL rather than an in-memory test substitute.

## Verified behavior

The twelve API scenarios cover:

1. All eight named proposal service entries, with community announcements implemented as publication.
2. Registration, credential rejection, weak and duplicate registration checks, HTTP-only sessions, cross-origin write protection and credential-hash redaction.
3. Citizen/staff/admin role boundaries and resistance to role escalation.
4. Persistent profiles, real document bytes, signature/MIME and size checks, download fidelity and foreign-owner protection.
5. Required-document submission, foreign attachment rejection, permitted correction/resubmission, decision history and citizen notifications.
6. A simultaneous capacity-one booking race, rescheduling, cancellation, released capacity and staff check-in/completion.
7. Approval prerequisites, a complete decision/collection workflow, staff fee recording, duplicate collection refusal, receipt ownership and protection of completed evidence.
8. Emergency reason requirements, priority fee snapshots, document reuse, administrator-only fee waivers and rejected-document reuse prevention.
9. Three concurrent approval-versus-document-rejection races; exactly one conflicting action succeeds and approved cases retain verified evidence.
10. Service configuration, announcements, disabled staff access and session revocation, final-administrator protections, report totals and CSV export.
11. Server-side logout revocation, including reuse of a copied former session cookie.
12. Current-password and replacement-strength checks, password whitespace preservation, revocation of other sessions and replacement of the requesting session.

The six Chromium scenarios cover:

| Scenario | Observed outcome |
| --- | --- |
| Citizen and officer case processing | Register → profile → upload → draft/submit → verify → clarification/resubmit → payment → approval → ready → complete → receipt → notifications/read → logout |
| Appointment and staff queue | Book → reschedule → cancel/rebook → officer check-in → completed verification |
| Emergency Travel Document | Priority reason and selected reusable documents persist; application submits through the portal |
| Administrator operations | Community notice publication, officer creation/deactivation and report CSV download |
| Phone viewport | Citizen navigation, service browsing and document form remain usable at 390 px with no horizontal page overflow |
| Profile password change | Mismatched confirmation is refused; successful change retains the requesting session and replacement credentials sign in |

Initial browser attempts exposed test-selector assumptions about form hints, select labels, notification counts and Next.js's route announcer. The selectors were corrected; the final complete Chromium run passed. No product failures remain in the executed scenarios.

## Visual evidence

- [Sign-in page](screenshots/login.png)
- [Citizen overview](screenshots/citizen-overview.png)
- [Mobile citizen overview](screenshots/mobile-overview.png)
- [Staff application queue](screenshots/staff-queue.png)
- [Administrator reports](screenshots/reports.png)

## Repeatable checks

Start the development database and application using the README instructions, then run:

```sh
npm run typecheck
npm run build
npm run test:api
npm run test:e2e
```

The HTTP tests default to `http://127.0.0.1:3000`. Set `TEST_BASE_URL` to test another development instance. Playwright uses Chromium, with `CHROMIUM_PATH` available when the browser executable differs from the supplied cloud environment. The API and browser tests require the seeded officer and admin accounts. Playwright also writes an ignored HTML report under `playwright-report/`; failed runs retain screenshots and traces under `test-results/`.

The API suite creates uniquely named test citizens, service configuration, documents, applications, slots, payments and staff fixtures. Test records remain in the development database as evidence of processing; run these tests against a development/test database rather than real embassy records. Test services are disabled after successful completion and test announcements are removed. Existing demonstration users are not modified.

Human UAT remains pending; use `docs/UAT.md` to record acceptance rather than equating automated test success with stakeholder sign-off.
