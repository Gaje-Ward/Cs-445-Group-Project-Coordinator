# Sprint 3 — Teammates and tasks

## What changed

The project page now has a Team section. Owners can add an existing account by email and remove ordinary members after a confirmation step. Members can see the roster but cannot change it. The owner's membership cannot be removed.

Adding someone grants access immediately. There is no invitation email or acceptance step. If an email has no account, the form explains that the teammate needs to register first. Duplicate adds return a conflict message without changing membership.

The Tasks section lets current members create and edit work, assign a teammate, and set a due date. Tasks start as To do and can move to In progress or Done. Completed tasks can be reopened. Owners can delete tasks after confirmation; ordinary members cannot delete them.

This covers MVP-02 and MVP-03. Automated verification passed. User-provided screenshots confirmed the desktop project and member views; a complete browser walkthrough remains pending.

## Implementation

The membership service reuses ProjectMember and its unique project/user key. Email normalization matches registration. Only an owner can look up an account for adding to their project, and the server always derives the acting user from the session. No dependencies changed.

GET /api/projects/[id]/members returns names, user IDs, and project roles to authorized members. POST adds an existing user as MEMBER; DELETE removes a MEMBER by userId. Mutations use the existing origin, JSON, and body-size checks. All responses use no-store, and unexpected errors use the existing generic error response.

Adds and removals run in transactions. Concurrent adds use the unique membership key with duplicate skipping, so exactly one succeeds. Removal requires a MEMBER role and checks the acting owner's membership in the delete condition. Owner removal is rejected before deletion. No endpoint changes roles or transfers ownership.

Removal keeps the account and other project memberships intact. Project reads and roster reads consult the database on every request, so the removed person's existing login session does not preserve project access. Information already displayed in an open page is not remotely erased; later requests are denied.

## Task storage and behavior

Migration 20261117060000_add_tasks adds the Task table and TODO/IN_PROGRESS/DONE enum. It applied to both the isolated test database and the existing development database without resetting data.

Tasks require a title of 2–160 characters. Descriptions are optional and limited to 4,000 characters. Due dates are optional calendar dates. Assignments are optional, and only current project members are eligible. Partial edits preserve omitted fields, so changing status does not clear the description or assignment.

The assignee foreign key references ProjectMember, with a database CHECK constraint requiring the membership to belong to the task's project. Removing a teammate clears that assignment while preserving the task and its status. The database constraint also covers assignment requests that race with member removal.

GET/POST on /api/projects/[id]/tasks reads or creates work. PATCH/DELETE on /api/projects/[id]/tasks/[taskId] updates or deletes one task. Reads and writes check current membership, every task ID is scoped to its project, and deletion requires OWNER. Mutations share the project's strict input, origin, and body-size checks.

## Verification

| Check                        | Result                                                 |
| ---------------------------- | ------------------------------------------------------ |
| Unit/UI tests                | 73 passed in 11 files                                  |
| PostgreSQL integration tests | 22 passed in 4 files                                   |
| TypeScript                   | Passed                                                 |
| ESLint                       | Passed                                                 |
| Production build             | Passed with Next.js 16.4.6                             |
| HTTP checks                  | Passed using the isolated test database                |
| Formatting                   | Passed                                                 |
| Visual review                | Desktop screenshots reviewed; full walkthrough pending |

The HTTP checks exercise real Auth.js sessions and a production server. They cover adding by email, duplicate feedback, protected owner membership, limited roster fields, and access after removal. The task workflow includes collaborative edits, status changes, owner deletion, and rejected task IDs from another project. Invalid JSON, unexpected fields, wrong origins, incorrect content types, and oversized input are rejected.

Component tests use mocked HTTP and router calls. They cover pending feedback, confirmation and cancellation, task editing, preserved input after failure, and accessible validation. They do not replace a browser check of the final layout. PostgreSQL tests verify assignment constraints directly and exercise simultaneous task creation and membership removal.

## Remaining work

Complete a browser walkthrough of the Team and Tasks sections, including a narrow screen and keyboard navigation. Task and membership lists do not have pagination or dedicated change rate limits yet; those need review before public deployment. Email verification, invitations, and ownership transfer are not included. No formal accessibility or load testing has been performed.

The next feature is MVP-04 progress summaries. The previously recorded dependency maintenance and deployment work remain open.
