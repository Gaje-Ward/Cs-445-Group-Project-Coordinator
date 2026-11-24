import type { taskStatuses } from "./task-validation";

type ProgressTask = {
  status: (typeof taskStatuses)[number];
  dueDate: Date | string | null;
};
export type ProjectProgressSummary = {
  total: number;
  completed: number;
  remaining: number;
  todo: number;
  inProgress: number;
  overdue: number;
  percentComplete: number;
};

export function isPastDate(date: Date | string | null, today: string) {
  if (!date) return false;
  const day =
    typeof date === "string"
      ? date.slice(0, 10)
      : date.toISOString().slice(0, 10);
  return day < today;
}
export function isTaskOverdue(task: ProgressTask, today: string) {
  return task.status !== "DONE" && isPastDate(task.dueDate, today);
}
export function summarizeTasks(
  tasks: readonly ProgressTask[],
  today: string,
): ProjectProgressSummary {
  const summary = {
    total: tasks.length,
    completed: 0,
    remaining: 0,
    todo: 0,
    inProgress: 0,
    overdue: 0,
    percentComplete: 0,
  };
  for (const task of tasks) {
    if (task.status === "DONE") summary.completed++;
    else if (task.status === "IN_PROGRESS") summary.inProgress++;
    else summary.todo++;
    if (isTaskOverdue(task, today)) summary.overdue++;
  }
  summary.remaining = summary.total - summary.completed;
  summary.percentComplete = summary.total
    ? Math.round((summary.completed / summary.total) * 100)
    : 0;
  return summary;
}
