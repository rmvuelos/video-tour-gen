export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'refactor', 'docs', 'test', 'chore', 'perf', 'ci']],
    'scope-empty': [2, 'never'],
    'scope-enum': [2, 'always', ['frontend', 'backend', 'cv', 'scene', 'infra', 'docs']],
    'subject-case': [2, 'always', 'lower-case'],
    'header-max-length': [2, 'always', 72],
  },
}
