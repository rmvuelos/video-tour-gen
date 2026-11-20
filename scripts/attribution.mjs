// Detects AI attribution in a commit message.
const FORBIDDEN = /co-authored-by|generated with|claude|anthropic/i

export function hasAttribution(message) {
  return FORBIDDEN.test(message)
}
