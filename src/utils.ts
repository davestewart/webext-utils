/**
 * Ensure a value is an array
 */
export function toArray<T> (value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value]
}

/**
 * Pluralize a word based on count
 *
 * @param word        The word to pluralize, use 'singular|plural' format for irregular plurals
 * @param count       The count to base the pluralization on
 * @param includeWord Whether to include the count in the returned string
 */
export function plural (word: string, count: number | any[], includeWord = true): string {
  const [single, plural = `${single}s`] = word.split('|')
  const value = Array.isArray(count) ? count.length : count
  const wordToUse = value === 1
    ? single
    : plural || single
  return includeWord
    ? `${value} ${wordToUse}`
    : wordToUse
}
