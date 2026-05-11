// Placeholder leak patterns — Sprint 13.5 (2026-05-07).
//
// All patterns are conservative — they only fire on the exact placeholder
// shapes from the prompt vocabulary so they will not false-positive on
// legitimate prose with brackets, real prices, or real percentages.

/** Matches [PROJECT_A], [PROJECT_B_LITE], [BUILDER_X], [LEGAL_ENTITY_X], etc. */
export const PLACEHOLDER_NAME_PATTERN =
  /\[(?:PROJECT_[A-Z](?:_(?:PHASE_\d+|LITE|ID))?|BUILDER_[A-Z]|LEGAL_ENTITY_[A-Z])\]/ig

/** Matches ₹X,XXX/sqft, ₹X.X Cr, ₹XX,XXX/month, ₹XX.X L, X.XX% (uppercase X only). */
export const PLACEHOLDER_PRICE_PATTERN =
  /(?:₹X[X,.]*(?:\/sqft|\/month|\s*Cr\b|\s*L\b|\s*crore\b|\s*lakh\b)|X\.X{1,2}\s*%)/g

/** Matches [PROJECT_X_ID] placeholder shape. */
export const PLACEHOLDER_CUID_PATTERN = /\[PROJECT_[A-Z]_ID\]/g