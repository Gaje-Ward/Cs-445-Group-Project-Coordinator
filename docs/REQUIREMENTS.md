# Requirements

## Scope and users

Group Project Coordinator is for students working on group assignments. The current implementation covers account registration, authentication, and the application foundation. The MVP, advanced features, and integrations below are plans for later work.

## Current functional requirements

| ID     | Requirement                                                               | How it is checked                                                  |
| ------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| S1-F01 | Home, login, register navigation and responsive pages                     | Routes render, accessible labels, browser inspection               |
| S1-F02 | Register with a name, email, and password; save the account               | Real DB integration and HTTP registration                          |
| S1-F03 | Validate input and reject duplicate normalized emails                     | Validation tests, DB unique constraint and race test               |
| S1-F04 | Credentials login creates a session; invalid login gives generic feedback | Unit and HTTP checks                                               |
| S1-F05 | Only signed-in users can open the dashboard                               | Mocked guard and actual HTTP anonymous/authenticated checks        |
| S1-F06 | Logout ends the browser session                                           | HTTP signout and subsequent guard/session checks                   |
| S1-F07 | Safe not-found, loading, and error feedback                               | 404 HTTP check, loading page, forms and error boundary             |
| S1-F08 | Keep password hashes private and reject client changes to identity fields | Response fields, registration validation, session-update HTTP test |

## Current nonfunctional requirements

| ID     | Requirement                                                                                         |
| ------ | --------------------------------------------------------------------------------------------------- |
| S1-N01 | Runs on Windows using Node 24 and documented npm commands                                           |
| S1-N02 | PostgreSQL in Compose uses named persistent storage and binds only to loopback                      |
| S1-N03 | Prisma uses versioned migrations and parameterized operations                                       |
| S1-N04 | Secrets use environment configuration and stay out of Git                                           |
| S1-N05 | Passwords use salted bcrypt cost 12; 12–72 characters, maximum 72 UTF-8 bytes                       |
| S1-N06 | Auth.js manages CSRF for login/logout and session cookies; registration checks origin/body size     |
| S1-N07 | Appropriate unit/UI/DB/HTTP tests, type checking, lint, and build are runnable                      |
| S1-N08 | Code is organized into small components, with notes on major decisions                              |
| S1-N09 | Configuration/source avoids Windows-only application dependencies and hardcoded host paths          |
| S1-N10 | HTTPS and deployment hardening are required before public exposure; deployment is planned for later |

The setup guide uses a Windows path as an example, but the application code does not depend on it. The [implementation report](IMPLEMENTATION.md) records the current rate-limit and dependency limitations.

## Future MVP (planned)

| ID     | Functional requirement                                                   |
| ------ | ------------------------------------------------------------------------ |
| MVP-01 | Create/edit projects with a name, description, and deadline              |
| MVP-02 | Add/remove teammates and check owner/member permissions for each project |
| MVP-03 | Create/assign/update tasks with status, assignee, and due date           |
| MVP-04 | Show project deadlines and progress based on task completion             |
| MVP-05 | Upload/download project files with authorized access and limits          |
| MVP-06 | Comment on project work and show author/time                             |
| MVP-07 | Submit project ideas and vote with one vote per member per idea          |
| MVP-08 | Submit weekly check-ins with progress, blockers, and help requests       |

The MVP must check project membership on every server endpoint and include tests for access across different projects. Growing lists will need pagination. File uploads need size/type limits, and the interface should work with a keyboard. Ubuntu deployment will require HTTPS and tested backups for PostgreSQL and file storage.

Performance and storage targets will be set when there is enough usage data to choose realistic values.

## Advanced features (planned)

Later features may include workload views, task dependencies, blocked-work tracking, notifications, and analytics. The project-health dashboard will use documented rules and show the facts behind each indicator. The rules and data sources need to be defined before building it.

## Optional integrations (planned)

Discord notifications are currently described as an optional project webhook. Webhook secrets would stay on the server, and projects would choose which events to send. Rate limits and failure handling would be part of the implementation.

Another plan describes Discord account linking instead of a webhook. I still need to choose an approach before building the integration.
