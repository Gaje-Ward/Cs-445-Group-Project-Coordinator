import { afterEach, expect, it, vi } from "vitest";
import { getProjectCalendar } from "@/lib/project-calendar";
afterEach(() => vi.unstubAllEnvs());

it("uses one Central Time calendar by default even when the UTC date has changed", () => {
  vi.stubEnv("APP_TIME_ZONE", undefined);
  expect(getProjectCalendar(new Date("2026-11-23T02:00:00Z"))).toEqual({
    today: "2026-11-22",
    timeZone: "America/Chicago",
    label: "Central Time",
  });
});
it("changes day at local midnight across daylight-saving seasons", () => {
  vi.stubEnv("APP_TIME_ZONE", "America/Chicago");
  expect(getProjectCalendar(new Date("2026-03-08T05:59:59Z")).today).toBe(
    "2026-03-07",
  );
  expect(getProjectCalendar(new Date("2026-03-08T06:00:00Z")).today).toBe(
    "2026-03-08",
  );
  expect(getProjectCalendar(new Date("2026-11-01T04:59:59Z")).today).toBe(
    "2026-10-31",
  );
  expect(getProjectCalendar(new Date("2026-11-01T05:00:00Z")).today).toBe(
    "2026-11-01",
  );
});
it("respects a configured shared calendar without using the browser's time zone", () => {
  vi.stubEnv("APP_TIME_ZONE", "Asia/Tokyo");
  expect(getProjectCalendar(new Date("2026-11-22T20:00:00Z"))).toMatchObject({
    today: "2026-11-23",
    timeZone: "Asia/Tokyo",
  });
});
it("reports an invalid configured time zone instead of silently changing overdue rules", () => {
  vi.stubEnv("APP_TIME_ZONE", "not-a-time-zone");
  expect(() => getProjectCalendar()).toThrow(RangeError);
});
