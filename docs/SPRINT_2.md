# Sprint 2 — Projects and ownership

## Scope

MVP-01 adds project creation, viewing, and editing. The dashboard lists only projects the signed-in user belongs to. The creator gets an OWNER membership; MEMBER can read, but only OWNER can edit. Teammate invitations, membership changes, tasks, and other features remain planned.

Development took place on the feature/projects branch, based on the Sprint 1 checkpoint at 1f59e38.

## Database changes

Migration: `20261013042558_add_projects_and_memberships`.

It adds Project, ProjectMember, and the OWNER/MEMBER enum. Project includes an ID, name, optional description/deadline, and timestamps. ProjectMember uses a compound primary key on projectId/userId to prevent duplicate memberships, with a userId index for project lookup.

Creating a project and its owner membership uses one transaction. Foreign keys restrict deleting users with memberships and cascade memberships when their project is deleted. No delete or role-change endpoint is provided. Future membership removal must preserve a project's owner deliberately.

The named migration applied to the existing development database without a reset. It also applied to the isolated test database. Existing User data was left alone. Deadlines use PostgreSQL DATE and display as YYYY-MM-DD; past dates are accepted.

## Validation and access

Names are trimmed and must contain 2–120 characters. Descriptions are optional, trimmed, and limited to 2,000 characters. Deadlines are optional real calendar dates. Empty optional fields become null, and unknown fields are rejected.

All pages and APIs use the server session identity. Reads filter by membership; edits include OWNER membership in the database write predicate. Inaccessible and missing projects share a not-found response. Anonymous pages redirect to login, and anonymous API requests return 401.

Project mutation requests require JSON from the configured origin and enforce a streamed 16 KiB body limit. Unexpected errors return a generic message. Responses are not cached and never include passwords, user records, or other memberships. Forms show saving, field errors, connection failure, and success feedback.

## Verification — October 12, 2026

| Check                  | Result                                                             |
| ---------------------- | ------------------------------------------------------------------ |
| TypeScript             | Passed                                                             |
| ESLint                 | Passed                                                             |
| Formatting             | Passed                                                             |
| Unit/UI                | 53 tests passed in 8 files                                         |
| PostgreSQL integration | 7 tests passed in 2 files                                          |
| Production build       | Passed                                                             |
| HTTP smoke             | Passed: existing auth checks plus project authorization/validation |
| Browser                | Passed: checks below                                               |

Unit/UI tests validate input and form behavior with mocked HTTP/router calls, and verify that unexpected database/authentication errors return safe generic responses. Integration tests use real PostgreSQL and check persistence, automatic ownership, rollback after a failed membership insert, unique memberships, member filtering, owner edits, and deletion constraints. HTTP tests use real sessions, cookies, CSRF login/logout, and a running production build. They also check anonymous access, client identity/role rejection, origin/body limits, and denied reads/writes.

Browser checks ran in Edge against a local production build, using temporary accounts in the separate test database. They covered:

- Anonymous create/edit pages redirect to login.
- A new owner's dashboard shows No projects yet.
- A whitespace-only name shows server field feedback.
- Creating a project saves its name, description, and deadline and shows success.
- The detail page shows the saved values and Owner role.
- Editing saves revised text, shows success, and updates the detail page and dashboard.
- An unrelated project URL and edit URL show Project not found without project details.
- A member sees only the shared project, can read it, has no edit link, and cannot open its edit URL.
- The edit form fits a 390 × 844 viewport; keyboard Tab moves from the name to the description field.

Temporary test accounts and the test server were cleaned up after verification. Database and HTTP tests remove only records created by those tests in gpc_test.

The migration requires Docker and PostgreSQL to be running. The Prisma schema was formatted with prisma format; other files use Prettier. This sprint introduced no dependency changes.

## Limitations and next work

- There are no teammate invitations, membership/role changes, project deletion, or ownership transfer yet. MEMBER behavior is verified using test-created memberships.
- Project lists are not paginated, and project creation has no quota or dedicated rate limit yet. These need review before larger use or deployment.
- A streamed not-found page may have HTTP 200 even though its content is denied; project APIs return 404 for missing/inaccessible IDs.
- No formal accessibility audit, load testing, or deliberate database-outage browser test was performed. Connection-error UI is covered with mocked fetch failures.
- The Sprint 1 dependency advisories and authentication/deployment limitations remain open. This sprint did not rerun the dependency audit or deploy the app.

The next feature is MVP-02: teammate management. SEC-01, the dependency maintenance work, must also be completed before public deployment.

## Files changed

- README.md; docs/README.md; docs/REQUIREMENTS.md; docs/BACKLOG.md; docs/ARCHITECTURE.md; docs/IMPLEMENTATION.md; docs/SPRINT_2.md; tests/README.md.
- prisma/schema.prisma; prisma/migrations/20261013042558_add_projects_and_memberships/migration.sql.
- src/lib/project-validation.ts; src/lib/project-service.ts; src/lib/projects.ts; src/lib/project-http.ts.
- src/app/api/projects/route.ts; src/app/api/projects/[id]/route.ts.
- src/components/project-form.tsx; src/app/dashboard/page.tsx; src/app/page.tsx; src/app/globals.css.
- src/app/projects/new/page.tsx; src/app/projects/[id]/page.tsx; src/app/projects/[id]/edit/page.tsx; src/app/projects/loading.tsx; src/app/projects/not-found.tsx.
- tests/unit/project-validation.test.ts; tests/unit/project-form.test.tsx; tests/unit/project-http.test.ts; tests/integration/projects.test.ts.
- scripts/http-smoke.ts; scripts/project-http-checks.ts.
