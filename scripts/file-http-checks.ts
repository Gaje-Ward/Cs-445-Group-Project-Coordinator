import assert from "node:assert/strict";
import { largeArchiveHttpCheck } from "./large-archive-http-check";
import { MAX_FILE_BYTES } from "../src/lib/file-validation";
export async function fileHttpChecks({
  request,
  login,
  projectId,
  otherProjectId,
  ownerEmail,
  member,
  outsiderEmail,
  base,
}: {
  request: (route: string, init?: RequestInit) => Promise<Response>;
  login: (email: string) => Promise<void>;
  projectId: string;
  otherProjectId: string;
  ownerEmail: string;
  member: { id: string; email: string };
  outsiderEmail: string;
  base: string;
}) {
  const path = "/api/projects/" + projectId + "/files";
  const jsonHeaders = { "Content-Type": "application/json", Origin: base };
  const upload = (
    name: string,
    body: BodyInit = "Project notes\n",
    origin = base,
  ) =>
    request(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        Origin: origin,
        "X-File-Name": encodeURIComponent(name),
        "X-File-Size": String(
          typeof body === "string"
            ? Buffer.byteLength(body)
            : ArrayBuffer.isView(body)
              ? body.byteLength
              : body instanceof Blob
                ? body.size
                : 0,
        ),
      },
      body,
    });
  const remove = (id: string, origin = base, input: object = {}) =>
    request(path + "/" + id, {
      method: "DELETE",
      headers: { ...jsonHeaders, Origin: origin },
      body: JSON.stringify(input),
    });
  assert.equal((await request(path)).status, 200);
  assert.equal(
    (await upload("notes.txt", "x", "https://elsewhere.test")).status,
    403,
  );
  assert.equal((await upload("../notes.txt")).status, 400);
  assert.equal((await upload("empty.txt", "")).status, 400);
  assert.equal((await upload("page.html", "<p>hello</p>")).status, 415);
  assert.equal((await upload("fake.pdf")).status, 415);
  assert.equal(
    (
      await request(path, {
        method: "POST",
        headers: {
          Origin: base,
          "Content-Type": "application/octet-stream",
          "X-File-Name": "large.zip",
          "X-File-Size": String(MAX_FILE_BYTES + 1),
        },
        body: "test",
      })
    ).status,
    413,
  );
  const response = await upload("résumé.txt");
  assert.equal(response.status, 201);
  const owned = (await response.json()).file;
  await largeArchiveHttpCheck(request, path, base);
  assert.ok(!("data" in owned));
  const download = await request(path + "/" + owned.id);
  assert.equal(download.status, 200);
  assert.equal(await download.text(), "Project notes\n");
  assert.equal(
    download.headers.get("content-type"),
    "application/octet-stream",
  );
  assert.equal(download.headers.get("x-content-type-options"), "nosniff");
  assert.match(
    download.headers.get("content-disposition")!,
    /attachment.*r%C3%A9sum%C3%A9.txt/,
  );
  assert.match(download.headers.get("cache-control")!, /no-store/);
  assert.equal((await remove(owned.id, "https://elsewhere.test")).status, 403);
  assert.equal(
    (await remove(owned.id, base, { uploaderId: member.id })).status,
    400,
  );
  await login(member.email);
  assert.equal((await request(path + "/" + owned.id)).status, 200);
  assert.equal((await remove(owned.id)).status, 404);
  const ownResponse = await upload("member.txt");
  assert.equal(ownResponse.status, 201);
  const own = (await ownResponse.json()).file;
  assert.equal((await remove(own.id)).status, 200);
  const retained = (await (await upload("retained.txt")).json()).file;
  const page = await (await request("/projects/" + projectId)).text();
  assert.ok(page.includes('id="files-heading"') && page.includes("résumé.txt"));
  const listed = await request(path);
  assert.equal(listed.headers.get("cache-control"), "no-store");
  assert.ok((await listed.json()).files.every((f: object) => !("data" in f)));
  assert.equal(
    (await request("/api/projects/" + otherProjectId + "/files/" + owned.id))
      .status,
    404,
  );
  await login(outsiderEmail);
  assert.equal((await request(path)).status, 404);
  assert.equal((await request(path + "/" + owned.id)).status, 404);
  assert.equal((await upload("intruder.txt")).status, 404);
  assert.equal((await remove(owned.id)).status, 404);
  await login(ownerEmail);
  assert.equal(
    (
      await request("/api/projects/" + projectId + "/members", {
        method: "DELETE",
        headers: jsonHeaders,
        body: JSON.stringify({ userId: member.id }),
      })
    ).status,
    200,
  );
  await login(member.email);
  assert.equal((await request(path)).status, 404);
  assert.equal((await request(path + "/" + retained.id)).status, 404);
  assert.equal((await remove(retained.id)).status, 404);
  assert.equal((await upload("after-removal.txt")).status, 404);
  await login(ownerEmail);
  assert.equal((await request(path + "/" + retained.id)).status, 200);
  assert.equal((await remove(retained.id)).status, 200);
  assert.equal((await remove(owned.id)).status, 200);
  assert.equal((await request(path + "/" + owned.id)).status, 404);
  assert.equal(
    (
      await request("/api/projects/" + projectId + "/members", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ email: member.email }),
      })
    ).status,
    201,
  );
  assert.deepEqual((await (await request(path)).json()).files, []);
  console.log(
    "File HTTP checks passed: uploads, exact downloads, validation, deletion permissions, and revoked access.",
  );
}
