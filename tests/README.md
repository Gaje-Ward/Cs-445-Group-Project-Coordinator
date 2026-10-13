# Tests

The tests cover three levels: individual behaviors, database operations, and requests to a running application. They use a separate test database so development accounts are left alone.

## Unit and UI tests

Run npm.cmd test.

Validation tests use Zod, and password tests use real bcrypt hashing at cost 12. User-service tests mock database operations. Session tests mock getServerSession and redirect. These tests check the decisions made by the code, but they do not establish that PostgreSQL or browser cookies work.

React Testing Library runs the form tests in jsdom with mocked fetch, signIn, and router calls. The cases cover registration success, duplicate-account feedback, and a generic login error. Rate-limit tests use controlled timestamps to check the attempt limits and expiry.

Vitest replaces server-only with an empty module so it can import server code. This replacement is limited to the test configuration and is not used by the application.

## PostgreSQL integration tests

Start the test database and apply its migration:

```powershell
docker compose --profile test up -d --wait db-test
npm.cmd run db:test:setup
npm.cmd run test:integration
```

This suite selects only tests/integration/. It uses Prisma and the PostgreSQL adapter against gpc_test at 127.0.0.1:5434. The tests cover account persistence, password hashes, login, duplicate registration, and two registrations racing for the same email.

The database guard rejects other hosts, ports, database names, and the development URL. An unavailable test database causes a failure; the suite does not silently skip it. Cleanup removes only the IDs created by the tests. The test database uses temporary storage, so its migration needs to be reapplied after the container is recreated.

## HTTP checks

With the test database ready, run:

```powershell
npm.cmd run build
npm.cmd run test:http
```

The script starts a production-mode server on port 3001 using the test database and a temporary session secret. It sends real requests through the Route Handlers and Auth.js, then stops the server when it finishes.

The checks cover registration, duplicate emails, invalid input, rejected sensitive fields, cross-origin requests, oversized bodies, login, sessions, dashboard access, attempted identity changes through session updates, logout, and a missing page. Auth.js cookies and CSRF handling are used in these checks. They are HTTP tests, not browser end-to-end tests.

Cleanup removes only the script's unique test account. Never reset the development database or delete all users to run tests. See the [root README](../README.md) for setup and [the implementation report](../docs/IMPLEMENTATION.md) for the dated results.
