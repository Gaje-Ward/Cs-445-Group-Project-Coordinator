import "server-only";
import { createWriteStream } from "node:fs";
import {
  mkdir,
  open,
  realpath,
  rename,
  unlink,
  statfs,
  readdir,
  stat,
} from "node:fs/promises";
import { resolve, join, sep } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createFileValidator, FileError } from "./file-validation";

export const UPLOAD_TIMEOUT_MS = 30 * 60 * 1000;
export class FileStore {
  readonly root: string;
  constructor(
    root = process.env.FILE_STORAGE_PATH ||
      resolve(process.cwd(), ".data/project-files"),
  ) {
    this.root = resolve(/* turbopackIgnore: true */ root);
  }
  async initialize() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const actual = await realpath(this.root);
    for (const folder of [
      resolve(process.cwd(), "public"),
      resolve(process.cwd(), ".next"),
    ]) {
      const roots = [folder];
      try {
        roots.push(await realpath(/* turbopackIgnore: true */ folder));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      for (const root of roots) {
        const unsafe = root.toLowerCase();
        for (const candidate of [this.root, actual])
          if (
            candidate.toLowerCase() === unsafe ||
            candidate.toLowerCase().startsWith(unsafe + sep)
          )
            throw new Error(
              "File storage must be outside public and build directories.",
            );
      }
    }
  }
  path(key: string, partial = false) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        key,
      )
    )
      throw new Error("Invalid storage key");
    return join(this.root, key + (partial ? ".part" : ".blob"));
  }
  async write(
    key: string,
    name: string,
    size: number,
    body: ReadableStream<Uint8Array>,
    signal?: AbortSignal,
  ) {
    await this.initialize();
    const space = await statfs(this.root);
    if (space.bavail * space.bsize < size + 64 * 1024 * 1024)
      throw new FileError(
        "There is not enough free storage for this upload.",
        507,
      );
    const validator = createFileValidator(name, size);
    const combined = AbortSignal.any([
      AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      ...(signal ? [signal] : []),
    ]);
    try {
      await pipeline(
        Readable.fromWeb(
          body as import("node:stream/web").ReadableStream<Uint8Array>,
        ),
        new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            try {
              validator.push(chunk);
              callback(null, chunk);
            } catch (error) {
              callback(error as Error);
            }
          },
        }),
        createWriteStream(this.path(key, true), { flags: "wx", mode: 0o600 }),
        { signal: combined },
      );
      const mediaType = validator.finish();
      await rename(this.path(key, true), this.path(key));
      return mediaType;
    } catch (error) {
      if (combined.aborted)
        throw new FileError(
          "Upload cancelled or timed out. Please try again.",
          408,
        );
      throw error;
    }
  }
  async read(key: string, size: number) {
    await this.initialize();
    const handle = await open(this.path(key), "r");
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size !== size)
        throw new Error("Stored file is incomplete");
      return Readable.toWeb(
        handle.createReadStream({ autoClose: true }),
      ) as ReadableStream<Uint8Array>;
    } catch (error) {
      await handle.close();
      throw error;
    }
  }
  async remove(key: string) {
    await this.initialize();
    for (const partial of [true, false]) {
      try {
        await unlink(this.path(key, partial));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
  async olderKeys(cutoff: Date) {
    await this.initialize();
    const keys = new Set<string>();
    for (const name of await readdir(this.root)) {
      const match = /^([0-9a-f-]{36})\.(part|blob)$/.exec(name);
      if (match) {
        try {
          if ((await stat(join(this.root, name))).mtime < cutoff) {
            this.path(match[1]);
            keys.add(match[1]);
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
    }
    return [...keys];
  }
}
