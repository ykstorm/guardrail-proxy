import { describe, it, expect, beforeEach, vi } from 'vitest'
import { checkResponse } from '../src/check.js'
import { StreamingGuard } from '../src/streaming/index.js'

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────
const pass = (text: string, opts = {}) => expect(checkResponse(text, opts).passed).toBe(true)
const fail = (text: string, opts = {}, contains?: string) => {
  const r = checkResponse(text, opts)
  expect(r.passed).toBe(false)
  if (contains) expect(r.violations.some(v => v.includes(contains))).toBe(true)
}

// ─────────────────────────────────────────────────────────────────
// CHECK 1 — HALLUCINATION
// ─────────────────────────────────────────────────────────────────
describe('CHECK 1 — Hallucination', () => {
  it('passes known project name', () => {
    pass('Gala Silver Palm is a great project', { knownProjectNames: ['Gala Silver Palm'] })
  })
  it('passes known area', () => {
    pass('Located in South Bopal', { knownProjectNames: [] })
  })
  it('passes known amenity', () => {
    pass('Near HCG cancer center', { knownProjectNames: [] })
  })
  it('fails invented project with property keyword', () => {
    fail('Skyline Heights has amazing amenities', { knownProjectNames: [] }, 'HALLUCINATION')
  })
  it('fails invented builder with LLP/Group suffix', () => {
    fail('Apex Builders LLP is offering discounts', { knownBuilderNames: [] }, 'HALLUCINATION')
  })
  it('fails multiple invented names', () => {
    const text = 'Sunrise Enclave and Green Valley Towers are both excellent choices'
    const r = checkResponse(text, { knownProjectNames: [] })
    expect(r.passed).toBe(false)
    expect(r.violations.some(v => v.includes('HALLUCINATION'))).toBe(true)
  })
  it('fails invented amenity name', () => {
    fail('Next to Metropolitan Hospital', { knownProjectNames: [] }, 'HALLUCINATION')
  })
})

// ─────────────────────────────────────────────────────────────────
// CHECK 2 — MISSING_CTA
// ─────────────────────────────────────────────────────────────────
describe('CHECK 2 — Missing CTA', () => {
  it('passes when project mentioned with visit CTA', () => {
    pass('Gala Silver Palm is available. Would you like to schedule a site visit?', {
      knownProjectNames: ['Gala Silver Palm'],
      buyerMessage: 'I want to visit Gala Silver Palm',
    })
  })
  it('passes when visit_prompt card is present', () => {
    const text = 'Gala Silver Palm is great. <!--CARD:{"type":"visit_prompt"}-->'
    pass(text, { knownProjectNames: ['Gala Silver Palm'], buyerMessage: 'show me the project' })
  })
  it('fails project mention without visit CTA', () => {
    fail('Gala Silver Palm has 2BHK units available.', {
      knownProjectNames: ['Gala Silver Palm'],
      buyerMessage: 'Tell me about Gala Silver Palm',
    }, 'MISSING_CTA')
  })
  it('passes non-project-facing intent', () => {
    pass('Ahmedabad weather is pleasant this time of year.', {
      buyerMessage: 'how is the weather',
      classified: { intent: 'general_query', persona: 'unknown' },
    })
  })
})

// ─────────────────────────────────────────────────────────────────
// CHECK 3 — CONTACT_LEAK
// ─────────────────────────────────────────────────────────────────
describe('CHECK 3 — Contact Leak', () => {
  it('fails 10-digit Indian phone', () => {
    fail('Call us at 9876543210', {}, 'CONTACT_LEAK')
  })
  it('fails +91 phone format', () => {
    fail('Contact +91 98765 43210', {}, 'CONTACT_LEAK')
  })
  it('fails email address', () => {
    fail('Email us at sales@example.com', {}, 'CONTACT_LEAK')
  })
  it('passes no contact info', () => {
    pass('The project has excellent connectivity.')
  })
  it('fails phone in mixed text', () => {
    fail('For details call 98260 12345 or visit our office', {}, 'CONTACT_LEAK')
  })
})

// ─────────────────────────────────────────────────────────────────
// CHECK 3b — BUSINESS_LEAK
// ─────────────────────────────────────────────────────────────────
describe('CHECK 3b — Business Leak', () => {
  it('fails commission rate mention', () => {
    fail('Our commission rate is 2%', {}, 'BUSINESS_LEAK')
  })
  it('fails partner status mention', () => {
    fail('We have partner status with this builder', {}, 'BUSINESS_LEAK')
  })
  it('fails commission percent', () => {
    fail('Brokerage is 1.5 percent', {}, 'BUSINESS_LEAK')
  })
  it('passes normal language', () => {
    pass('The builder offers flexible payment options.')
  })
})

