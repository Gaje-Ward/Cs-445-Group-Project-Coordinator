# Sprint 5: Project files

Sprint 5 implements MVP-05. Members can upload documents and archives in a project's Files section, then download shared work. The list shows filenames, sizes, and uploaders. Uploaders can delete their own files, and owners can delete any file after confirmation. Uploads can be cancelled without clearing the selected file.

## Storage and limits

New uploads stream to private disk storage. Downloads stream from disk after a membership check. PostgreSQL stores metadata and a generated storage key; filenames are never used as paths. Existing small files stored in the database remain readable. There is no forced conversion or reset.

Each file must be non-empty and at most 512 MiB. Projects allow 2 GiB and 100 files, including unfinished reservations. The interface uses MB and GB for these binary units. A project row lock protects quota reservations from concurrent requests. A reservation must succeed before the upload is written. At most two uploads run concurrently in one application process, with a 30-minute transfer deadline and a free-disk-space check.

FILE_STORAGE_PATH selects the private directory, defaulting to .data/project-files. Keep it outside public/ and the build directory. The local .data directory is ignored by Git. Configure filesystem permissions for the server account; POSIX creation modes restrict access where supported. Deployment needs persistent storage and backups of both PostgreSQL and the upload directory. Pause writes or take coordinated snapshots when backing them up. Multiple app instances would need shared private storage and shared transfer limits.

## Validation and access

Supported extensions are PDF, TXT, PNG, JPEG, ZIP, and DOCX. Binary files receive basic signature checks. TXT is validated as UTF-8 as chunks arrive, including characters split across chunks. DOCX uses the ZIP signature check. Archives are not extracted, and the application does not scan for malware or prove document validity.

Upload requests require a matching Origin, an encoded filename, and a declared file size. The actual stream must match that size and remain within the limit. Authentication and project access are checked before streaming; membership is checked again before the upload becomes available. Removed teammates lose access on later requests, while their files remain with the project.

Download responses are uncached attachments with encoded filenames and nosniff headers. There are no public file links or inline previews. Deletion checks both current membership and uploader/owner permissions. List and upload responses contain metadata only.

## Failed transfers and cleanup

Pending uploads reserve quota but are hidden from the file list. A failed or cancelled upload removes its disk files before releasing the reservation. If cleanup cannot finish, the reservation stays for recovery. Completed files become READY only after the disk write succeeds. Deletion marks a record DELETING before removing its disk file and metadata.

Run npm.cmd run files:cleanup to preview stale reservations and orphaned disk files. Add -- --apply to remove them. Recovery waits 24 hours, beyond the upload deadline, and never removes a disk file referenced by a READY record. This also recovers disk files left after project records cascade away. The command is maintenance work, not a scheduled service; deployment still needs to arrange when it runs.

## Migrations and verification

The add_project_files migration creates the initial file table. The stream_project_files migration adds disk storage keys and transfer states while preserving existing database uploads. Apply migrations with npm.cmd run db:deploy. Neither migration resets existing accounts, projects, or tasks, and no dependency update is required.

All 119 unit/UI tests and 57 PostgreSQL tests passed, including the separately requested [administrator views and deletion history](ADMIN.md). Coverage includes streaming, cancellation, inaccurate sizes, legacy downloads, concurrent quotas, revoked membership during transfer, and stale-file recovery. A production-server check uploaded and downloaded a generated 480 MiB ZIP with matching SHA-256 hashes. The remaining authentication, project, task, file, and admin HTTP checks passed too. Build, lint, and type checks passed.

Local visual and keyboard review of the revised upload controls remain pending. Production proxy limits/timeouts, backup/restore, and load testing are not established by the local checks. There are no resumable transfers, file versions, folders, or task attachments in this increment.
