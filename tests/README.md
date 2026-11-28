# Tests

## Discussion coverage

Validation and component tests check text limits, protected fields, literal HTML display, author controls, failed-request drafts, confirmation, and pagination. Refreshed props do not silently replace the version an author was editing or reviewing for deletion.

PostgreSQL tests exercise actual membership checks, owner moderation, competing edits, revoked access, pagination, and account/project deletion. HTTP checks use independent cookie jars to post and edit through real sessions, reject unsafe requests, render escaped text, and confirm that removed or disabled users lose access. Local visual and keyboard review remain separate checks.

## Administrator coverage

Account-management tests cover confirmation forms, password hashing, disabled logins, current session-version checks, and old cookies after reactivation. Database tests verify access-change serialization and permanent deletion with shared work preserved. Concurrent project creation cannot leave an unreviewed ownerless project. Deleting an owner during an upload prevents the unfinished file from becoming available. HTTP checks use an independent cookie jar to verify real login, disable/reactivate, reset, and delete behavior.

Unit tests deny anonymous and ordinary accounts before admin actions run, verify the session identity, and keep errors generic. PostgreSQL tests check global lists, search, pagination, selected fields, cross-project downloads, and immediate permission grants/revocations. They confirm regular project permissions still apply to administrators and that public registration rejects isAdmin.

HTTP checks render each admin view using a live session, compare downloaded disk/legacy files, and verify no password hashes or private storage keys appear. Attempted session/registration privilege changes are rejected or ignored, and revoking the database flag blocks that same session. Test fixtures are isolated from development users. Visual/keyboard review remains separate.

Deletion-history tests exercise actual PostgreSQL triggers. They verify file content removal, project/file cascade snapshots without duplicates, transaction rollback, exclusion of pending uploads, and admin-only filtered/paginated reads. HTTP checks delete a fixture file through its normal endpoint, delete its project, and render the name-only history. Fixture cleanup removes history only for each suite's own project IDs.

## File sharing coverage

File validation checks supported extensions and basic signatures, incremental UTF-8 text, unsafe filenames, empty files, and the exact size limit. Request tests require declared sizes and check streamed attachment headers. Disk tests compare hashes after streamed writes/reads and close cancelled downloads. Component tests exercise file selection, retry after failure, upload cancellation, and confirmation before deletion.

PostgreSQL tests use a temporary private upload directory. They verify metadata-only lists, permissions, legacy BYTEA downloads, interrupted transfers, quota release, and membership removal before an upload finishes. Concurrent reservations test both quotas, including a full 2 GiB reservation total without allocating that much file data. Cleanup tests preview and remove stale artifacts while preserving READY files. Temporary directories are removed after each suite.

The production-server HTTP suite covers authenticated uploads/downloads, rejected files, download headers, strict deletion input, cross-origin rejection, and access after removal. It generates a valid 32 MiB ZIP in chunks and compares SHA-256 hashes after downloading it. Set LARGE_ARCHIVE_TEST_MB to a whole number from 1 to 500 to exercise a larger archive; the local verification also passed at 480 MiB. The server uses a separate temporary file directory that is removed after shutdown. Anonymous file routes require login. Real-browser downloads and visual/keyboard review remain separate checks.

The tests cover three levels: individual behaviors, database operations, and requests to a running application. They use a separate test database so development accounts are left alone.

## Unit and UI tests

Run npm.cmd test.

Validation tests use Zod, and password tests use real bcrypt hashing at cost 12. User-service tests mock database operations. Session tests mock getServerSession and redirect. These tests check the decisions made by the code, but they do not establish that PostgreSQL or browser cookies work.

React Testing Library runs the form tests in jsdom with mocked fetch, signIn, and router calls. The cases cover registration success, duplicate-account feedback, a generic login error, project creation/edit submission, pending feedback, accessible field errors, and retaining input after connection failure. Project validation tests cover whitespace/length limits, optional fields, actual calendar dates, and rejecting client identity/role fields. Rate-limit tests use controlled timestamps to check the attempt limits and expiry.

