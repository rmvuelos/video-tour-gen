import { useEffect } from 'react'

/** One title per route (WCAG 2.4.2). */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · rooma`
  }, [title])
}
