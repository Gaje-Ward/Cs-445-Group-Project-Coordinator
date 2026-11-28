# Architecture

## Application structure

Group Project Coordinator is one Next.js application. App Router pages provide the interface, and Route Handlers provide the server endpoints. Keeping both in one project makes the application easier to manage as a solo developer.

Most pages are React Server Components. The registration/login/project forms and logout button are Client Components because they need browser interaction. Tailwind CSS handles styling.

The source is organized into:

- src/app/ for pages and API routes.
- src/components/ for interactive UI.
- src/lib/ for validation, database access, passwords, authentication, and the session guard.
- src/types/ for the Auth.js session type extension.
- prisma/ for the schema and SQL migration.

The generated Prisma client is ignored by Git and rebuilt during setup and build.

## Requests from the interface

The registration form sends JSON to POST /api/register. The handler checks the origin, content type, 4 KiB body limit, request rate, and input schema before calling the user service. Prisma then creates the account. The response is not cached and includes only the user's id, name, and email.

The login form calls Auth.js signIn, and the logout button calls signOut. Their requests go through /api/auth/[...nextauth]. Database access, password functions, and secrets stay in server-only modules so they cannot be imported into client code. Successful login sends the user to the dashboard.

## Project requests

The dashboard calls the project service directly after requireUser. The /projects/new, /projects/[id], and /projects/[id]/edit pages also require a session; detail pages check membership, and edit pages require OWNER. Missing and inaccessible records share a not-found view. Loading UI may start streaming before the check finishes, so page-level not-found can arrive with HTTP 200; the API always returns 404. No project details are included in the denied page.

The project form sends POST /api/projects or PATCH /api/projects/[id]. GET on those paths lists the caller's projects or reads one authorized project. Every handler obtains identity from getServerSession. Mutations require JSON, exact configured Origin, and a streamed body of at most 16 KiB. Zod rejects extra fields and invalid values. Responses use no-store and return generic 503 messages for unexpected errors.

Deadlines are optional calendar dates, stored at UTC midnight through PostgreSQL DATE and displayed as YYYY-MM-DD. They may be in the past. Empty optional values become null. React renders names/descriptions as text.

## Teammate requests

The project page loads a member roster after checking project access. The Team client component renders names and roles for members and shows add/remove controls only to owners. It sends POST or DELETE to /api/projects/[id]/members, then refreshes the server-rendered page after success. GET on the same endpoint reads the roster.

The member service checks the acting owner's membership before looking up an email or changing the team. Adds normalize the email through the registration schema, assign MEMBER, and use the unique membership key to reject duplicates even under concurrent requests. Removals require MEMBER and include the acting owner's membership in the delete condition. Attempts to remove an owner return a conflict response.

The roster selects only userId, name, and project role. It does not return account email addresses or password hashes. Mutations share the project's strict origin, JSON, and 16 KiB input checks. Extra client identity and role fields are rejected. Existing sessions lose access on subsequent reads after membership removal because permissions come from the database rather than the JWT.

No schema change is needed. Email invitations, role changes, and ownership transfer are not implemented. Lists are not paginated, and membership changes do not yet have a dedicated rate limit.

## Task requests and storage

Task routes are nested under /api/projects/[id]/tasks. GET lists tasks for a member and POST creates one. PATCH and DELETE on /api/projects/[id]/tasks/[taskId] change a task or remove it. Every operation checks the current membership from the server session. Members can create and edit work; deletion requires OWNER. Task IDs are always scoped to their project.

Tasks store a title, optional description and due date, and a TODO/IN_PROGRESS/DONE status. Status-only edits preserve the other fields. Dates use the same calendar-date validation as project deadlines. The interface refreshes the server-rendered task list after successful changes and keeps unsaved form values after errors.

The add_tasks migration creates the Task table, status enum, and indexes. Its project foreign key cascades cleanup when a project is deleted. Assignees reference the compound ProjectMember key through nullable assigneeProjectId/assigneeId fields. A SQL CHECK constraint requires that key to match the task's project or be entirely null. Deleting a membership sets both assignment fields to null, preserving the task. The duplicate project field lets PostgreSQL clear an assignment without clearing the task's required projectId.

