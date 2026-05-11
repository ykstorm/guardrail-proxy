// Contact leak patterns — exported for real-time onChunk guards.

/** Matches 10-digit Indian mobile, +91 prefix, xxx-xxx-xxxx US-style, and email addresses. */
export const CONTACT_LEAK_PATTERN =
  /\d{10}|\+91\s?\d{10}|\d{3}[-\s]\d{3}[-\s]\d{4}|@[a-zA-Z0-9]+\.[a-zA-Z]{2,}/

/** Matches email addresses (simple domain.tld shape). */
export const EMAIL_PATTERN = /@[a-zA-Z0-9]+\.[a-zA-Z]{2,}/