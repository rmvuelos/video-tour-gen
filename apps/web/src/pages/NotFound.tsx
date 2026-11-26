import { Link } from 'react-router'
import { useDocumentTitle } from '../lib/use-document-title'

export function NotFound() {
  useDocumentTitle('Page not found')
  return (
    <main className="flex flex-col items-start gap-4 p-8">
      <h1 className="text-title font-semibold text-fg">Page not found</h1>
      <Link to="/" className="text-body font-medium text-fg underline">
        Back to home
      </Link>
    </main>
  )
}
