# Requirements

## Scope and users

Group Project Coordinator is for students working on group assignments. The current implementation covers account registration, authentication, MVP-01 project creation/viewing/editing, MVP-02 teammate management, MVP-03 tasks, and MVP-04 progress summaries. Files, comments, and the other backlog features remain planned.

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

## Project requirements — MVP-01

- Signed-in users can create projects with a name, optional description, and optional deadline. The server trims text, requires a 2–120 character name, limits descriptions to 2,000 characters, and validates real calendar dates. Unknown fields are rejected.
- Creating a project also creates its OWNER membership in the same transaction. A failed membership insert leaves no project behind.
- Users see only projects they belong to, including a helpful empty dashboard. Members can read a project; only owners can edit it. Every page and endpoint checks the session and permissions on the server.
- Missing and inaccessible projects produce the same not-found response. Anonymous pages redirect to login; anonymous API requests return 401.
- Memberships have OWNER/MEMBER roles and a unique project/user key. User deletion is restricted while memberships exist, and project deletion cascades only its memberships.
- Create/edit forms have labels, pending states, field errors, connection feedback, and success links. Server errors do not reveal internal details.

MVP-01 results and test evidence are in [SPRINT_2.md](SPRINT_2.md). The membership model supports these checks, but teammate invitations and membership changes are not part of this sprint.

## Teammate requirements — MVP-02

- Project members can see a roster of teammate names and project roles. Outsiders cannot read it. Responses exclude account emails and password hashes.
- Only owners can add registered users by email. Email input follows the same normalization rules as registration. Unknown accounts receive a helpful error; extra identity or role fields are rejected.
- Adding a person gives them the MEMBER role. The unique project/user key prevents duplicates, including simultaneous requests. Adding the owner again cannot change their role.
- Only owners can remove ordinary members. Removing the owner is rejected. Removal affects only the named project and keeps the user's account intact.
- Every roster read and membership change checks current membership in the database. A removed user loses access to project pages, project APIs, and the roster on subsequent requests. Their dashboard no longer lists the project.
- Membership mutations require JSON from the configured origin and share the existing 16 KiB body limit. Authorization uses the server session, never a client-supplied actor or role.
- Owners get an email form and a removal confirmation. Pending and error feedback is accessible, and failed requests preserve entered values. Members get a read-only roster.

This increment reuses the existing schema and needs no database migration. Email invitations, role changes, and ownership transfer remain outside its scope. Automated checks passed; visual review is still pending. See [SPRINT_3.md](SPRINT_3.md).

## Task requirements — MVP-03

- Current project members can create tasks with a required title of 2–160 characters. Descriptions are optional and limited to 4,000 characters. Due dates are optional real calendar dates, stored as PostgreSQL DATE. Empty optional fields become null.
- Status is To do, In progress, or Done. New tasks default to To do. Members can reopen completed work, edit task details, change assignments, and clear optional fields. A status-only update preserves the other fields.
- Assignees must be current members of the same project. A database constraint enforces this even if assignment races with teammate removal. Removing a member clears their assignments without deleting the tasks.
- Task reads and writes use the session identity and check project membership. A task ID from another project cannot be read through the project's list or changed through its endpoints. Former members lose access on subsequent requests.
- Only project owners can delete tasks. The interface requires confirmation. Removing a task does not affect another project's data.
- Mutation requests require JSON from the configured origin, share the 16 KiB body limit, and reject extra fields such as client identity, project ID, or role. Expected input and assignment errors give useful feedback without exposing database details.
- Forms have labels, pending states, and field feedback. Connection failures preserve entered work. The task list offers a direct status control; deletion controls appear only for the owner.

Automated checks passed. Browser layout and keyboard review remain pending. Task dependencies, attachments, and comments are not part of this increment.

## Progress requirements — MVP-04

Dashboard cards and project pages show completed tasks out of all tasks, the rounded completion percentage, remaining work, and overdue counts. Empty projects stay at zero and show a helpful message. The project page also shows the in-progress count.

An unfinished task is overdue only when its due date is before the server's current calendar day. Completed, undated, and due-today tasks are excluded. The Overdue only filter changes the visible list without changing the project summary. A past project deadline shows “Deadline passed” independently of task completion.

Summaries use membership-scoped saved data and refresh after task changes. All members use one server calendar, defaulting to America/Chicago and configurable through APP_TIME_ZONE. Stored DATE values are not shifted between time zones. Other tabs and pages left open overnight need a refresh. See [SPRINT_4.md](SPRINT_4.md) for automated checks and the local browser review.

## MVP status

| ID     | Functional requirement                                                   |
| ------ | ------------------------------------------------------------------------ |
| MVP-01 | Create/view/edit projects with ownership; implemented/verified           |
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
