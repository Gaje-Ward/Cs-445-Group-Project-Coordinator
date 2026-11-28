# Sprint 6: Project discussion

Sprint 6 implements MVP-06. Open a project and use Discussion to leave a question or record a decision. On wide screens, Discussion sits to the left of the project content; smaller screens stack it below the project sections. Comments appear newest first, with the author's name and posting time. Times follow APP_TIME_ZONE, like the project's due-date indicators.

## Posting and permissions

Current members can post plain text up to 4,000 characters. Whitespace-only comments are rejected. Line breaks are preserved, and HTML is displayed as text. The server takes the author from the session rather than accepting an identity from the form.

Authors can edit or delete their own comments. Project owners can remove other comments after confirmation, but cannot rewrite them. Site administrators still need project membership to use Discussion. Removed or disabled members cannot make later discussion requests.

Comments remain when someone leaves the team. Permanently deleting an account keeps its comments under “Former user.” Deleting the project removes its comments; deletion history does not retain their text.

## Updates and pagination

The discussion shows 25 comments per page. Newer comments and Older comments navigate the list. Posting from an older page returns to the newest comments. Refresh the page to see another member's updates; there is no live subscription.

Editing and deletion submit the version originally reviewed. If someone changes the comment first, the server rejects the stale action. Failed requests keep entered text, and an explicit refresh action lets the user discard a stale edit. Deletion requires confirmation.

## Storage and verification

The additive add_project_comments migration creates Comment with project and optional author relationships. Apply it with npm.cmd run db:deploy. It preserves existing accounts and project work and requires no new dependencies.

All 130 unit/UI tests and 65 PostgreSQL tests passed. Discussion coverage includes permission checks, concurrent edits, pagination, former authors, and project cleanup. Production-server HTTP checks passed for posting, editing, moderation, request validation, escaped text, stale versions, and revoked access. The existing authentication, project, task, file, and administrator checks also passed. Build, lint, and type checks passed.

Local visual and keyboard review remain pending. This increment provides project-level discussion; replies, task-specific threads, rich text, and notifications are not included. Idea voting remains the next MVP feature.
