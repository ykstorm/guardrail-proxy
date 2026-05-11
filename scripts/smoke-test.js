#!/usr/bin/env node
/**
 * smoke-test.js — End-to-end smoke test for guardrail-proxy
 * Run: node scripts/smoke-test.js
 *
 * Tests the guard against real problematic patterns.
 * No network required — pure function tests using StreamingGuard.
 */

const { checkResponse, StreamingGuard } = require('../dist/index.js')

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (e) {
    console.log(`  ✗ ${name}: ${e.message}`)
    failed++
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg}: expected ${expected}, got ${actual}`)
}

console.log('\n=== guardrail-proxy smoke tests ===\n')

// --- checkResponse tests ---

console.log('[checkResponse]')
test('clean content passes', () => {
  const result = checkResponse('The 2BHK apartment costs ₹45 lakhs.')
  assertEqual(result.passed, true, 'clean content should pass')
})

test('phone number is blocked', () => {
  const result = checkResponse('Call us at 9988776655 for booking.')
  assertEqual(result.passed, false, 'phone number should be blocked')
  if (!result.violations.some(v => v.includes('PHONE'))) throw new Error('expected PHONE violation')
})

test('email is blocked', () => {
  const result = checkResponse('Email: scammer@fake-site.com to book.')
  assertEqual(result.passed, false, 'email should be blocked')
  if (!result.violations.some(v => v.includes('EMAIL'))) throw new Error('expected EMAIL violation')
})

test('price guarantee is blocked', () => {
  const result = checkResponse('We guarantee this property will cost exactly ₹50 lakhs.')
  assertEqual(result.passed, false, 'price guarantee should be blocked')
  if (!result.violations.some(v => v.includes('PRICE_GUARANTEE'))) throw new Error('expected PRICE_GUARANTEE violation')
})

test('investment guarantee is blocked', () => {
  const result = checkResponse('Invest in this property and get 30% returns guaranteed.')
  assertEqual(result.passed, false, 'investment guarantee should be blocked')
  if (!result.violations.some(v => v.includes('INVESTMENT_GUARANTEE'))) throw new Error('expected INVESTMENT_GUARANTEE violation')
})

test('buyer message language mismatch is detected', () => {
  // Buyer wrote in Hindi, LLM responded in English
  const result = checkResponse('The property is available in Bangalore.', {
    buyerMessage: 'ನಾನು ಬೆಂಗಳೂರಿನಲ್ಲಿ ಮನೆ ಬಯಸುತ್ತೇನೆ',
  })
  assertEqual(result.passed, false, 'language mismatch should be blocked')
  if (!result.violations.some(v => v.includes('LANGUAGE_MISMATCH'))) throw new Error('expected LANGUAGE_MISMATCH violation')
})

// --- StreamingGuard tests ---

console.log('\n[StreamingGuard]')
test('clean chunk stream passes', () => {
  const violations = []
  const guard = new StreamingGuard({
    onViolate: (v) => violations.push(v),
  })
  guard.onChunk('The ')
  guard.onChunk('property ')
  guard.onChunk('costs ')
  guard.onChunk('₹45 ')
  guard.onChunk('lakhs.')
  assertEqual(violations.length, 0, 'no violations expected')
})

test('phone number in chunk triggers abort', () => {
  let abortViolations = []
  const guard = new StreamingGuard({
    onAbort: (v) => abortViolations.push(v),
    onViolate: (v) => {},
  })
  guard.onChunk('Call ')
  guard.onChunk('us ')
  guard.onChunk('at ')
  try {
    guard.onChunk('9988776655')
  } catch (e) {
    // expected
  }
  if (abortViolations.length === 0) throw new Error('expected phone abort violation')
})

test('.reset() clears buffer and violations', () => {
  const violations = []
  const guard = new StreamingGuard({
    onViolate: (v) => violations.push(v),
  })
  guard.onChunk('Hello ')
  guard.onChunk('world')
  guard.reset()
  assertEqual(guard.violations.length, 0, 'violations should be empty after reset')
  assertEqual(guard['buffer'].length, 0, 'buffer should be empty after reset')
})

test('hard abort yields delivered partial', () => {
  let delivered = null
  let abortViolation = null
  const guard = new StreamingGuard({
    onAbort: (violation, deliveredText) => {
      abortViolation = violation
      delivered = deliveredText
    },
  })
  guard.onChunk('The property ')
  try {
    guard.onChunk('call 9988776655 now')
  } catch (e) {
    // expected
  }
  if (delivered === null) throw new Error('expected delivered text')
  if (!delivered.includes('The property')) throw new Error('delivered should include partial text')
})

// --- Summary ---

console.log('\n=== Results ===')
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
if (failed > 0) {
  console.log('\nSMOKE TEST FAILED')
  process.exit(1)
} else {
  console.log('\nAll smoke tests passed ✓')
  process.exit(0)
}