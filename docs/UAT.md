# ConsulEase user acceptance testing

This checklist maps the proposal's citizen, staff officer, and staff administrator responsibilities to observable behavior. Run it in a development installation using fictional records and harmless sample files. A reviewer should record the result, evidence and any defect for each scenario. The checklist is provided for acceptance testing; a human stakeholder has not signed it off merely because automated tests pass.

## Preparation

1. Follow the README setup instructions and start the web application.
2. Use separate browser sessions for citizen and staff accounts so roles stay distinct. Seeded demonstration accounts are `citizen@consulease.test`, `officer@consulease.test`, and `admin@consulease.test`; the local demonstration password is `ConsulEase2026!`.
3. Prepare a genuine PDF or PNG/JPEG test file and an invalid text file renamed to `.pdf`. Do not upload personal identity documents into a development environment.
4. Note the service's requirements, fees and whether it requires an appointment or identity verification before starting a case.

## Acceptance scenarios

| ID | Role / scenario | Steps | Expected result |
| --- | --- | --- | --- |
| U01 | Citizen registration and authentication | Create a new citizen account, sign out, sign in again, then try an incorrect password | Profile persists; valid credentials sign in; incorrect credentials do not create a session |
| U02 | Role isolation | Sign in as a citizen and attempt a staff/admin URL or API operation | Staff operations are refused by the server and citizen navigation contains permitted functions |
| U03 | Profile | Change phone, address, nationality and identity details; reload | Updated profile remains visible without changing the role |
| U04 | Service catalog | Inspect all eight named entries, document requirements, fees, eligibility and procedures | Seven consular application services and community announcements are represented; applicable in-person requirements are clear |
| U05 | Valid document upload | Upload a PDF and a supported image with document categories; download them | Documents appear in the reusable library and downloaded bytes match the uploaded file |
| U06 | Invalid document upload | Upload an unsupported file or text renamed to `.pdf` | Upload is rejected with an actionable message; it is not treated as a valid passport |
| U07 | Document ownership | Sign in as a second citizen and try to access the first citizen's document URL | The foreign document remains inaccessible |
| U08 | Draft application | Select a service, enter purpose/details, save a draft, reload and edit | A persistent draft with a tracking reference is available to its owner |
| U09 | Required documents | Try submitting the draft without a required category, then attach appropriate documents | Incomplete submission is refused; complete submission enters Submitted |
| U10 | Document reuse | Start a second application and select an existing document | The same document can be attached without uploading another copy |
| U11 | Application ownership | Try changing the first citizen's application from a second citizen session | The foreign case cannot be edited or booked by the second citizen |
| U12 | Officer document review | Verify a document, reject another with a clear reason | Review status and remarks are recorded and visible to the citizen |
| U13 | Information request | Start review, request clarification, amend and resubmit as the citizen | Case moves Under Review → Needs Info → Submitted; the reason and all stages remain in history |
| U14 | Appointment booking | Book an available slot for an eligible submitted case | Booking shows time in Malaysia time, reference and queue number; capacity decreases |
| U15 | Capacity and conflicts | Attempt two bookings for a slot with one remaining place | Only one succeeds; the other gets a conflict and capacity is not exceeded |
| U16 | Reschedule and cancel | Move a citizen booking to another slot, then cancel it | New time appears; the former capacity is released; cancellation frees the occupied place |
| U17 | Officer queue | Check in a booked citizen and complete the verification appointment | Attendance stages update and the queue identifies the correct citizen/application |
| U18 | Approval prerequisites | Attempt approval before required document review, identity, appointment completion or payment | The server prevents approval and states the missing prerequisite |
| U19 | Payment and receipt | Record cash or a bank transfer, view the receipt, then try recording the fee twice | Payment amount matches the case's fee; receipt includes the reference; duplicate collection is refused |
| U20 | Admin waiver | Try a waiver as an officer, then authorize it as admin with a reason | Officer request is refused; admin waiver is distinguished from collected revenue and satisfies the case's fee prerequisite |
| U21 | Complete processing | Satisfy prerequisites, approve, mark ready for collection and complete | Valid stages appear in tracking and history with actor, time and remark |
| U22 | Emergency priority | Create an Emergency Travel Document application using priority processing | Priority is visible to staff and the fee uses the configured priority rate |
| U23 | Notifications | Change a case status or appointment; sign in as its citizen and mark notifications read | New in-app notification appears only for the affected citizen; read state persists |
| U24 | Admin service configuration | Change fees/requirements for a test service and disable it | New applications reflect the configuration; existing case fees retain their snapshot; a disabled service cannot accept a new case |
| U25 | Staff account management | Create a test officer, disable it, then try logging in with that account | Role is enforced; disabled account cannot establish a session |
| U26 | Administrator protection | Attempt to disable or demote the final active administrator | The request is refused and administration remains accessible |
| U27 | Community announcements | Publish, edit and remove an announcement as admin; inspect citizen view | Published content appears, edits are reflected and deleted/unpublished content is absent |
| U28 | Reports | Review totals, services, revenue, status/priority information and export CSV | Reports reflect stored cases and payments; CSV downloads and opens correctly |
| U29 | Logout | Sign out and revisit the portal; attempt use of the former session cookie | Authenticated data is unavailable and the former server session has been revoked |
| U30 | Mobile navigation | Use the citizen portal at a narrow phone viewport, including service, document and application forms | Content remains readable and usable; menus and primary actions are reachable without horizontal page scrolling |
| U31 | Password change | Enter mismatched confirmation, correct it, change a test account's password, then try a second existing session and sign in with the replacement password | Mismatch is refused; successful change keeps the requesting session and revokes others; only the new password signs in |

## Acceptance record

| Field | Record |
| --- | --- |
| Reviewer and role | Pending |
| Date and tested version / commit | Pending |
| Browser / device | Pending |
| Passed scenario IDs | Pending |
| Failed scenario IDs and defect links | Pending |
| Retest result | Pending |
| Acceptance decision | Pending stakeholder review |

Email/SMS alerts, real card payments, physical biometric capture and automated authenticity checks are outside the configured prototype. In-person identity checks and received payments are recorded by authorized staff. These integration boundaries should be considered when reviewing acceptance against the proposal.
