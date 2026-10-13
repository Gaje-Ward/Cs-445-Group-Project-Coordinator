# Development Process

Group Project Coordinator is my solo project for CS445 Software Engineering I. I work on it one feature at a time, keeping each change small enough to understand and test. I handle planning, development, testing, and review, with feedback from course demonstrations and the instructor.

## Planning the work

Before starting a feature, I review [the backlog](docs/BACKLOG.md), choose the next priority, and check its acceptance criteria. I break larger features into tasks that can usually be finished in one to three hours and focus on one implementation task at a time.

The amount of work I take on depends on classes and deadlines. During busy weeks, I reduce the scope. I start with features that other work depends on. For example, login needs to work before I add project membership.

## Requirements and backlog

[REQUIREMENTS.md](docs/REQUIREMENTS.md) describes what the application should do and the constraints it needs to meet. [BACKLOG.md](docs/BACKLOG.md) tracks the stories, priorities, acceptance criteria, and statuses.

The backlog uses Planned, In progress, Implemented/verified, and Blocked. Future features stay Planned until their criteria are met. Priorities can change when feedback or available time changes.

## Version control

I use short-lived branches, such as feature/projects, to keep feature work separate from main.

I keep commits small and include the code, tests, and documentation for each change. I include the package lockfile and database migrations in Git, but leave out secrets and generated files. Before publishing, I review the changes and check that .env is ignored.

## Testing

While working on a feature, I run the tests related to it. Before calling it finished, I run type checking, linting, the unit/UI tests, and a production build. Database changes also need the PostgreSQL tests, and login changes need the HTTP checks.

I keep track of which tests use mocks and which use a real database or server. Database tests use the separate test database and remove only their own records. I leave development accounts alone and record any failed or unfinished checks.

For documentation changes, I check formatting and links. For visual changes, I check the pages in a browser.

## Work-session notes

At the end of a work session, I note what changed, what comes next, and anything blocking progress. I update the backlog as tasks are completed or plans change.

## Reviewing completed work

I check each completed feature against its acceptance criteria. For login, that means starting the app and database, registering, logging in, opening the dashboard, logging out, and checking that the dashboard is protected.

I record test results and remaining problems in [the implementation notes](docs/IMPLEMENTATION.md). I add instructor feedback to the backlog so I can plan when to address it.

I also note what I could improve next time. Setting up Node and Docker took longer than expected, so I plan to check the tools before estimating the next feature.

## Definition of Done

A story is ready for review when:

- Its acceptance criteria are met.
- Input, permissions, and sensitive data are handled appropriately.
- The relevant tests, type checks, lint, and production build pass.
- Setup and architecture documentation reflects the change.
- Known limitations are recorded and the diff has been reviewed.

The application foundation also requires the app to start on Windows, connect to PostgreSQL, apply its migration, and support registration, login, logout, password hashing, and a protected dashboard. Work stays incomplete until those checks pass.
