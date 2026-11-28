// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectViews } from "@/components/project-views";
afterEach(cleanup);
it("switches views without losing a draft in the other panel", async () => {
  render(
    <ProjectViews
      overview={<p>Project overview</p>}
      ideas={<input aria-label="Proposal draft" />}
    />,
  );
  const user = userEvent.setup();
  expect(screen.getByRole("tabpanel", { name: "Overview" })).toBeVisible();
  await user.click(screen.getByRole("tab", { name: "Ideas" }));
  await user.type(screen.getByLabelText("Proposal draft"), "Keep this idea");
  await user.click(screen.getByRole("tab", { name: "Overview" }));
  expect(
    screen.queryByRole("tabpanel", { name: "Ideas" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: "Ideas" }));
  expect(screen.getByLabelText("Proposal draft")).toHaveValue("Keep this idea");
});
it("opens a requested ideas view and supports arrow, Home, and End keys", async () => {
  render(
    <ProjectViews
      initialView="ideas"
      overview={<p>Project overview</p>}
      ideas={<p>Proposals</p>}
    />,
  );
  const user = userEvent.setup();
  const ideas = screen.getByRole("tab", { name: "Ideas" }),
    overview = screen.getByRole("tab", { name: "Overview" });
  expect(ideas).toHaveAttribute("aria-selected", "true");
  ideas.focus();
  await user.keyboard("{ArrowRight}");
  expect(overview).toHaveFocus();
  expect(overview).toHaveAttribute("aria-selected", "true");
  await user.keyboard("{End}");
  expect(ideas).toHaveFocus();
  await user.keyboard("{Home}");
  expect(overview).toHaveFocus();
  await user.keyboard("{ArrowLeft}");
  expect(ideas).toHaveFocus();
});
