"use client";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

type View = "overview" | "ideas";
const views: View[] = ["overview", "ideas"];

export function ProjectViews({
  overview,
  ideas,
  initialView = "overview",
}: {
  overview: ReactNode;
  ideas: ReactNode;
  initialView?: View;
}) {
  const [active, setActive] = useState<View>(initialView);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % views.length;
    else if (event.key === "ArrowLeft")
      next = (index + views.length - 1) % views.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = views.length - 1;
    else return;
    event.preventDefault();
    setActive(views[next]);
    buttons.current[next]?.focus();
  }
  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="Project views"
        className="flex gap-2 rounded-xl border border-slate-200 bg-white p-2"
      >
        {views.map((view, index) => (
          <button
            key={view}
            ref={(button) => {
              buttons.current[index] = button;
            }}
            type="button"
            role="tab"
            id={"project-tab-" + view}
            aria-controls={"project-panel-" + view}
            aria-selected={active === view}
            tabIndex={active === view ? 0 : -1}
            onClick={() => setActive(view)}
            onKeyDown={(event) => navigate(event, index)}
            className={
              "rounded-lg px-5 py-3 font-semibold " +
              (active === view
                ? "bg-indigo-700 text-white"
                : "text-slate-600 hover:bg-slate-100")
            }
          >
            {view === "overview" ? "Overview" : "Ideas"}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id="project-panel-overview"
        aria-labelledby="project-tab-overview"
        hidden={active !== "overview"}
        tabIndex={0}
        className="space-y-6"
      >
        {overview}
      </div>
      <div
        role="tabpanel"
        id="project-panel-ideas"
        aria-labelledby="project-tab-ideas"
        hidden={active !== "ideas"}
        tabIndex={0}
      >
        {ideas}
      </div>
    </div>
  );
}
