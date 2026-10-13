import "dotenv/config";
export function testDatabaseUrl() {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw)
    throw new Error(
      "Set TEST_DATABASE_URL to the dedicated Compose test database.",
    );
  const url = new URL(raw);
  if (
    url.protocol !== "postgresql:" ||
    url.hostname !== "127.0.0.1" ||
    url.port !== "5434" ||
    url.pathname !== "/gpc_test" ||
    raw === process.env.DATABASE_URL
  )
    throw new Error(
      "Tests only accept the dedicated local gpc_test database at 127.0.0.1:5434.",
    );
  return raw;
}
