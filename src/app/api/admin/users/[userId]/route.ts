import { admin } from "@/lib/admin";
import { adminRequest } from "@/lib/admin-http";
import { projectInput } from "@/lib/project-http";
export const runtime = "nodejs";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  return adminRequest(async (actorId) =>
    Response.json(
      {
        user: await admin.changeUser(
          actorId,
          (await context.params).userId,
          await projectInput(request),
        ),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    ),
  );
}
export async function DELETE(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  return adminRequest(async (actorId) => {
    await admin.deleteUser(
      actorId,
      (await context.params).userId,
      await projectInput(request),
    );
    return Response.json(
      { message: "Account permanently deleted." },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  });
}
