# Group Project Coordinator

## Team Member

- Gaje Ward — solo developer, CS445 Software Engineering I.

## Interface design

The website's visual design and page layouts were created with OpenAI Codex, an AI coding assistant.

## Project Abstract

Group Project Coordinator is a web application for students working on group assignments. The planned features include shared projects, tasks, files, idea voting, and weekly check-ins. A project-health dashboard will help teams spot overdue work, blockers, and requests for help.

The application provides email/password authentication and project creation, viewing, and owner-only editing. Owners can add registered users to their projects and remove members. Teammates can create tasks and update assignments, due dates, and status.

## Current status

Sprint 1 authentication was verified on October 8, 2026. Sprint 2 adds project creation, membership-based viewing, and owner-only editing. The project migration has been applied without resetting existing development data. See [Sprint 2 results](docs/SPRINT_2.md) for the October 12 checks. The application has not been deployed.

Sprint 3 adds teammate management and tasks. Open a project to use its Tasks and Team sections. As the owner, enter a teammate's registered email address to add them. Members see the shared project on their dashboards; removing them revokes access on subsequent requests. The owner cannot be removed. See [the Sprint 3 notes](docs/SPRINT_3.md) for verification results and remaining work.

Use Add task to enter a title and optional description, then choose an assignee and due date if needed. Any current member can edit tasks or move them between To do, In progress, and Done. Only the owner can delete tasks, with confirmation. Removing a teammate leaves their tasks in the project as unassigned work.

Sprint 4 adds progress summaries to dashboard cards and project pages. Unfinished tasks with a past due date are marked overdue; use Overdue only to focus the task list. Work due today is not overdue. A past project deadline shows “Deadline passed.” See [the Sprint 4 notes](docs/SPRINT_4.md) for the rules and verification results.

Due-date indicators use Central Time for everyone. Set APP_TIME_ZONE to another valid IANA time zone if needed, then restart the app. Refresh an open page to pick up another member's changes or a new calendar day.

Sprint 5 adds a Files section to each project. Members can upload PDF, TXT, PNG, JPEG, ZIP, or DOCX files and download shared work. Files are limited to 512 MB each, with 2 GB and 100 files per project. The uploader or project owner can delete a file after confirmation. Uploads and downloads stream through private disk storage. Apply migrations with npm.cmd run db:deploy before opening project pages. See [the Sprint 5 notes](docs/SPRINT_5.md) for storage choices, limits, and verification.

Site administrators can review all registered users, projects, and uploaded files at /admin. Grant an existing account access with npm.cmd run admin:account -- admin@example.com from a trusted local terminal. This keeps its current password. Administrator permissions are checked in the database on every admin request. See [the admin guide](docs/ADMIN.md) for provisioning, access rules, and verification.

The admin dashboard also keeps deletion history for projects and files. It retains names and project context without retaining file contents. Tracking begins with the deletion-history migration; earlier deletions cannot be recovered.

Use Manage user in the Users tab to disable/reactivate accounts, reset passwords, or permanently delete an account. Disabling and password resets invalidate old sessions. Permanent deletion keeps shared work and requires confirming ownership transfer for any projects the account owns. Your administrator account is protected from self-lockout. See the admin guide before using permanent deletion.

See [the implementation report](docs/IMPLEMENTATION.md) for the results and remaining work, and the [dependency audit](docs/DEPENDENCY_AUDIT.md) for the unresolved package findings.

Sprint 6 adds Discussion to project pages. Members can post comments and edit their own text; authors and project owners can delete comments after confirmation. Comments show author names and posting times, with older discussions available through pagination. Apply migrations with npm.cmd run db:deploy before trying it. See [the Sprint 6 notes](docs/SPRINT_6.md) for permissions and verification.

## Technology stack

Versions recorded during the initial setup on October 8, 2026:

