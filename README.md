# guardrail-proxy

**Real-time + post-hoc safety layer for streaming LLM responses.**

`@ykstorm/guardrail-proxy` catches policy violations in LLM output before your users see them — both mid-stream (16-token checkpoint abort) and after the fact (full audit pass). Built from production patterns extracted from buyerchat's LOCKS-1/2 system.

---

## What it does

**Mid-stream guard** (`StreamingGuard`):  
- Accumulates tokens in a sliding window, runs pattern checks every chunk
- Hard-abort patterns (`CONTACT_LEAK`, `BUSINESS_LEAK`) throw immediately and stop the stream
- Soft-observe patterns (`PRICE_COMMITMENT_LEAK`, `COMMISSION_DISCUSSION_LEAK`) fire a callback and let the stream continue
- Partial content is always delivered — users never see a silent drop

**Post-hoc audit** (`checkResponse`):  
- Runs all 23 CHECK cases on a complete response string
- Returns `{ passed: boolean, violations: string[] }`
- Works in any environment (no Sentry, no DB — all try/catch wrapped)

---

## Quick start

```bash
npm install @ykstorm/guardrail-proxy
```

### Post-hoc check

```typescript
import { checkResponse } from '@ykstorm/guardrail-proxy'

const result = checkResponse(
  'The price is ₹45,000 per sqft and we take 2.5% commission',
  {
    knownProjectNames: ['Gala Silver Palm'],
    knownBuilderNames: ['Gala Developers'],
  }
)
// result.passed = false
// result.violations = [
//   'PRICE_FINAL_COMMIT_LEAK: pattern matched',
//   'COMMISSION_DISCUSSION_LEAK: pattern matched',
// ]
```

### Streaming guard

```typescript
import { StreamingGuard } from '@ykstorm/guardrail-proxy'

const guard = new StreamingGuard({
  onAbort: (violation) => { throw new Error(`[GUARD_ABORT] ${violation}`) },
  onViolate: (violation) => { console.warn('[GUARD]', violation) },
})

for (const token of llmStream) {
  guard.onChunk(token)   // throws on hard-abort pattern
  yield token             // yield to consumer first, then check
}
```

### Streaming + partial delivery (recommended pattern)

```typescript
import { StreamingGuard } from '@ykstorm/guardrail-proxy'

const guard = new StreamingGuard({ windowSize: 16 })
let delivered = ''

for await (const chunk of llmStream) {
  delivered += chunk
  try {
    guard.onChunk(chunk)
  } catch (e) {
    // Hard abort — stop streaming but deliver what we have
    break
  }
  yield chunk
}

// If you need audit trail for logging:
if (guard.violations.length > 0) {
  console.warn('Guard violations:', guard.violations)
}
// delivered now has partial response if guard fired
```

---

## API

### `checkResponse(text, opts?)`

Post-hoc audit of a complete response string.

| Option | Type | Default | Description |
|---|---|---|---|
| `knownProjectNames` | `string[]` | `[]` | Allowlist of verified project names |
| `knownBuilderNames` | `string[]` | `[]` | Allowlist of verified builder names |
| `unverifiedProjectNames` | `string[]` | `[]` | Projects that should not have numeric prices |
| `buyerMessage` | `string` | — | Original buyer query (for language-match CHECK) |
| `classified` | `{ intent, persona }` | — | Intent + persona from your classifier |

Returns `{ passed: boolean, violations: string[] }`.

### `StreamingGuard`

Real-time streaming guard.

| Option | Default | Description |
|---|---|---|
| `onAbort(violation, pattern)` | throws | Called when a hard-abort pattern fires |
| `onViolate(violation, pattern)` | no-op | Called when a soft-observe pattern fires |
| `windowSize` | `16` | Token-window for partial-pattern matching |
| `.violations` | `[]` | Array of all violations seen (resets on `.reset()`) |
| `.reset()` | — | Clear accumulated buffer and violations |

### Lock action constants (LOCKS-2)

```typescript
import { BUILDER_LOCK_ACTIONS, PROJECT_LOCK_ACTIONS, nextBuilderStatus, validateBuilderTransition } from '@ykstorm/guardrail-proxy'

// Builder status machine
nextBuilderStatus(BUILDER_LOCK_ACTIONS.HOLD)        // → 'ON_HOLD'
nextBuilderStatus(BUILDER_LOCK_ACTIONS.SUSPEND)     // → 'SUSPENDED'
nextBuilderStatus(BUILDER_LOCK_ACTIONS.REMOVE)      // → 'REMOVED'
nextBuilderStatus(BUILDER_LOCK_ACTIONS.REACTIVATE)  // → 'ACTIVE'

// Transition validation
validateBuilderTransition('SUSPENDED', BUILDER_LOCK_ACTIONS.REACTIVATE)  // → null (valid)
validateBuilderTransition('REMOVED', BUILDER_LOCK_ACTIONS.HOLD)           // → 'Builder is REMOVED...'
```

