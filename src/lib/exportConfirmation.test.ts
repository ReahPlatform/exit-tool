import { describe, expect, it } from 'vitest'

import { EXPORT_CONFIRMATION_PHRASE, isExportConfirmationPhrase } from './exportConfirmation'

describe('isExportConfirmationPhrase', () => {
  it('accepts the required phrase without making case or surrounding whitespace a trap', () => {
    expect(isExportConfirmationPhrase(EXPORT_CONFIRMATION_PHRASE)).toBe(true)
    expect(isExportConfirmationPhrase(' export ')).toBe(true)
  })

  it('rejects partial or unrelated values', () => {
    expect(isExportConfirmationPhrase('')).toBe(false)
    expect(isExportConfirmationPhrase('EX')).toBe(false)
    expect(isExportConfirmationPhrase('EXIT')).toBe(false)
  })
})
