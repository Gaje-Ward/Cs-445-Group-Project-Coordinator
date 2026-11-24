// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  isPastDate,
  isTaskOverdue,
  summarizeTasks,
} from "@/lib/project-progress";
import { ProjectProgress } from "@/components/project-progress";

const today = "2026-11-22";
afterEach(() => cleanup());

it("keeps an empty project at zero without declaring it complete", () => {
  const progress = summarizeTasks([], today);
  expect(progress).toEqual({
    total: 0,
    completed: 0,
    remaining: 0,
    todo: 0,
    inProgress: 0,
    overdue: 0,
    percentComplete: 0,
  });
  render(<ProjectProgress progress={progress} label="Completion" compact />);
  expect(screen.getByText("No tasks yet.")).toBeVisible();
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  expect(screen.queryByText("100%")).not.toBeInTheDocument();
});

it("counts only unfinished tasks with a due date before the shared calendar day as overdue", () => {
  const tasks = [
    { status: "TODO" as const, dueDate: "2026-11-21" },
    {
      status: "IN_PROGRESS" as const,
      dueDate: new Date("2026-11-20T00:00:00Z"),
    },
    { status: "DONE" as const, dueDate: "2026-11-19" },
    { status: "TODO" as const, dueDate: "2026-11-22" },
    { status: "IN_PROGRESS" as const, dueDate: "2026-11-23" },
    { status: "TODO" as const, dueDate: null },
  ];
  expect(tasks.map((task) => isTaskOverdue(task, today))).toEqual([
    true,
    true,
    false,
    false,
    false,
    false,
  ]);
  expect(summarizeTasks(tasks, today)).toEqual({
    total: 6,
    completed: 1,
    remaining: 5,
    todo: 3,
    inProgress: 2,
    overdue: 2,
    percentComplete: 17,
  });
});

it("preserves the date stored in DATE columns rather than shifting it to local time", () => {
  expect(isPastDate(new Date("2026-11-22T00:00:00Z"), today)).toBe(false);
  expect(isPastDate("2026-11-22T00:00:00.000Z", today)).toBe(false);
  expect(isPastDate("2026-11-21", today)).toBe(true);
  expect(isPastDate(null, today)).toBe(false);
});

it("updates completion and overdue totals when work is completed or reopened", () => {
  const tasks = [{ status: "TODO" as const, dueDate: "2026-11-21" }];
  expect(summarizeTasks(tasks, today)).toMatchObject({
    completed: 0,
    overdue: 1,
    percentComplete: 0,
  });
  expect(
    summarizeTasks([{ ...tasks[0], status: "DONE" }], today),
  ).toMatchObject({
    completed: 1,
    remaining: 0,
    overdue: 0,
    percentComplete: 100,
  });
  expect(
    summarizeTasks([{ ...tasks[0], status: "IN_PROGRESS" }], today),
  ).toMatchObject({ completed: 0, inProgress: 1, overdue: 1 });
});

it("presents the actual counts with an accessible progress indicator", () => {
  const progress = summarizeTasks(
    [
      { status: "DONE", dueDate: null },
      { status: "TODO", dueDate: "2026-11-21" },
    ],
    today,
  );
  render(
    <ProjectProgress
      progress={progress}
      label="Task completion for Team project"
    />,
  );
  expect(screen.getByText("1 of 2 tasks completed")).toBeVisible();
  expect(screen.getByText("50%")).toBeVisible();
  expect(screen.getByText("1 overdue")).toBeVisible();
  expect(
    screen.getByRole("progressbar", {
      name: "Task completion for Team project",
    }),
  ).toHaveAttribute("value", "50");
  expect(screen.getByRole("progressbar")).toHaveAttribute(
    "aria-valuetext",
    "1 of 2 tasks completed",
  );
});

it("shows completed work without an overdue warning", () => {
  render(
    <ProjectProgress
      progress={summarizeTasks(
        [{ status: "DONE", dueDate: "2026-11-20" }],
        today,
      )}
      label="Completion"
      compact
    />,
  );
  expect(screen.getByText("1 of 1 task completed")).toBeVisible();
  expect(screen.getByText("100%")).toBeVisible();
  expect(screen.getByText("None overdue")).toBeVisible();
});
