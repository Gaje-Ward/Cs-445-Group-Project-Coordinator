import { expect, it } from "vitest";
import { createLimiter } from "@/lib/rate-limit";
it("limits attempts within a window and permits them after expiry", () => {
  const allow = createLimiter(2, 1000);
  expect(allow("email", 1)).toBe(true);
  expect(allow("email", 2)).toBe(true);
  expect(allow("email", 3)).toBe(false);
  expect(allow("email", 1001)).toBe(true);
});
it("fails closed when the bounded bucket store is full", () => {
  const allow = createLimiter(1, 1000, 1);
  expect(allow("first", 1)).toBe(true);
  expect(allow("second", 2)).toBe(false);
  expect(allow("second", 1001)).toBe(true);
});