// ─────────────────────────────────────────────────────────────────
// CHECK 4 — INVESTMENT_GUARANTEE
// ─────────────────────────────────────────────────────────────────
describe('CHECK 4 — Investment Guarantee', () => {
  it('fails guaranteed returns', () => {
    fail('This property is guaranteed to appreciate 20%', {}, 'INVESTMENT_GUARANTEE')
  })
  it('fails will definitely appreciate', () => {
    fail('It will definitely appreciate in value', {}, 'INVESTMENT_GUARANTEE')
  })
  it('fails no risk language', () => {
    fail('There is no risk with this investment', {}, 'INVESTMENT_GUARANTEE')
  })
  it('fails promise you language', () => {
    fail('I promise you this is a safe bet', {}, 'INVESTMENT_GUARANTEE')
  })
  it('passes factual statement without guarantee', () => {
    pass('Property values in this area have historically increased.')
  })
})

// CHECK 4b — Persona-aware guarantee
describe('CHECK 4b — Investor Persona Guarantee', () => {
  it('fails soft-sell yield to investor persona', () => {
    fail('This property is sure to grow in value', {
      classified: { intent: 'general_query', persona: 'investor' }
    }, 'INVESTMENT_GUARANTEE')
  })
  it('passes same text to non-investor persona', () => {
    pass('This property is sure to grow in value', {
      classified: { intent: 'general_query', persona: 'value' }
    })
  })
})

// ─────────────────────────────────────────────────────────────────
// CHECK 5 — OUT_OF_AREA
// ─────────────────────────────────────────────────────────────────
describe('CHECK 5 — Out of Area', () => {
  it('fails satellite mention', () => {
    fail('The project is near Satellite', {}, 'OUT_OF_AREA')
  })
  it('fails prahlad nagar', () => {
    fail('Close to Prahlad Nagar', {}, 'OUT_OF_AREA')
  })
  it('passes in-area mention', () => {
    pass('In South Bopal, this project is well-located.')
  })
  it('fails multiple out-of-area', () => {
    fail('Near Maninagar and Chandkheda', {}, 'OUT_OF_AREA')
  })
})

// ─────────────────────────────────────────────────────────────────
// CHECK 6 — PROJECT_LIMIT
// ─────────────────────────────────────────────────────────────────
describe('CHECK 6 — Project Limit', () => {
  it('passes 1 project name', () => {
    pass('Gala Silver Palm is a great choice.', { knownProjectNames: ['Gala Silver Palm'] })
  })
  it('passes 2 project names', () => {
    pass('Gala Silver Palm and Shela Elegance are both options.', {
      knownProjectNames: ['Gala Silver Palm', 'Shela Elegance']
    })
  })
  it('fails 3 project names mentioned', () => {
    fail('Gala Silver Palm, Shela Elegance, and Bopal Heaven are all available.', {
      knownProjectNames: ['Gala Silver Palm', 'Shela Elegance', 'Bopal Heaven']
    }, 'PROJECT_LIMIT')
  })
  it('fails 3 project_card CARDs', () => {
    const text = '<!--CARD:{"type":"project_card"}--><!--CARD:{"type":"project_card"}--><!--CARD:{"type":"project_card"}-->'
    fail(text, {}, 'PROJECT_LIMIT')
  })
})

// ─────────────────────────────────────────────────────────────────
// CHECK 7 — NO_MARKDOWN
// ─────────────────────────────────────────────────────────────────
describe('CHECK 7 — No Markdown', () => {
  it('fails bullet list', () => {
    fail('Here are the highlights:\n- 2 BHK\n- 3 BHK', {}, 'NO_MARKDOWN')
  })
  it('fails bold text', () => {
    fail('The **price** is very competitive', {}, 'NO_MARKDOWN')
  })
  it('fails heading', () => {
    fail('## Location\nNear the metro', {}, 'NO_MARKDOWN')
  })
  it('passes plain paragraph', () => {
    pass('The location is excellent with good connectivity.')
  })
})

