import type { ProjectProgressSummary } from "@/lib/project-progress";

export function ProjectProgress({
  progress,
  label,
  compact = false,
}: {
  progress: ProjectProgressSummary;
  label: string;
  compact?: boolean;
}) {
  if (progress.total === 0)
    return (
      <p className="mt-4 text-sm text-slate-600">
        {compact ? "No tasks yet." : "Add a task to start tracking progress."}
      </p>
    );
  return (
    <div className="mt-5 space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">
          {progress.completed} of {progress.total}{" "}
          {progress.total === 1 ? "task" : "tasks"} completed
        </p>
        <p className="text-sm font-semibold text-indigo-700">
          {progress.percentComplete}%
        </p>
      </div>
      <progress
        aria-label={label}
        aria-valuetext={
          progress.completed + " of " + progress.total + " tasks completed"
        }
        max={100}
        value={progress.percentComplete}
        className="h-2.5 w-full accent-indigo-700"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-slate-600">
          {progress.remaining} remaining
          {!compact ? "; " + progress.inProgress + " in progress" : ""}
        </p>
        <p
          className={
            progress.overdue ? "font-semibold text-amber-800" : "text-slate-600"
          }
        >
          {progress.overdue ? progress.overdue + " overdue" : "None overdue"}
        </p>
      </div>
    </div>
  );
}