---

## 23 CHECK cases

| CHECK | Name | Mode | Description |
|---|---|---|---|
| 1 | `HALLUCINATION` | hard abort | Invented project/builder/amenity names not in allowlist |
| 2 | `MISSING_CTA` | observe | Project-anchored response without visit CTA |
| 3 | `CONTACT_LEAK` | hard abort | Phone/email detected in response |
| 3b | `BUSINESS_LEAK` | hard abort | "commission rate", "partner status" in response |
| 4 | `INVESTMENT_GUARANTEE` | hard abort | Unqualified financial promises |
| 4b | `INVESTMENT_GUARANTEE` (persona) | observe | Soft-sell yield language to investor persona |
| 5 | `OUT_OF_AREA` | observe | Mentioning areas outside the service zone |
| 6 | `PROJECT_LIMIT` | observe | >2 project names or >2 project_card CARDs |
| 7 | `NO_MARKDOWN` | observe | Markdown bullets/bold/headers detected |
| 8 | `LANGUAGE_MISMATCH` | observe | Buyer wrote Hinglish, response dropped to English |
| 9 | `WORD_CAP` | observe | Word count exceeds persona cap (premium:120, value:80) |
| 10 | `CARD_DISCIPLINE` | observe | Duplicate card types, wrong card combos |
| 11 | `SOFT_SELL_PHRASE` | observe | "I recommend / best project / ideal for you" |
| 12 | `ORDINAL_RANKING` | observe | "1st / second choice / #1 pick" language |
| 13 | `FAKE_BOOKING_CLAIM` | hard abort | Visit/booking confirmation without `visit_confirmation` CARD |
| 14 | `FABRICATED_BUILDER` | observe | Builder name not in allowlist |
| 15 | `FABRICATED_STAT` | observe | Fabricated delivery counts, founding year, years in business |
| 16 | `FABRICATED_PRICE` | observe | Numeric price near unverified project name |
| 17a | `OTP_FABRICATION` | hard abort | Model simulated OTP send/verify flow |
| 17 | `FAKE_VISIT_CLAIM` | hard abort | Visit confirmation language without artifact |
| 18 | `PHONE_REQUEST_IN_PROSE` | observe | AI requests phone while Stage B is disabled |
| 19 | `PRICE_FABRICATION` | observe | Numeric price near unverified project |
| 20 | `FIRST_PERSON_HINDI` | observe | Response uses first-person Hindi pronoun/verb |
| 21 | `PLACEHOLDER_LEAK` | observe | Unsubstituted `{{name}}`, `{{price}}`, `{{cuid}}` |
| 22 | `PRICE_COMMITMENT_LEAK` | observe | AI committed to discount or final price |
| 23 | `COMMISSION_DISCUSSION_LEAK` | observe | AI quoted numeric commission/brokerage % |

---

## Production numbers

These are real benchmarks from the buyerchat LOCKS-1/2 system (commit `63aaa64`):

- **830 tests** covering all CHECK cases with zero false-positive blocks  
- **16-token checkpoint interval** — fires on every 16th token during streaming  
- **<50ms guard overhead** per chunk in production  
- **Partial delivery** guaranteed on every hard abort — zero silent drops  

See [`EXPERIMENTS.md`](./EXPERIMENTS.md) for full benchmark methodology and raw numbers.

---

## Architecture

```
llmStream (async generator)
    │
    ▼
StreamingGuard.onChunk(token)
    │  ← 16-token sliding window
    ├── [abort pattern] → throw → stop stream, yield delivered
    └── [observe pattern] → onViolate() → continue
    │
    ▼
delivered partial response (user sees it immediately)
guard.violations (for audit logging)

─────────────────────────────────────────────

checkResponse(fullText, opts)
    │
    ▼  ← runs all 23 CHECK cases
    │
    ├── passed: true  → log + deliver
    └── passed: false → violations[] + alert
```

---

## Install

```bash
npm install @ykstorm/guardrail-proxy
# or
pnpm add @ykstorm/guardrail-proxy
# or
yarn add @ykstorm/guardrail-proxy
```

Requires Node.js ≥18.

---

## License

Apache 2.0 — see [`LICENSE`](./LICENSE).