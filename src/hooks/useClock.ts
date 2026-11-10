import { useEffect, useState } from "react";

export const HOME_TIME_ZONE = "Asia/Seoul";
const timeFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: HOME_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const twelveHourFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: HOME_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  hourCycle: "h12",
});
const dateFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: HOME_TIME_ZONE,
  month: "long",
  day: "numeric",
  weekday: "long",
});

export function useClock(hour12 = false) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const parts = twelveHourFormat.formatToParts(now);
  return {
    now,
    time: hour12
      ? parts.filter(({ type }) => type === "hour" || type === "minute").map(({ value }) => value).join(":")
      : timeFormat.format(now),
    period: hour12 ? parts.find(({ type }) => type === "dayPeriod")?.value : undefined,
    date: dateFormat.format(now),
  };
}