// ─────────────────────────────────────────────────────────────────
// CHECK 8 — LANGUAGE_MISMATCH
// ─────────────────────────────────────────────────────────────────
describe('CHECK 8 — Language Match', () => {
  it('fails Hinglish buyer -> English response', () => {
    fail('The location is excellent.', {
      buyerMessage: 'yeh project kaisa hai bhai'
    }, 'LANGUAGE_MISMATCH')
  })
  it('passes English buyer -> English response', () => {
    pass('The location is excellent.', {
      buyerMessage: 'How is the location?'
    })
  })
  it('passes Hinglish -> Hinglish response', () => {
    pass('yah location bahut acha hai bhai.', {
      buyerMessage: 'yeh project kaisa hai bhai'
    })
  })
  it('fails English buyer -> Hinglish response', () => {
    fail('yah location bahut acha hai bhai.', {
      buyerMessage: 'How is the location?'
    }, 'NON_LATIN_SCRIPT')
  })
})

// ─────────────────────────────────────────────────────────────────
// CHECK 9 — WORD_CAP
// ─────────────────────────────────────────────────────────────────
describe('CHECK 9 — Word Cap', () => {
  it('passes under premium cap', () => {
    const text = 'This is a great property with many features. '.repeat(10)
    pass(text, { classified: { intent: 'general_query', persona: 'premium' } })
  })
  it('fails over premium cap (120)', () => {
    const text = 'Word '.repeat(130)
    fail(text, { classified: { intent: 'general_query', persona: 'premium' } }, 'WORD_CAP')
  })
  it('fails over value cap (80)', () => {
    const text = 'Word '.repeat(90)
    fail(text, { classified: { intent: 'general_query', persona: 'value' } }, 'WORD_CAP')
  })
  it('passes with unknown persona cap (100)', () => {
    const text = 'Word '.repeat(95)
    pass(text, { classified: { intent: 'general_query', persona: 'unknown' } })
  })
  it('ignores CARD blocks in word count', () => {
    const text = 'Word '.repeat(90) + '<!--CARD:{"type":"project_card"}-->'.repeat(5)
    pass(text, { classified: { intent: 'general_query', persona: 'premium' } })
  })
})

// ─────────────────────────────────────────────────────────────────
// CHECK 10 — CARD_DISCIPLINE
// ─────────────────────────────────────────────────────────────────
describe('CHECK 10 — Card Discipline', () => {
  it('passes valid card combo', () => {
    const text = '<!--CARD:{"type":"project_card"}--><!--CARD:{"type":"visit_prompt"}-->'
    pass(text)
  })
  it('fails duplicate comparison cards', () => {
    const text = '<!--CARD:{"type":"comparison"}--><!--CARD:{"type":"comparison"}-->'
    fail(text, {}, 'CARD_DISCIPLINE')
  })
  it('fails comparison + project_card together', () => {
    const text = '<!--CARD:{"type":"comparison"}--><!--CARD:{"type":"project_card"}-->'
    fail(text, {}, 'CARD_DISCIPLINE')
  })
  it('fails 3 cards total', () => {
    const text = '<!--CARD:{"type":"project_card"}--><!--CARD:{"type":"visit_prompt"}--><!--CARD:{"type":"builder_trust"}-->'
    fail(text, {}, 'CARD_DISCIPLINE')
  })
})

// ─────────────────────────────────────────────────────────────────
// CHECK 11 — SOFT_SELL_PHRASE
// ─────────────────────────────────────────────────────────────────
describe('CHECK 11 — Soft Sell', () => {
  it('fails I recommend', () => {
    fail('I recommend Gala Silver Palm', {}, 'SOFT_SELL')
  })
  it('fails best project', () => {
    fail('This is the best project in the area', {}, 'SOFT_SELL')
  })
  it('fails ideal for you', () => {
    fail('This is ideal for you', {}, 'SOFT_SELL')
  })
  it('passes neutral language', () => {
    pass('Gala Silver Palm has good connectivity.')
  })
})

// ─────────────────────────────────────────────────────────────────
// CHECK 12 — ORDINAL_RANKING
// ─────────────────────────────────────────────────────────────────
describe('CHECK 12 — Ordinal Ranking', () => {
  it('fails 1st choice', () => {
    fail('Gala Silver Palm is our first choice', {}, 'ORDINAL_RANKING')
  })
  it('fails second choice', () => {
    fail('Our second choice is Shela Elegance', {}, 'ORDINAL_RANKING')
  })
  it('fails #1 pick', () => {
    fail('This is our #1 pick', {}, 'ORDINAL_RANKING')
  })
  it('passes neutral comparison', () => {
    pass('Gala Silver Palm has better connectivity than Shela Elegance.')
  })
})

