import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hasAttribution } from './attribution.mjs'

const mustFail = [
  'feat(cv): x\n\nCo-Authored-By: Claude <noreply@anthropic.com>',
  'feat(cv): x\n\nCo-authored-by: Copilot <copilot@github.com>',
  'feat(cv): x\n\nGenerated with [Claude Code](https://claude.com/claude-code)',
  'feat(cv): x\n\nwritten by claude',
  'chore(docs): anthropic notes',
  'feat(cv): x\n\nCo-Authored-By: Gemini <gemini@google.com>',
  'feat(cv): x\n\nGenerated with Codex',
  'feat(cv): x\n\nCo-Authored-By: Devin AI <devin-ai-integration[bot]@users.noreply.github.com>',
  'feat(cv): x\n\nCo-Authored-By: Helper <noreply@anthropic.com>',
  'feat(cv): x\n\nCo-Authored-By: GPT-5 <bot@example.com>',
  'feat(cv): x\n\nwritten by Cl​aude',
  'feat(cv): x\n\nwritten by Ｃlaude',
]
const mustPass = [
  'docs(docs): update claude.md rules',
  'docs(docs): update CLAUDE.local.md',
  'chore(infra): add .claude/ settings',
  'feat(cv): x\n\nCo-Authored-By: Adria Martinez <adria@example.com>',
  'feat(cv): x\n\nCo-Authored-By: Adria <12345+adria@users.noreply.github.com>',
  'fix(cv): adjust gpt-free threshold',
  'feat(cv): detectar muros con transformada de Hough',
]

for (const msg of mustFail) {
  test(`rejects: ${msg.replace(/\n/g, ' | ')}`, () => assert.ok(hasAttribution(msg)))
}
for (const msg of mustPass) {
  test(`accepts: ${msg.replace(/\n/g, ' | ')}`, () => assert.ok(!hasAttribution(msg)))
}
