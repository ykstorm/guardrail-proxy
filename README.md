[![npm version](https://img.shields.io/npm/v/@ykstorm/guardrail-proxy)](https://npmjs.com/package/@ykstorm/guardrail-proxy)
[![Test Status](https://github.com/ykstorm/guardrail-proxy/actions/workflows/ci.yml/badge.svg)](https://github.com/ykstorm/guardrail-proxy/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

# guardrail-proxy

**Real-time safety layer for streaming LLM responses.**  
Catches policy violations mid-stream (16-token checkpoint) and after the fact (23 CHECK cases). Built from production patterns used in Homesty.ai's buyerchat — 830+ tests, 117 own-package tests, 165 production deploys.

---

## What it does

**Mid-stream guard** (`StreamingGuard`):
- Accumulates tokens in a 16-token sliding window
- Hard-abort patterns (`CONTACT_LEAK`, `BUSINESS_LEAK`) throw immediately, stop the stream
- Soft-observe patterns (`PRICE_COMMITMENT_LEAK`, `COMMISSION_DISCUSSION_LEAK`) fire a callback but let the stream continue
- Partial content is always delivered — users never see silence

**Post-hoc audit** (`checkResponse`):
- Runs all 23 CHECK cases on complete response text
- Returns `{ passed: boolean, violations: string[] }`
- No external dependencies — try/catch wrapped, works in any environment

---

## Install

```bash
npm install @ykstorm/guardrail-proxy
```

Requires Node.js ≥18.

---

## Quick start

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

### Streaming guard with partial delivery

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

if (guard.violations.length > 0) {
  console.warn('Guard violations:', guard.violations)
}
// delivered has partial response if guard fired
```

---

## 23 CHECK cases

| Mode | Count | Examples |
|------|-------|----------|
| **hard abort** | 9 | CONTACT_LEAK, BUSINESS_LEAK, INVESTMENT_GUARANTEE, FABRICATED_VISIT_CLAIM, OTP_FABRICATION, FAKE_BOOKING_CLAIM |
| **soft observe** | 14 | HALLUCINATION, MISSING_CTA, PRICE_FABRICATION, LANGUAGE_MISMATCH, WORD_CAP, FABRICATED_BUILDER, PLACEHOLDER_LEAK |

Full table in [EXPERIMENTS.md](./EXPERIMENTS.md).

---

## Production numbers

From buyerchat production (commit `63aaa64`):

- **830 tests** covering all CHECK cases — zero false-positive blocks
- **16-token checkpoint interval** — fires every 16 tokens during streaming
- **<50ms guard overhead** per chunk in production
- **Partial delivery** guaranteed on every hard abort
- **117 tests** in this package, MIT license

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

## API

### `checkResponse(text, opts?)`

Post-hoc audit. Returns `{ passed: boolean, violations: string[] }`.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `knownProjectNames` | `string[]` | `[]` | Allowlist of verified project names |
| `knownBuilderNames` | `string[]` | `[]` | Allowlist of verified builder names |
| `unverifiedProjectNames` | `string[]` | `[]` | Projects that should not have numeric prices |
| `buyerMessage` | `string` | — | Original buyer query (for language-match CHECK) |
| `classified` | `{ intent, persona }` | — | Intent + persona from your classifier |

### `StreamingGuard`

Real-time streaming guard.

| Option | Default | Description |
|--------|---------|-------------|
| `onAbort(violation, pattern)` | throws | Called when a hard-abort pattern fires |
| `onViolate(violation, pattern)` | no-op | Called when a soft-observe pattern fires |
| `windowSize` | `16` | Token-window for partial-pattern matching |
| `.violations` | `[]` | Array of all violations seen (resets on `.reset()`) |
| `.reset()` | — | Clear accumulated buffer and violations |

---

## License

MIT — see [LICENSE](LICENSE).