// ─────────────────────────────────────────────────────────────────
// CHECK 13 — FAKE_BOOKING_CLAIM
// ─────────────────────────────────────────────────────────────────
describe('CHECK 13 — Fake Booking Claim', () => {
  it('fails "visit scheduled" without card', () => {
    fail('Your visit has been scheduled. Our team will call you.', {}, 'FAKE_BOOKING_CLAIM')
  })
  it('passes "visit scheduled" with visit_confirmation card', () => {
    const text = 'Your visit is confirmed. <!--CARD:{"type":"visit_confirmation","token":"HST-123"}-->'
    pass(text)
  })
  it('fails "booking confirmed" without card', () => {
    fail('Your booking is confirmed!', {}, 'FAKE_BOOKING_CLAIM')
  })
  it('fails OTP claim', () => {
    fail('OTP sent to your mobile. Enter it to verify.', {}, 'FAKE_BOOKING_CLAIM')
  })
})

// ─────────────────────────────────────────────────────────────────
// CHECK 14 — FABRICATED_BUILDER
// ─────────────────────────────────────────────────────────────────
describe('CHECK 14 — Fabricated Builder', () => {
  it('passes known builder', () => {
    pass('Gala Developers is offering a new phase.', { knownBuilderNames: ['Gala Developers'] })
  })
  it('fails invented builder with business suffix', () => {
    fail('Apex Properties has launched a new project', { knownBuilderNames: [] }, 'FABRICATED_BUILDER')
  })
  it('fails generic solo name excluded', () => {
    // 'Group', 'Properties', 'Builders' etc. alone are not flagged as fabricated
    pass('Properties in this area are well-maintained.', { knownBuilderNames: [] })
  })
})

// ─────────────────────────────────────────────────────────────────
// CHECK 15 — FABRICATED_STAT
// ─────────────────────────────────────────────────────────────────
describe('CHECK 15 — Fabricated Stats', () => {
  it('fails delivered count', () => {
    fail('We have delivered 500 projects in Gujarat', {}, 'FABRICATED_STAT')
  })
  it('fails founding year', () => {
    fail('Serving customers since 1995', {}, 'FABRICATED_STAT')
  })
  it('fails years in business', () => {
    fail('25 years in the real estate business', {}, 'FABRICATED_STAT')
  })
  it('passes no stat', () => {
    pass('The project has modern amenities.')
  })
})

// ─────────────────────────────────────────────────────────────────
// CHECK 16 — FABRICATED_PRICE (unverified project)
// ─────────────────────────────────────────────────────────────────
describe('CHECK 16 — Fabricated Price (unverified)', () => {
  it('fails numeric price near unverified project', () => {
    fail('Skyline Heights is available at ₹45,000 per sqft', {
      unverifiedProjectNames: ['Skyline Heights']
    }, 'FABRICATED_PRICE')
  })
  it('passes price near verified project', () => {
    pass('Gala Silver Palm is priced at ₹45,000 per sqft', {
      knownProjectNames: ['Gala Silver Palm']
    })
  })
  it('passes no price', () => {
    pass('Gala Silver Palm has excellent value.', {
      unverifiedProjectNames: ['Skyline Heights']
    })
  })
})

// ─────────────────────────────────────────────────────────────────
// CHECK 17a — OTP_FABRICATION
// ─────────────────────────────────────────────────────────────────
describe('CHECK 17a — OTP Fabrication', () => {
  it('fails OTP bheja language', () => {
    fail('OTP bheja hai aapke mobile pe', {}, 'OTP_FABRICATION')
  })
  it('fails enter OTP', () => {
    fail('Please enter the OTP sent to your mobile', {}, 'OTP_FABRICATION')
  })
  it('fails OTP resend', () => {
    fail('Resend OTP', {}, 'OTP_FABRICATION')
  })
  it('passes no OTP language', () => {
    pass('We will call you to schedule a visit.')
  })
})

