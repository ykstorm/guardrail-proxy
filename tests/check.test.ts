import { describe, it, expect } from 'vitest'
import { checkResponse } from '../src'

describe('checkResponse', () => {
  it('passes clean content', () => {
    const result = checkResponse('Hello, how can I help you today?')
    expect(result.passed).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('catches phone number leak', () => {
    const result = checkResponse('Call us at 9876543210')
    expect(result.passed).toBe(false)
    expect(result.violations.some(v => v.includes('CONTACT_LEAK'))).toBe(true)
  })

  it('catches phone number with prefix', () => {
    const result = checkResponse('call me at: 9988776655')
    expect(result.passed).toBe(false)
  })

  it('handles empty string', () => {
    const result = checkResponse('')
    expect(result.passed).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('passes normal price question without lock trigger', () => {
    const result = checkResponse('What is the price per sqft?')
    expect(result.passed).toBe(true)
  })

  it('passes question without context', () => {
    const result = checkResponse('Tell me about Gala Developers')
    expect(result.passed).toBe(true)
  })

  it('passes normal commission question', () => {
    const result = checkResponse('Do you charge commission?')
    expect(result.passed).toBe(true)
  })
})