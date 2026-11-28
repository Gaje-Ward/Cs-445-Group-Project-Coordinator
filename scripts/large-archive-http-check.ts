import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { crc32 } from "node:zlib";
import { Readable } from "node:stream";

// Generate a valid stored ZIP in chunks, without keeping the archive in memory.
export async function largeArchiveHttpCheck(
  request: (route: string, init?: RequestInit) => Promise<Response>,
  path: string,
  base: string,
) {
  const megabytes = Number(process.env.LARGE_ARCHIVE_TEST_MB ?? 32);
  assert.ok(
    Number.isInteger(megabytes) && megabytes >= 1 && megabytes <= 500,
    "Large archive test size must be 1–500 MiB",
  );
  const payloadBytes = megabytes * 1024 * 1024;
  const filename = Buffer.from("payload.bin");
  const local = Buffer.alloc(30 + filename.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 6);
  local.writeUInt16LE(0x21, 12);
  local.writeUInt16LE(filename.length, 26);
  filename.copy(local, 30);
  const total = local.length + payloadBytes + 16 + 46 + filename.length + 22;
  const expected = createHash("sha256");
  async function* archive() {
    expected.update(local);
    yield local;
    let remaining = payloadBytes,
      crc = 0;
    const chunk = Buffer.alloc(64 * 1024, 65);
    while (remaining) {
      const part = chunk.subarray(0, Math.min(remaining, chunk.length));
      remaining -= part.length;
      crc = crc32(part, crc);
      expected.update(part);
      yield part;
    }
    const descriptor = Buffer.alloc(16);
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE(crc, 4);
    descriptor.writeUInt32LE(payloadBytes, 8);
    descriptor.writeUInt32LE(payloadBytes, 12);
    const central = Buffer.alloc(46 + filename.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 8);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payloadBytes, 20);
    central.writeUInt32LE(payloadBytes, 24);
    central.writeUInt16LE(filename.length, 28);
    filename.copy(central, 46);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(1, 8);
    end.writeUInt16LE(1, 10);
    end.writeUInt32LE(central.length, 12);
    end.writeUInt32LE(local.length + payloadBytes + descriptor.length, 16);
    for (const part of [descriptor, central, end]) {
      expected.update(part);
      yield part;
    }
  }
  const response = await request(path, {
    method: "POST",
    headers: {
      Origin: base,
      "Content-Type": "application/octet-stream",
      "X-File-Name": "large-archive.zip",
      "X-File-Size": String(total),
      "Content-Length": String(total),
    },
    body: Readable.toWeb(
      Readable.from(archive()),
    ) as ReadableStream<Uint8Array>,
    duplex: "half",
  } as RequestInit);
  assert.equal(
    response.status,
    201,
    "Large archive upload: " +
      (response.ok ? "accepted" : await response.text()),
  );
  const file = (await response.json()).file;
  try {
    assert.equal(file.size, total);
    const download = await request(path + "/" + file.id);
    assert.equal(download.status, 200);
    const reader = download.body!.getReader(),
      actual = createHash("sha256");
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      actual.update(value);
    }
    assert.equal(received, total);
    assert.equal(actual.digest("hex"), expected.digest("hex"));
    console.log(
      `Large archive HTTP check passed: ${megabytes} MiB ZIP uploaded and downloaded with matching SHA-256.`,
    );
  } finally {
    assert.equal(
      (
        await request(path + "/" + file.id, {
          method: "DELETE",
          headers: { Origin: base, "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
      200,
    );
  }
}
