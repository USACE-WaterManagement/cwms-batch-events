// Keep this list explicit instead of depending on Intl.supportedValuesOf so
// every supported browser presents the same choices and stays aligned with
// the server's Python ZoneInfo data. Custom input remains available for valid
// IANA aliases or newer zones that are not in this compatibility list.
export const TIMEZONES = [
  "UTC", "Africa/Cairo", "Africa/Johannesburg", "Africa/Nairobi", "America/Anchorage", "America/Argentina/Buenos_Aires",
  "America/Bogota", "America/Chicago", "America/Denver", "America/Detroit", "America/Edmonton", "America/Halifax",
  "America/Indiana/Indianapolis", "America/Los_Angeles", "America/Mexico_City", "America/New_York", "America/Phoenix",
  "America/Regina", "America/Santiago", "America/Sao_Paulo", "America/St_Johns", "America/Toronto", "America/Vancouver",
  "Asia/Almaty", "Asia/Amman", "Asia/Baghdad", "Asia/Bangkok", "Asia/Beirut", "Asia/Calcutta", "Asia/Dhaka",
  "Asia/Dubai", "Asia/Hong_Kong", "Asia/Jakarta", "Asia/Jerusalem", "Asia/Karachi", "Asia/Kathmandu", "Asia/Kolkata",
  "Asia/Kuala_Lumpur", "Asia/Manila", "Asia/Riyadh", "Asia/Seoul", "Asia/Shanghai", "Asia/Singapore", "Asia/Taipei",
  "Asia/Tokyo", "Asia/Ulaanbaatar", "Asia/Yangon", "Atlantic/Reykjavik", "Australia/Adelaide", "Australia/Brisbane",
  "Australia/Darwin", "Australia/Melbourne", "Australia/Perth", "Australia/Sydney", "Europe/Amsterdam", "Europe/Athens",
  "Europe/Berlin", "Europe/Dublin", "Europe/Helsinki", "Europe/Istanbul", "Europe/Lisbon", "Europe/London",
  "Europe/Madrid", "Europe/Moscow", "Europe/Oslo", "Europe/Paris", "Europe/Prague", "Europe/Rome", "Europe/Stockholm",
  "Europe/Vienna", "Europe/Warsaw", "Pacific/Auckland", "Pacific/Fiji", "Pacific/Guam", "Pacific/Honolulu",
  "Pacific/Port_Moresby", "Pacific/Tahiti",
] as const;
