# Source Code

The application uses Next.js App Router and TypeScript. Source files are grouped by purpose:

- app/ contains pages, API Route Handlers, and loading/error/not-found views.
- components/ contains the interactive forms and logout button.
- lib/ contains validation and the server-side database, password, and authentication code.
- types/ contains the Auth.js session type extension.
- generated/prisma/ contains the generated Prisma client. It is rebuilt during setup and ignored by Git.

Database and password code stays in server-only modules. Responses and sessions should contain only the user fields the client needs, never a password hash. See [ARCHITECTURE.md](../docs/ARCHITECTURE.md) for the full flow.