// ─────────────────────────────────────────────────────────────────
// CHECK 17 — FAKE_VISIT_CLAIM
// ─────────────────────────────────────────────────────────────────
describe('CHECK 17 — Fake Visit Claim', () => {
  it('fails "visit booked" without artifact', () => {
    fail('Your visit is booked for tomorrow', {}, 'FAKE_VISIT_CLAIM')
  })
  it('fails visit request note ho gaya', () => {
    fail('Visit request note ho gaya hai', {}, 'FAKE_VISIT_CLAIM')
  })
  it('passes "visit booked" with visit_confirmation artifact', () => {
    const text = 'Your visit is confirmed. <!--CARD:{"type":"visit_confirmation","token":"HST-xyz"}-->'
    pass(text)
  })
})

// ─────────────────────────────────────────────────────────────────
// CHECK 18 — PHONE_REQUEST_IN_PROSE
// ─────────────────────────────────────────────────────────────────
describe('CHECK 18 — Phone Request in Prose', () => {
  it('fails mobile number share', () => {
    fail('Please share your mobile number', {}, 'PHONE_REQUEST_IN_PROSE')
  })
  it('fails number share kar language', () => {
    fail('Number share kar dijiye', {}, 'PHONE_REQUEST_IN_PROSE')
  })
  it('fails OTP verify language', () => {
    fail('OTP verify karein', {}, 'PHONE_REQUEST_IN_PROSE')
  })
  it('passes no phone request', () => {
    pass('We will send you the details via email.')
  })
})

// ─────────────────────────────────────────────────────────────────
// CHECK 19 — PRICE_FABRICATION (unverified project)
// ─────────────────────────────────────────────────────────────────
describe('CHECK 19 — Price Fabrication', () => {
  it('fails per sqft rate near unverified project', () => {
    fail('New Project starts at ₹42,000 per sqft', {
      unverifiedProjectNames: ['New Project']
    }, 'PRICE_FABRICATION')
  })
  it('fails all-in cost near unverified project', () => {
    fail('New Project all-in comes to ₹55L', {
      unverifiedProjectNames: ['New Project']
    }, 'PRICE_FABRICATION')
  })
  it('passes verified project with price', () => {
    pass('Gala Silver Palm basic rate is ₹45,000 per sqft', {
      knownProjectNames: ['Gala Silver Palm']
    })
  })
})

// ─────────────────────────────────────────────────────────────────
// CHECK 20 — FIRST_PERSON_HINDI
// ─────────────────────────────────────────────────────────────────
describe('CHECK 20 — First Person Hindi', () => {
  it('fails main samajhta hoon', () => {
    fail('Main samajhta hoon ki yeh property achhi hai', {}, 'FIRST_PERSON_HINDI')
  })
  it('fails maine bola', () => {
    fail('Maine bola yeh property best hai', {}, 'FIRST_PERSON_HINDI')
  })
  it('fails mujhe chahiye', () => {
    fail('Mujhe additional details chahiye', {}, 'FIRST_PERSON_HINDI')
  })
  it('passes third person', () => {
    pass('The buyer should visit the site.')
  })
})

// ─────────────────────────────────────────────────────────────────
// CHECK 21 — PLACEHOLDER_LEAK
// ─────────────────────────────────────────────────────────────────
describe('CHECK 21 — Placeholder Leak', () => {
  it('fails unsubstituted name placeholder', () => {
    fail('Dear {{name}}, here is your update', {}, 'PLACEHOLDER_LEAK')
  })
  it('fails unsubstituted price placeholder', () => {
    fail('The price is {{price}} per sqft', {}, 'PLACEHOLDER_LEAK')
  })
  it('fails unsubstituted cuid', () => {
    fail('Reference: {{cuid}}', {}, 'PLACEHOLDER_LEAK')
  })
  it('passes no placeholders', () => {
    pass('The price is ₹45,000 per sqft.')
  })
})

// ─────────────────────────────────────────────────────────────────
// CHECK 22 — PRICE_COMMITMENT_LEAK (LOCKS-1)
// ─────────────────────────────────────────────────────────────────
describe('CHECK 22 — Price Commitment Leak (LOCKS-1)', () => {
  it('fails discount percent commit', () => {
    fail('We offer a 3% discount on this property', {}, 'PRICE_COMMITMENT_LEAK')
  })
  it('fails final price commit', () => {
    fail('The final price is ₹45,00,000 all-in', {}, 'PRICE_COMMITMENT_LEAK')
  })
  it('fails confirmed price language', () => {
    fail('Confirmed rate is ₹42,000 per sqft', {}, 'PRICE_COMMITMENT_LEAK')
  })
  it('passes indicative price', () => {
    pass('Prices start from ₹40,000 per sqft.')
  })
})

