# Sprint 4: Project progress

Sprint 4 implements MVP-04. Dashboard cards now show task completion, remaining work, and overdue counts. The Tasks section shows the same summary and lets members filter the list to overdue work. Filtering leaves the overall progress unchanged.

## How progress works

Completion is the number of Done tasks divided by all tasks, rounded to a whole percent. A project without tasks stays at zero and shows an empty-state message. Reopening or deleting a task changes the summary after the page refreshes.

An unfinished task is overdue only when its due date is before today. Work due today, undated work, and completed tasks are not overdue. A past project deadline is labeled “Deadline passed”; it does not determine whether the project is complete.

Everyone uses the same server calendar, Central Time by default. APP_TIME_ZONE can select another IANA time zone. Stored due dates remain calendar dates without a time zone conversion. Pages display the calendar being used.

## Access and storage

Summaries use only projects the signed-in user belongs to. The project-list query selects task status and due date for counting, then returns the summary without exposing the task records. The task-list endpoint also returns progress and the server calendar. Existing membership checks still apply.

No schema migration or dependency update is needed. Progress is calculated from saved tasks rather than stored separately.

## Verification

The unit/UI suite passed 86 tests, and the PostgreSQL suite passed 25 tests. Coverage includes empty projects, completed and reopened tasks, due-date boundaries, daylight-saving changes, filtering, and access after teammate removal. Production-server HTTP checks passed for summaries, status/date edits, deletion, deadline labels, and project isolation.

Type checking, lint, and the production build passed. Formatting passed for the changed files; the repository-wide check still flags formatting in older, unchanged files. The local browser review confirmed the progress display and overdue behavior. The filter checkbox alignment was corrected after that review and accepted. A full keyboard review remains pending.

## Limits

Saving a task refreshes the current project. Other open tabs and a page left open overnight need a refresh to pick up changes. There are no live updates or scheduled notifications. Large projects will need pagination and performance review; this increment does not establish a load target.
