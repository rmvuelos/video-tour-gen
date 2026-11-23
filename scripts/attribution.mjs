// Detects AI attribution in a commit message. Human co-authors, CLAUDE.md and .claude/ paths are allowed.
// shortcut: a human whose name is exactly an assistant word (e.g. "Cody") trips the trailer rule;
// reword the trailer or revisit the list if it ever happens.
const ASSISTANTS = String.raw`\b(?:claude|anthropic|copilot|chatgpt|openai|cursor|gemini|codex|devin|aider|windsurf|codeium|cody|gpt)\b`
const ALLOWED_PATHS = /claude(?:\.local)?\.md|\.claude\//gi
const RULES = [
  // Trailer naming an assistant, or a known bot address (a human's personal GitHub noreply is fine).
  new RegExp(
    `^co-authored-by:.*(?:${ASSISTANTS}|noreply@anthropic\\.com|\\[bot\\]@users\\.noreply\\.github\\.com)`,
    'im',
  ),
  new RegExp(String.raw`generated (?:with|by)\s+\[?(?:${ASSISTANTS})`, 'i'),
  /\b(?:claude|anthropic)\b/i,
]

export function hasAttribution(message) {
  // NFKC folds look-alike characters; \p{Cf} drops zero-width ones used to split a word.
  const text = message
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')
    .replace(ALLOWED_PATHS, '')
  return RULES.some((rule) => rule.test(text))
}
