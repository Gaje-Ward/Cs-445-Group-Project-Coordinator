# Architecture

## Application structure

Group Project Coordinator is one Next.js application. App Router pages provide the interface, and Route Handlers provide the server endpoints. Keeping both in one project makes the application easier to manage as a solo developer.

Most pages are React Server Components. The registration/login forms and logout button are Client Components because they need browser interaction. Tailwind CSS handles styling.

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

## Registration and authentication

Registration trims the name and lowercases/trims the email address. Passwords are left unchanged. They must have 12–72 characters and fit within 72 UTF-8 bytes, which prevents bcrypt from silently truncating a multibyte password. bcryptjs generates a fresh salt and hashes the password at cost 12.

The User table has a unique email constraint. The service checks for an existing account and also handles Prisma's P2002 error, since two registrations can pass the first check at the same time. Neither the response nor the session contains passwordHash.

For login, the credentials provider loads the account and compares the password with its stored hash. A missing account still performs a dummy-hash check to reduce timing differences. Invalid credentials get a generic message, and database errors are not returned to the client.

A successful login places the verified id, name, and email in an encrypted JWT session that lasts up to eight hours. Auth.js manages the cookies and CSRF protection for login/logout. Local HTTP development uses the local cookie settings; an HTTPS NEXTAUTH_URL enables secure cookies. NEXTAUTH_SECRET must remain private.

The dashboard calls requireUser on the server. If the session has no valid user identity, the request redirects to /login before dashboard content is rendered. Next.js may send that redirect in a streamed response body rather than as HTTP 307, so the HTTP tests check both forms.

Logout removes the browser's session cookie. It does not centrally revoke a stolen JWT, which can remain valid until expiry. Password reset, email verification, account disabling, and central revocation have not been implemented.

Credentials login does not create users automatically; registration stores them explicitly. JWT sessions do not need an Auth.js database adapter or Account, Session, and VerificationToken tables. The JWT callback ignores client session-update data, and the session callback returns only the user's id, name, and email. There is no endpoint for changing roles or other protected account fields.

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

Later models, such as Project, Membership, Task, and Comment, will reference User. Those additions will need foreign keys and authorization checks for each project. The current schema only contains the User model. Stored user records must not be sent directly to the client because they contain passwordHash.

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