| Component                              | Installed version  |
| -------------------------------------- | ------------------ |
| Node.js / npm                          | 24.21.0 / 11.19.0  |
| Next.js / React                        | 16.4.0 / 19.3.0    |
| TypeScript / Tailwind CSS              | 5.9.3 / 4.3.3      |
| Auth.js (stable next-auth package)     | 4.24.15            |
| Prisma CLI, Client, PostgreSQL adapter | 7.10.0             |
| PostgreSQL image                       | postgres:17-alpine |
| Zod / bcryptjs                         | 4.6.5 / 3.0.3      |
| Vitest / React Testing Library         | 5.0.3 / 16.3.3     |
| ESLint / Next.js ESLint config         | 9.39.5 / 16.4.0    |
| Docker Engine / Compose                | 29.8.1 / 5.5.1     |

The lockfile records the installed versions. At setup, Prisma 8 was a release candidate, so the project used Prisma 7. ESLint 9 remains installed because the Next.js plugins checked during the review did not support ESLint 10. Its deprecation warning is included in the dependency audit.

## Prerequisites

- Windows with [Node.js LTS](https://nodejs.org/en/download) (Node 24), Git, and [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/).
- Docker Desktop running with Linux containers and the WSL 2 backend.
- A **Windows PowerShell** terminal opened in the repository. A Windows Node installation does not install Node inside Ubuntu/WSL.
- Ports 3000 (application), 5433 (development DB), and optionally 5434 and 3001 (tests) must be available.

## Local Windows setup

```powershell
Set-Location 'C:\Users\Gaje\Desktop\Cs 445 Group project cord'
node --version
npm.cmd --version
docker --version
docker compose version
npm.cmd ci
npm.cmd run env:setup
docker compose up -d --wait db
npm.cmd run db:generate
npm.cmd run db:deploy
npm.cmd run dev
```

Open **http://localhost:3000**, create an account, and log in to reach the dashboard. The dashboard lists your projects and has Create project and Log out controls. A project can have a name (2–120 characters), an optional description (up to 2,000 characters), and an optional calendar deadline. Its creator becomes the owner and can edit it; members can view it. Port 5433 is for PostgreSQL connections; the website runs on port 3000.

The setup script creates an ignored .env file with random local credentials. If the file already exists, it leaves it alone.

You can also copy .env.example to .env and replace the placeholders yourself. To generate a secret, run:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Keep the generated secret private. Use the same PostgreSQL password in POSTGRES_PASSWORD, DATABASE_URL, and TEST_DATABASE_URL. If it contains special URL characters, encode them in the connection URLs; the setup script avoids this by generating a hex password.

NEXTAUTH_URL should match the address used in the browser, normally http://localhost:3000. NEXTAUTH_SECRET protects the sessions. Secrets must not use the NEXT_PUBLIC_ prefix, which exposes values to client code.

FILE_STORAGE_PATH selects the private upload directory, defaulting to .data/project-files. Local .data files are ignored by Git. Keep uploads outside public/ and .next/. Back up the upload directory with PostgreSQL; both are needed to restore shared files. Existing small database uploads remain supported. Run npm.cmd run files:cleanup to preview stale transfers and orphaned files; add -- --apply to remove those older than 24 hours. This maintenance command is not scheduled automatically.

Once PostgreSQL has initialized its volume, changing POSTGRES_PASSWORD in .env does not update the database password. Keep the configuration matched to the existing database, or change the database password deliberately. Deleting the volume would erase its data.

Stop the app with Ctrl+C. Use docker compose stop db to stop the database while keeping its data. The down -v option deletes the volume and should only be used when that data loss is intended. Stop the app before reinstalling dependencies to avoid Windows file locks.

## Commands

| Command (prefix with npm.cmd run)     | Purpose                                                            |
| ------------------------------------- | ------------------------------------------------------------------ |
| dev                                   | Local development server on localhost:3000                         |
| build                                 | Generate Prisma client and create production build                 |
| start                                 | Run the built application locally                                  |
| typecheck                             | TypeScript validation                                              |
| lint                                  | ESLint checks                                                      |
| test                                  | Unit/UI tests; mocked persistence and session APIs                 |
| test:watch                            | Watch unit tests                                                   |
| test:integration                      | Real dedicated-database tests                                      |
| test:http                             | Built-server HTTP authentication/project checks on port 3001       |
| db:generate                           | Generate ignored Prisma client                                     |
| db:deploy                             | Apply existing migrations, without resetting data                  |
| db:migrate -- --name descriptive_name | Create/apply a new development migration                           |
| db:studio                             | Inspect local data; treat hashes and user information as sensitive |
| format / format:check                 | Format/check source and documentation                              |

To try the production build locally, stop the development server, run npm.cmd run build, and then npm.cmd run start. Keep the local app and database private.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
npm.cmd test
npm.cmd run build
docker compose --profile test up -d --wait db-test
npm.cmd run db:test:setup
npm.cmd run test:integration
npm.cmd run test:http
```

Database and HTTP tests use gpc_test at 127.0.0.1:5434. They reject the development URL and remove only their own test records. The test database uses temporary storage, so rerun db:test:setup after recreating its container.

The HTTP script starts its own server on port 3001 and stops it afterward. That port must be free. An unavailable test database causes a failure rather than a skipped test. The [test guide](tests/README.md) explains which tests use mocks.

## Authentication and security

Registration validates the input on the server, lowercases email addresses, and rejects duplicates through a PostgreSQL constraint. Passwords are hashed with bcrypt at cost 12. They must contain 12–72 characters and no more than 72 UTF-8 bytes so bcrypt cannot silently truncate them. Passwords are not trimmed, and their hashes are never included in registration responses or sessions.

Auth.js handles email/password login and encrypted JWT sessions, which last up to eight hours. Registration stores users through Prisma; this session strategy does not need the Auth.js Account, Session, or VerificationToken tables.

Auth.js handles CSRF protection for login and logout. Registration accepts JSON from the configured origin, limits the body to 4 KiB, and limits request attempts. Login attempts are also limited. These limits live in one application process and will need shared storage before running multiple instances. Auth.js manages HttpOnly/SameSite cookies and enables secure cookies when the configured URL uses HTTPS. Deployment will require HTTPS.

## Project access

Pages and API endpoints use the signed-in session identity. The server filters project lists and reads by membership and allows edits only through an OWNER membership. Inaccessible and missing projects receive the same not-found response. Project mutation endpoints require JSON from the configured origin, enforce a 16 KiB body limit, and reject client identity or role fields. Database errors return a generic message.

Project creation and its owner membership use one database transaction. Memberships are unique per project/user. Owners can add existing accounts by email and remove ordinary members; members cannot change the team. The roster shows names and project roles without sharing account emails or password hashes. Adding someone gives them access immediately; this is not an email invitation or an acceptance workflow.

Deleting a project cascades its memberships; deleting a user with any membership is restricted. There is no project deletion or ownership-transfer interface yet. Deadlines use PostgreSQL DATE and display as YYYY-MM-DD, with no time zone conversion; past dates are allowed.

## Repository layout

```text
src/app/                  Pages and Route Handlers
src/components/           Interactive authentication and project forms
src/lib/                  Validation, persistence, passwords, auth, sessions
src/types/                Session type extension
prisma/schema.prisma      Account, project, membership, task, file, and comment schema
prisma/migrations/        Versioned SQL migrations
scripts/                  Safe env/test setup and HTTP verification
tests/unit/               Isolated logic and UI tests
tests/integration/        Real PostgreSQL tests
docs/                     CS445 planning and architecture
compose.yaml              Local persistent DB and optional isolated test DB
PROCESS.md                Solo development workflow
```

The docs/, src/, and tests/ directories each have a short guide. Git ignores .env, .next, node_modules, and src/generated; .env.example is the safe configuration template to commit.

## Planning and deployment

- [Process](PROCESS.md)
- [Requirements](docs/REQUIREMENTS.md)
- [Prioritized backlog](docs/BACKLOG.md)
- [Implementation results and remaining work](docs/IMPLEMENTATION.md)
- [Dependency audit](docs/DEPENDENCY_AUDIT.md)
- [Architecture and future Ubuntu deployment](docs/ARCHITECTURE.md)

Ubuntu deployment is planned for later. The initial implementation did not add an application Dockerfile or change homelab services, reverse proxies, or Cloudflare configuration.