The public task response includes the assignee's display name, but does not return the internal assignment project key, account email, or password hash. Foreign-key conflicts caused by concurrent teammate removal give a safe assignment message. Mutation requests use the existing origin, JSON, and body-size checks.

## Registration and authentication

Registration trims the name and lowercases/trims the email address. Passwords are left unchanged. They must have 12–72 characters and fit within 72 UTF-8 bytes, which prevents bcrypt from silently truncating a multibyte password. bcryptjs generates a fresh salt and hashes the password at cost 12.

The User table has a unique email constraint. The service checks for an existing account and also handles Prisma's P2002 error, since two registrations can pass the first check at the same time. Neither the response nor the session contains passwordHash.

For login, the credentials provider loads the account and compares the password with its stored hash. A missing account still performs a dummy-hash check to reduce timing differences. Invalid credentials get a generic message, and database errors are not returned to the client.

A successful login places the verified identity and its session version in an encrypted JWT that lasts up to eight hours. The session callback checks the current database account status/version and returns safe identity fields. Invalidated or deleted accounts cannot authorize protected requests. Auth.js manages login/logout cookies and CSRF protection. Local HTTP development uses local cookie settings; an HTTPS NEXTAUTH_URL enables secure cookies. NEXTAUTH_SECRET must remain private.

The dashboard calls requireUser on the server. If the session has no valid user identity, the request redirects to /login before dashboard content is rendered. Next.js may send that redirect in a streamed response body rather than as HTTP 307, so the HTTP tests check both forms.

Logout removes the browser's session cookie. Administrative disabling and password resets increment a database session version, invalidating existing tokens on subsequent protected requests. Reactivation requires a fresh login. Email verification and self-service email-based password recovery remain unimplemented.

Credentials login does not create users automatically; registration stores them explicitly. JWT sessions do not need an Auth.js database adapter or Account, Session, and VerificationToken tables. The JWT callback ignores client session-update data, and the session callback returns only the current user's safe identity. Privileged account changes use separate administrator endpoints.

## Database

PostgreSQL stores the User model:

| Field                 | Purpose                                       |
| --------------------- | --------------------------------------------- |
| id                    | Unique cuid identifier                        |
| name                  | Display name, up to 80 characters             |
| email                 | Unique normalized email, up to 254 characters |
| passwordHash          | Salted bcrypt hash                            |
| createdAt / updatedAt | Timezone-aware account timestamps             |

The initial migration creates the table and its unique email index. The Prisma PostgreSQL adapter uses pg for parameterized database operations. A lazily initialized, cached Prisma client avoids creating repeated connection pools during development reloads.

The CLI reads its connection settings from prisma.config.ts and the environment. The application passes DATABASE_URL to its runtime adapter.

Project stores a cuid ID, name (VARCHAR 120), optional description (VARCHAR 2000), optional deadline (DATE), and created/updated timestamps. ProjectMember has a compound primary key on projectId/userId, an index on userId, and an OWNER/MEMBER enum. These relationships support many projects per user and many members per project.

The add_projects_and_memberships migration only adds the enum, tables, indexes, and foreign keys. It does not change or delete existing User records. Deleting a project cascades its memberships. Deleting a user with memberships is restricted so an owner cannot disappear accidentally. There is no project-deletion endpoint yet. Membership-management endpoints allow owners to add registered accounts and remove only ordinary members; ownership cannot be removed or transferred.

The project service creates a project with a nested OWNER membership inside a transaction. Lists and individual reads filter by session user membership; only the caller's role is selected, without other members' identities. Edits use an OWNER membership predicate in updateMany inside a transaction, then return the saved public project fields. A zero-row edit and an inaccessible read use the same ProjectNotFoundError. No client user ID determines authorization. Stored User records are never sent directly to the client because they contain passwordHash.

## Progress summaries

Project lists select task status and due date only for projects the session user belongs to. The service calculates counts and removes the selected task records from its response. GET /api/projects returns these summaries with the server calendar; GET /api/projects/[id]/tasks returns its authorized task list with the same summary fields and calendar.

