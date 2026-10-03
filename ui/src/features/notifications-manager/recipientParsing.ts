// Intentionally pragmatic rather than RFC 5322-complete: email syntax is too
// broad for a useful client-side regex. This extracts the normal addresses users
// paste from email clients; the API's EmailStr validation remains authoritative.
const EMAIL_PATTERN =
  /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/gi;

export interface ParsedManualRecipients {
  emails: string[];
  invalidFragments: string[];
}

export const parseManualRecipients = (
  value: string,
): ParsedManualRecipients => {
  const matches = value.match(EMAIL_PATTERN) ?? [];
  const emails = [...new Set(matches.map((email) => email.toLowerCase()))];

  const withoutValidEmails = value.replace(EMAIL_PATTERN, " ");
  const invalidFragments = withoutValidEmails
    .split(/[,;\r\n]+/)
    .map((fragment) => fragment.replace(/[<>()[\]{}"']/g, " ").trim())
    .filter((fragment) => fragment.includes("@"));

  return {
    emails,
    invalidFragments: [...new Set(invalidFragments)],
  };
};
