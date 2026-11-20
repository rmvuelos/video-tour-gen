// Detects AI attribution in a commit message. Human co-authors and CLAUDE.md edits are allowed.
const ASSISTANTS = 'claude|anthropic|copilot|chatgpt|openai|cursor'
const CLAUDE_FILES = /claude(\.local)?\.md/gi
const RULES = [
  new RegExp(`^co-authored-by:.*(${ASSISTANTS})`, 'im'),
  new RegExp(String.raw`generated (with|by)\s+\[?(${ASSISTANTS})`, 'i'),
  /\b(claude|anthropic)\b/i,
]

export function hasAttribution(message) {
  const text = message.replace(CLAUDE_FILES, '')
  return RULES.some((rule) => rule.test(text))
}