A shared pure helper calculates completion and overdue counts for the server and task component. The server supplies today's calendar date, using APP_TIME_ZONE or America/Chicago by default. Database DATE values remain unchanged. The task filter uses the full task list for totals and a separate filtered list for display. Saving work refreshes the page data; there is no live cross-tab update. This feature needs no database migration.

## Project files

ProjectFile stores metadata, a generated disk storage key, and a PENDING/READY/DELETING state. New file bytes stream to FILE_STORAGE_PATH, outside public/ and build output. Existing small BYTEA uploads remain supported without a reset. List queries return READY metadata only, without storage keys. Downloads authorize membership before opening a file stream. Deletion combines membership and uploader/owner checks, marks the record DELETING, then removes its disk file and metadata. Project deletion cascades records; maintenance recovers orphaned disk files. Deleting an uploader account sets its reference to null.

GET /api/projects/[id]/files lists metadata. POST accepts an application/octet-stream body with encoded X-File-Name and declared X-File-Size headers. A transaction locks the project row and reserves quota before reading the stream. Pending and deleting records count toward the 2 GiB/100-file quota; each file may be at most 512 MiB. Streaming validation enforces actual byte counts and signatures. Backpressure limits buffering, with two active uploads per process and a 30-minute transfer deadline. Membership is checked again before marking the stored file READY. Failed transfers remove their disk data before releasing quota.

GET /api/projects/[id]/files/[fileId] returns a streamed, uncached attachment with an encoded filename and nosniff header. DELETE accepts an empty JSON object through the existing origin/body checks. No endpoint interprets a filename as a path. Archives are not extracted or scanned for malware. The cleanup command previews or removes reservations and orphaned files older than 24 hours while protecting READY files. Backups must cover both PostgreSQL and disk storage consistently. Production still needs persistent storage, proxy body limits/timeouts, and a maintenance schedule.

## Project discussion

Comment belongs to a project and optionally to its author. The project relationship cascades deletion; the author relationship becomes null when an account is deleted. Responses select comment text, version, timestamps, and the author's display name without exposing account emails or password hashes.

The comments service checks active membership inside each transaction. It locks the user before the project, matching the order used by account deletion and uploads, then holds the membership row during the operation. Authors can edit their own comments; authors and project owners can delete. Administrator status does not bypass these checks.

GET and POST /api/projects/[id]/comments list and create comments. PATCH and DELETE /api/projects/[id]/comments/[commentId] require the version originally reviewed. Conditional writes increment the version on edits and reject stale actions with HTTP 409. Mutations reuse the JSON origin and body-size checks. Lists return bounded pagination metadata and 25 comments ordered newest first.

The project server page formats timestamps in the configured application time zone. ProjectDiscussion renders plain text and preserves drafts after failed requests. Refreshing retrieves other members' changes; the feature does not use live subscriptions. See [Sprint 6](SPRINT_6.md).

## Site administration

User.isAdmin defaults to false and is independent of project roles. A trusted local provisioning command grants or revokes it; public registration cannot set it. Admin permissions are read from the database for each request, rather than stored as authorization claims in the JWT. The admin API wrapper and services both verify the session user's current flag. The dashboard conditionally links to /admin after the same lookup.

The /admin server page and GET /api/admin expose paginated, searchable users/projects/files. Explicit selects exclude password hashes and storage keys. GET /api/admin/files/[fileId] authorizes global administrator read access before using the existing attachment streaming behavior. Regular project routes retain membership checks, even for administrators. Account-management routes are authorized separately, including the confirmed ownership transfer used during account deletion. See [ADMIN.md](ADMIN.md).

## Account management

User.isActive defaults to true and sessionVersion defaults to zero. Login rejects disabled accounts; every protected request resolves a current active identity with a matching token version. Capturing the version during password verification prevents an earlier password check from producing a valid session after a reset. Existing version-zero tokens remain compatible until revoked.

