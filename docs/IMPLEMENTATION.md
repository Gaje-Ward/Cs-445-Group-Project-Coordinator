# Foundation and Authentication

## Goal

Get the application running on Windows with a persistent PostgreSQL database, email/password authentication, useful tests, and setup documentation.

## Starting point

The repository initially contained the project description and basic documentation. This implementation added the application, database setup, authentication, and tests.

## What works so far

| Task                   | Acceptance criteria                                                                                        | Result on October 8                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Application foundation | App Router, TypeScript, Tailwind, homepage, navigation, Windows startup                                    | Implemented; homepage returned HTTP 200                                  |
| Database               | Private Compose PostgreSQL, persistent volume, User model, initial migration                               | Implemented; migration applied to development and test databases         |
| Authentication         | Validated registration, password hashing, duplicate rejection, login/logout, sessions, protected dashboard | Implemented and checked with unit, database, and HTTP tests              |
| Interface              | Home, register, login, dashboard, loading/error feedback, missing-page handling                            | Implemented; desktop layout and signed-out redirect checked in a browser |
| Verification           | Tests, types, lint, and production build                                                                   | Passed on October 8; details below                                       |
| Documentation          | Setup, process, requirements, backlog, architecture, and implementation report                             | Written; later features remain marked as planned                         |

The application was verified locally on October 8 and has not been deployed. The dependency findings still need follow-up.

## How it was built

The app uses Next.js 16.4.0 and React 19.3.0 on Node 24.21.0. Prisma 7.10.0 was selected because the registry's Prisma 8 version was a release candidate at setup. The installed Auth.js/NextAuth 4.24.15 package supports Next.js 16 and awaits its cookies, headers, and route params APIs.

Registration creates a Prisma User explicitly. Login uses the credentials provider with eight-hour JWT sessions, so additional Auth.js account/session tables are not needed. bcryptjs 3.0.3 hashes passwords with fresh salts at cost 12. Passwords must be 12–72 characters and at most 72 UTF-8 bytes.

Email addresses are normalized to lowercase and protected by a unique database constraint. Responses and sessions return public identity fields only. Registration checks the origin and JSON body size; Auth.js handles CSRF for login/logout. Request limits are held in one application process, and the dashboard checks its session on the server.

The development database uses loopback port 5433 and a named volume. Tests use a separate database on loopback port 5434 with temporary storage.

## Verification — October 8, 2026

| Check                                  | Result                                   | What was checked                                                                                      |
| -------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Windows npm development startup        | Passed                                   | Next.js starts on 127.0.0.1:3000                                                                      |
| Homepage HTTP and browser              | Passed                                   | Homepage and navigation load                                                                          |
| DB Compose health and Prisma migration | Passed                                   | Real PostgreSQL connectivity; initial migration applies                                               |
| Unit/UI suite                          | 25 passed, 5 files                       | Zod validation, real bcrypt, mocked service/session decisions, rate limits, UI feedback               |
| Dedicated database suite               | 2 passed, 1 file                         | Real persistence/login/hashes and concurrent uniqueness                                               |
| Built-server HTTP smoke                | Passed                                   | Real registration/login/logout/session/dashboard/404 and rejected unsafe registration/session updates |
| TypeScript                             | Passed                                   | Application, scripts, and tests type-check                                                            |
| ESLint                                 | Passed, zero warnings/errors after fixes | Source checks                                                                                         |
| Production build                       | Passed                                   | Optimized Next.js application and generated Prisma client                                             |
| Desktop browser anonymous dashboard    | Passed                                   | Actual browser arrives at /login with no dashboard content                                            |
| Dependency audit                       | 8 high-severity entries remain           | Maintenance follow-up required; see below                                                             |

The 25 unit/UI tests mock database and session APIs, while password hashing is real. The two database tests use PostgreSQL, and the HTTP checks use a running application with real Auth.js cookies and CSRF handling. Tests remove only their own records from the separate gpc_test database.

The dependency review repeated installation from the lockfile, type checking, lint, unit/UI tests, database tests, the production build, and HTTP checks. Those checks passed. The first npm ci attempt failed because the running dev server held a Windows native-file lock; stopping that project's server allowed the retry to finish. Stop the app before reinstalling dependencies.

The dependency review reused the existing database containers and left the dev server stopped. It did not repeat the browser checks. All results in this section are from October 8, 2026. See [DEPENDENCY_AUDIT.md](DEPENDENCY_AUDIT.md) for the dependency details.

## Dependency follow-up

The audit reported eight high-severity entries related to braces and deepmerge-ts. Several packages share the same two dependency problems. Three Prisma-related entries also appeared in the production-only audit.

The existing mysql2 3.24.5 override addressed an earlier dependency issue. The later review made no new dependency changes. At that review, braces had no published patch, and deepmerge-ts required a major update outside Prisma's pinned range. The review deferred major overrides or framework downgrades for further compatibility testing. ESLint 9.39.5 is deprecated, but the checked Next.js plugins did not support ESLint 10 peers.

SEC-01 tracks this work before public deployment. The [audit](DEPENDENCY_AUDIT.md) contains the package paths, advisory links, and reasons for deferral.

## What still needs work

- Project management, memberships, tasks, files, comments, voting, check-ins, workload views, dependencies, project health, notifications, analytics, and Discord are still future work.
- Email verification, password reset, account disabling, and central JWT revocation are not implemented. Logout removes the browser cookie; a stolen token can remain valid until it expires.
- Request limits reset on restart and are not shared between application instances. Deployment will need shared limits and HTTPS.
- Ubuntu deployment is planned. The app still needs a Dockerfile and deployment setup.
- Browser checks covered the desktop layout and signed-out navigation. There is no automated real-browser login suite or formal accessibility audit.
- The error fallback exists, but a database outage was not deliberately tested. Load and performance targets have not been set yet.

## Completion checklist

- [x] Application starts on Windows and the homepage renders.
- [x] PostgreSQL connects and its migration applies without a reset.
- [x] Registration, login, and logout work through real HTTP requests.
- [x] Passwords are hashed and their hashes stay out of responses/sessions.
- [x] Signed-out dashboard access redirects to login.
- [x] Setup and course documentation are available.
- [x] Unit/UI, database, and HTTP checks pass.
- [x] Type checking, lint, and the production build pass.
- [ ] Application and initial migration saved in Git.
- [ ] Dependency maintenance completed before public deployment.

## What I learned

The initial implementation produced a working entry page and authentication flow backed by PostgreSQL. The setup and migration were verified on Windows, and test records stayed separate from development accounts.

Environment setup took time at the start. Checking Node, Docker, and terminal access before estimating the next feature should avoid that delay. The next work should focus on dependency maintenance, projects, membership permissions, and basic tasks.
