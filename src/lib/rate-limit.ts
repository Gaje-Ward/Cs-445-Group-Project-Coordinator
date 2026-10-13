import "server-only";
import { createHash } from "node:crypto";
// Deliberately limited to one process. Replace with shared storage before scaling.
export function createLimiter(limit: number, windowMs: number, maxKeys = 5000) {
  const buckets = new Map<string, { count: number; expires: number }>();
  return (key: string, now = Date.now()) => {
    for (const [id, bucket] of buckets)
      if (bucket.expires <= now) buckets.delete(id);
    const id = createHash("sha256").update(key).digest("hex");
    let bucket = buckets.get(id);
    if (!bucket) {
      if (buckets.size >= maxKeys) return false;
      bucket = { count: 0, expires: now + windowMs };
      buckets.set(id, bucket);
    }
    bucket.count += 1;
    return bucket.count <= limit;
  };
}
export const allowLogin = createLimiter(10, 15 * 60 * 1000);
export const allowAuthWork = createLimiter(60, 60 * 1000);
export const allowRegistration = createLimiter(20, 60 * 1000);