PATCH /api/admin/users/[userId] changes supported display/access fields. POST to its /password route hashes the new password and increments sessionVersion. DELETE requires the target email, and an explicit ownership-transfer confirmation when needed. Management transactions take an advisory lock and recheck the acting administrator. Self-lockout and removal of the final active administrator are blocked by the web controls.

Account deletion locks the target user before checking ownership. Owned projects are transferred to the acting administrator before memberships and the user record are removed in the same transaction. Shared files retain their content with a null uploader; membership deletion clears task assignments. Upload reservations use the same user-before-project lock order, and finalization checks active membership. Ordinary project permissions remain enforced outside these management actions.

## Deletion history

DeletionRecord keeps bounded names, original record/project identifiers, optional project names, and deletion timestamps. It has no file bytes, storage keys, or foreign keys back to records that can disappear. Unique kind/source identifiers deduplicate cascade events. PostgreSQL DELETE triggers record shared file names and snapshot project/file names before a project cascade removes the source rows. Pending uploads are excluded. History writes participate in the deletion transaction, so failed/rolled-back deletions do not leave false entries.

The admin history view uses the existing current-permission guard, search, type filtering, and 25-row pagination. It offers no download or restore operation. Disk cleanup remains independent of lightweight history retention. Triggers do not backfill earlier deletions or log administrative TRUNCATE operations.

## Local development and tests

Node runs on Windows, while PostgreSQL runs in Docker Compose. The development database binds to 127.0.0.1:5433. Its named volume, cs445-coordinator_postgres_data, keeps accounts across container restarts. A health check confirms that PostgreSQL is ready.

The ignored .env contains local database credentials and the session secret. .env.example contains placeholders and can be committed. The setup script creates random values for a fresh checkout and leaves an existing .env alone.

Tests use a separate gpc_test database on 127.0.0.1:5434 with temporary storage. The test guard rejects other hosts, ports, names, and the development URL. Database tests use real Prisma/PostgreSQL, and HTTP tests start a built server on port 3001 with a temporary session secret. Cleanup removes only records created by those tests. Unit tests mock database/session APIs while still using real password hashing.

## Security choices and limits

Registration uses a strict input schema, so a client cannot supply an id, role, or passwordHash. It also requires JSON and an Origin that exactly matches NEXTAUTH_URL; requests without an Origin are rejected.

Request limits use hashed keys in a bounded map:

- 10 login attempts per normalized email within 15 minutes.
- 60 login authorization attempts across the process per minute.
- 20 registration attempts per minute.

Failed attempts count toward the limit. The map resets when the process restarts and is not shared by multiple servers. Shared storage and an IP-aware policy will be needed before deployment. Proxy headers should not be trusted without a clear proxy configuration.

Login messages avoid directly revealing whether an account exists. Duplicate registration does reveal that an email is already registered, as required by the registration requirements. Dummy hashing reduces timing differences but does not guarantee identical response times.

Passwords, tokens, and database URLs are not logged. Auth.js logging uses error codes only. The unresolved dependency findings are explained in [DEPENDENCY_AUDIT.md](DEPENDENCY_AUDIT.md); some dependency issues remain unresolved.

## Future Ubuntu deployment

The deployment plan is to build a multi-stage Node 24 image and run it as a non-root user. If Next.js standalone output is chosen, its server files and static/public assets will need to be copied into the runtime image.

The app and database should use a private Compose network, with the application connecting to the database service name instead of localhost. PostgreSQL should not publish a host port. A separate migration job will run prisma migrate deploy using the checked-in schema and migrations before the app starts serving traffic.

Production will need its own secrets, database, public HTTPS NEXTAUTH_URL, shared rate limits, and tested backup/restore procedures. Future file storage will also need backups. The reverse proxy and server configuration will be part of the deployment setup.

The application has not been deployed, and the server configuration has not been changed.

## References

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), plus the guides installed under node_modules/next/dist/docs.
- [Auth.js v4 credentials](https://next-auth.js.org/providers/credentials) and [server sessions](https://next-auth.js.org/configuration/nextjs).
- [Prisma 7 configuration](https://www.prisma.io/docs/orm/v7/reference/prisma-config-reference) and [PostgreSQL adapter](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql).
