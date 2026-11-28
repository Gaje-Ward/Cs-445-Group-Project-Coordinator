# Site administration

An administrator can open /admin to review registered accounts, projects, and uploaded files. Lists are searchable and paginated with 25 rows per page. The project list links to that project's files. Available files can be downloaded through an admin-only endpoint, including files in projects the administrator has not joined. Pending and deleting records are visible but cannot be downloaded.

The Users tab includes Manage user controls for account access, display names, and administrator permissions. It also supports password resets and permanent account deletion. Ordinary project routes still enforce membership and project ownership.

## Managing accounts

Expand Manage user beside an account. Disabling it blocks new logins and invalidates its existing sessions. Reactivation allows a fresh login; old cookies stay invalid. The account's memberships and work remain available to its teams.

To reset a password, enter the new password twice and confirm that existing sessions will end. The same password policy used during registration applies. The server stores a salted hash and returns no password in its response. Share the new password securely with the user. Disabled accounts must be reactivated before sign-in. Resetting your own password returns you to login.

Permanent deletion requires typing the account's email and confirming that it cannot be restored. Projects and shared files are kept. If the account owns projects, explicitly confirm transferring those projects to your administrator account. Transfer and account deletion occur in one database transaction. A changed ownership count requires another review before proceeding. Removing the account clears its team memberships and task assignments; its uploaded files remain with a Former user label.

The web controls prevent self-disable, self-demotion, and self-deletion. Access changes are serialized and checked again in the transaction to protect the final active administrator. Changes require the configured Origin, bounded JSON input, and current administrator permission. Ordinary accounts cannot submit management actions.

## Deletion history

The Deletion history tab keeps deleted project and file names with the project context and deletion date. Search by name or filter the list to projects or files. These records contain no file contents, storage keys, or document previews and cannot be downloaded or restored. Records are retained until deliberately removed through trusted database maintenance.

Tracking starts when the deletion-history migration is applied. Already deleted names cannot be recovered. Database triggers record DELETE operations, including file rows removed with a project. The history survives removal of the original records and rolls back if the deletion transaction rolls back. Unfinished/failed uploads are excluded, and cascade handling avoids duplicate file entries.

Normal file deletion removes its stored content. Disk files left by a project cascade still follow the existing orphan-cleanup process described in the Sprint 5 notes. The history itself only retains small metadata records.

## Granting access

Site administration uses the User.isAdmin flag, separate from OWNER/MEMBER project roles. Existing users default to ordinary access. Grant an existing account access from a trusted local terminal:

```powershell
npm.cmd run admin:account -- admin@example.com
```

This preserves the account's existing password. The Admin dashboard link appears on its regular dashboard. The same login works at /admin without waiting for the session to expire.

Add --revoke to remove administrator access. Add --create with an unused email to create a separate administrator account with a generated password. New login details are written to a private, Git-ignored .data/admin-login-*.txt file; they are not printed in logs or committed. Keep those details private.

Public registration rejects administrator, activation, and session-version fields. Existing active administrators can grant or remove access in Manage user. The local provisioning command remains available to trusted operators for setup and recovery.

## Permission checks

Admin requests use the signed-in session identity, then check the current database flag. Permission is not taken from browser input, query parameters, or a client-editable session role. Services repeat the check before querying global records or downloading files. Revocation blocks subsequent requests using the same session. An already authorized download cannot be recalled.

Admin lists select account details and useful project/file metadata explicitly. They omit password hashes, session secrets, file bytes, and private storage keys. Download responses use the existing private attachment headers and streaming storage. Unauthorized API requests return 401 or 403; ordinary users get a not-found admin page. Responses are not publicly cached.

## Verification and limits

Unit tests cover anonymous and ordinary-user denial, verified identity handling, and generic failures. PostgreSQL tests check search/pagination, safe selected fields, cross-project downloads, and immediate permission changes. HTTP checks exercise the real admin pages and endpoints with live sessions, including attempted role changes through registration/session input and denial after revocation.

The full suite passed 119 unit/UI tests and 57 PostgreSQL tests, along with build, lint, type checking, and production-server HTTP checks. Management tests verify old-session invalidation, password hashing, confirmation checks, ownership transfer, preserved shared work, and competing administrator changes. Deletion-history tests cover cascades and rollback. This is a single site-administrator role. Deletion history is not a full activity log and does not record who performed each deletion. Visual and keyboard review of the revised controls remains pending.
