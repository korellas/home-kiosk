import { useEffect, useState } from "react";

export const HOME_TIME_ZONE = "Asia/Seoul";
const timeFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: HOME_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const dateFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: HOME_TIME_ZONE,
  month: "long",
  day: "numeric",
  weekday: "long",
});

export function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return { now, time: timeFormat.format(now), date: dateFormat.format(now) };
}
