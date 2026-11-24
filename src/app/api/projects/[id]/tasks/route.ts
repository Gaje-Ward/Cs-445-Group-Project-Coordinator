import { tasks } from "@/lib/tasks";
import { getProjectCalendar } from "@/lib/project-calendar";
import { summarizeTasks } from "@/lib/project-progress";
import { projectInput, projectReply, projectRequest } from "@/lib/project-http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return projectRequest(async (userId) => {
    const calendar = getProjectCalendar();
    const items = await tasks.list(userId, (await context.params).id);
    return projectReply({
      tasks: items,
      progress: summarizeTasks(items, calendar.today),
      calendar,
    });
  });
}
export async function POST(request: Request, context: Context) {
  return projectRequest(async (userId) =>
    projectReply(
      {
        task: await tasks.create(
          userId,
          (await context.params).id,
          await projectInput(request),
        ),
      },
      201,
    ),
  );
}