Vitest replaces server-only with an empty module so it can import server code. This replacement is limited to the test configuration and is not used by the application.

The team component tests cover read-only member views, adding by email, removal confirmation and cancellation, pending controls, accessible validation, and retry after a connection failure. HTTP-wrapper tests also check that expected membership errors keep their intended status codes.

## PostgreSQL integration tests

Start the test database and apply its migration:

```powershell
docker compose --profile test up -d --wait db-test
npm.cmd run db:test:setup
npm.cmd run test:integration
```

This suite selects only tests/integration/. It uses Prisma and the PostgreSQL adapter against gpc_test at 127.0.0.1:5434. The tests cover account persistence, password hashes, login, duplicate registration, and two registrations racing for the same email. Project tests cover saved dates/text/roles, rollback after a failed membership insert, unique memberships, member-filtered lists/reads, owner-only edits, clearing optional fields, and foreign-key deletion behavior.

The database guard rejects other hosts, ports, database names, and the development URL. An unavailable test database causes a failure; the suite does not silently skip it. Cleanup removes only the IDs created by the tests. The test database uses temporary storage, so its migration needs to be reapplied after the container is recreated.

Membership tests use actual PostgreSQL operations. They cover normalized email lookup, concurrent duplicate adds, owner-only changes, owner protection, limited roster fields, project isolation, and access after removal or re-adding a member. They do not change development accounts.

## HTTP checks

With the test database ready, run:

```powershell
npm.cmd run build
npm.cmd run test:http
```

The script starts a production-mode server on port 3001 using the test database and a temporary session secret. It sends real requests through the Route Handlers and Auth.js, then stops the server when it finishes.

The checks cover registration, duplicate emails, invalid input, rejected sensitive fields, cross-origin requests, oversized bodies, login, sessions, dashboard access, attempted identity changes through session updates, logout, and a missing page. Auth.js cookies and CSRF handling are used in these checks. Project checks also exercise anonymous endpoints/pages, create/edit validation, exact origin/body limits, owner assignment, member-only listing/read, owner-only updates, tampered URLs, and equivalent missing/inaccessible API responses. They are HTTP tests, not browser end-to-end tests.

Cleanup removes only the script's own projects, memberships, and unique test accounts, with projects removed before users. Never reset the development database or delete all users to run tests. See the [root README](../README.md) for setup and [the implementation report](../docs/IMPLEMENTATION.md) for the dated results.

The project HTTP flow now adds a teammate through the API instead of inserting that membership as a fixture. It checks the roster as owner, member, and outsider; rejects unauthorized changes and owner removal; removes a teammate and verifies that the existing session no longer grants project access; then adds them again. Origin, content type, body size, and strict input checks also cover the membership endpoint.

## Task coverage

Task validation tests check text limits, calendar dates, optional fields, status values, and rejected identity/project fields. Task component tests cover creation and editing, clearing optional details, member controls, confirmation before owner deletion, pending feedback, and preserving entered work after failures.

PostgreSQL task tests exercise collaborative editing, isolated project access, owner-only deletion, assignment constraints, and project cleanup. They also test simultaneous assignment and membership removal: the database either rejects the assignment or clears it when the member is removed. Cross-project assignments and incomplete assignment keys are rejected by database constraints, not just the API.

The HTTP suite includes a task workflow through a running production server. It creates work as a member, changes status, checks owner deletion permissions, rejects unrelated task IDs, and confirms that removed teammates cannot make later requests. These checks do not provide visual browser coverage.

## Progress coverage

Unit/UI tests cover completion percentages, empty projects, due-today boundaries, completed work, and overdue filtering without changing totals. Calendar tests check Central Time day boundaries, daylight-saving changes, and a configured time zone.

PostgreSQL tests calculate summaries from saved tasks and verify changes after editing or deleting work. Membership tests keep other projects private and revoke summary access after removal. HTTP checks exercise the same behavior through the production server, including dashboard progress, past project deadlines, and rejection of a client-supplied calendar override. The local browser review is recorded separately in the Sprint 4 notes.
