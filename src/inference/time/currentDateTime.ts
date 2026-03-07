const DEFAULT_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const isValidTimeZone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
};

const formatParts = (date: Date, timeZone: string) => {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  ) as Record<string, string>;

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`
  };
};

export interface CurrentDateTimeContext {
  currentDateTime: string;
  currentDate: string;
  currentTime: string;
  currentTimezone: string;
  requestedTimezone?: string;
}

export const resolveCurrentDateTimeContext = (viewerTimezone?: string): CurrentDateTimeContext => {
  const requestedTimezone = viewerTimezone?.trim() || undefined;
  const currentTimezone =
    requestedTimezone && isValidTimeZone(requestedTimezone) ? requestedTimezone : DEFAULT_TIMEZONE;
  const now = new Date();
  const parts = formatParts(now, currentTimezone);

  return {
    currentDateTime: `${parts.date} ${parts.time} ${currentTimezone}`,
    currentDate: parts.date,
    currentTime: parts.time,
    currentTimezone,
    requestedTimezone
  };
};
