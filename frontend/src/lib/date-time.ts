export const PLATFORM_TIME_ZONE = "Asia/Bangkok";

const EXPLICIT_TIME_ZONE = /(?:z|[+-]\d{2}:?\d{2})$/i;

/** API datetimes are UTC. SQLite may serialize them without a timezone suffix. */
export function parseApiDate(value: string): Date {
  const normalized = value.trim();
  return new Date(EXPLICIT_TIME_ZONE.test(normalized) ? normalized : `${normalized}Z`);
}

export function formatApiDate(
  value: string,
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions,
): string {
  const parsed = parseApiDate(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    ...options,
    timeZone: PLATFORM_TIME_ZONE,
  }).format(parsed);
}
