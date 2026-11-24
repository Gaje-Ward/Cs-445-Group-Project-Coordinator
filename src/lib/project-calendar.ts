import "server-only";

export function getProjectCalendar(now = new Date()) {
  const timeZone = process.env.APP_TIME_ZONE ?? "America/Chicago";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)!.value;
  const today = part("year") + "-" + part("month") + "-" + part("day");
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longGeneric",
  })
    .formatToParts(now)
    .find((item) => item.type === "timeZoneName")!.value;
  return { today, timeZone, label };
}