// ─────────────────────────────────────────────────────────────────
// CHECK 23 — COMMISSION_DISCUSSION_LEAK (LOCKS-2)
// ─────────────────────────────────────────────────────────────────
describe('CHECK 23 — Commission Discussion Leak (LOCKS-2)', () => {
  it('fails commission percent', () => {
    fail('Our commission is 2.5 percent', {}, 'COMMISSION_DISCUSSION_LEAK')
  })
  it('fails brokerage percent', () => {
    fail('Brokerage is 1% of the deal value', {}, 'COMMISSION_DISCUSSION_LEAK')
  })
  it('fails broker fee percent', () => {
    fail('Broker fee of 2% applies', {}, 'COMMISSION_DISCUSSION_LEAK')
  })
  it('passes no commission talk', () => {
    pass('The property has excellent investment potential.')
  })
})

// ─────────────────────────────────────────────────────────────────
// EDGE CASES
// ─────────────────────────────────────────────────────────────────
describe('Edge cases', () => {
  it('empty string passes', () => {
    pass('')
  })
  it('very long clean response passes', () => {
    const text = 'This is a great property. '.repeat(200)
    pass(text, { classified: { intent: 'general_query', persona: 'premium' } })
  })
  it('multiple violations collected correctly', () => {
    const text = 'Call 9876543210 for a 3% discount on Skyline Heights'
    const r = checkResponse(text, { knownProjectNames: [], unverifiedProjectNames: ['Skyline Heights'] })
    expect(r.passed).toBe(false)
    expect(r.violations.length).toBeGreaterThanOrEqual(3)
  })
  it('knownProjectNames empty list does not false-positive', () => {
    pass('South Bopal has good connectivity.')
  })
  it('buyerMessage undefined handled gracefully', () => {
    pass('The property is well-located.')
  })
  it('classified undefined uses defaults', () => {
    pass('Great project!')
  })
  it('unverifiedProjectNames empty list handled', () => {
    pass('Gala Silver Palm has the best connectivity.')
  })
  it('all CHECKs fire on maximally violating response', () => {
    const text = 'Call 9876543210. We offer a 5% discount. OTP bheja. Best project is Skyline Heights — 3% commission. Guaranteed returns. I recommend it. '.repeat(3)
    const r = checkResponse(text, {
      knownProjectNames: [],
      unverifiedProjectNames: ['Skyline Heights'],
      buyerMessage: 'kya hai project',
      classified: { intent: 'general_query', persona: 'premium' }
    })
    expect(r.passed).toBe(false)
    expect(r.violations.length).toBeGreaterThanOrEqual(8)
  })
})

// ─────────────────────────────────────────────────────────────────
// STREAMING GUARD
// ─────────────────────────────────────────────────────────────────

describe('StreamingGuard', () => {
  let guard: StreamingGuard

  beforeEach(() => {
    guard = new StreamingGuard({ onAbort: (() => {}) as any })  // suppress throws in tests
  })

  it('fires on complete phone number in single chunk', () => {
    guard.onChunk('Call us at 9876543210 for details')
    expect(guard.violations.some(v => v.includes('CONTACT_LEAK'))).toBe(true)
  })

  it('accumulates and fires when phone number completes across chunks', () => {
    // Phone number "9876543210" spans 3 chunks — no single chunk has 10 digits
    guard.onChunk('Call ')
    guard.onChunk('987')    // 3 digits — no match
    guard.onChunk('6543210') // completes "9876543210" — should fire
    expect(guard.violations.some(v => v.includes('CONTACT_LEAK'))).toBe(true)
  })

  it('fires on markdown in observe mode (no throw)', () => {
    guard.onChunk('Here are the **highlights**')
    expect(guard.violations.some(v => v.includes('NO_MARKDOWN'))).toBe(true)
    expect(() => guard.onChunk('More content')).not.toThrow()
  })

  it('reset clears violations and accumulated text', () => {
    guard.onChunk('**bold** content here')
    expect(guard.violations.length).toBeGreaterThan(0)
    guard.reset()
    expect(guard.violations.length).toBe(0)
  })

  it('windowSize trims very long input', () => {
    guard.onChunk('A'.repeat(9000))
    // After trim, accumulated should be less than 9000 chars
    expect((guard as any).accumulated.length).toBeLessThan(9000)
  })
})
