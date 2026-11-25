/** Only same-site paths: no `//host`, no `/\\host`, no scheme. Anything else goes home. */
export function safeReturnPath(value: unknown): string {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : '/'
}
