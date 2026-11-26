/** Shown while Supabase has not said yet whether there is a session. */
export function Loading() {
  return (
    <main className="p-8">
      <p role="status" className="text-body text-fg-muted">
        Loading…
      </p>
    </main>
  )
}
