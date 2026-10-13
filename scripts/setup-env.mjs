import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
const template = await readFile(
  new URL("../.env.example", import.meta.url),
  "utf8",
);
const contents = template
  .replaceAll(
    "replace_with_random_hex_password",
    randomBytes(24).toString("hex"),
  )
  .replaceAll("replace_with_random_secret", randomBytes(32).toString("base64"));
try {
  await writeFile(new URL("../.env", import.meta.url), contents, {
    flag: "wx",
  });
  console.log(
    "Created ignored .env with random local secrets. No secrets were printed.",
  );
} catch (error) {
  if (error.code === "EEXIST")
    console.log("Existing .env preserved. Edit it manually if needed.");
  else throw error;
}
