export const EXPORT_CONFIRMATION_PHRASE = 'EXPORT'

export function isExportConfirmationPhrase(value: string): boolean {
  return value.trim().toUpperCase() === EXPORT_CONFIRMATION_PHRASE
}
