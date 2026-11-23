import { lazy, Suspense } from 'react'

// Dead-code eliminated from production builds (only dev and the e2e mode keep it).
const UiGallery = lazy(() => import('./dev/UiGallery'))
const galleryEnabled = import.meta.env.DEV || import.meta.env.MODE === 'e2e'

export function App() {
  // shortcut: pathname switch instead of a router, until phase 4 adds one.
  if (galleryEnabled && window.location.pathname === '/dev/ui') {
    return (
      <Suspense fallback={null}>
        <UiGallery />
      </Suspense>
    )
  }
  return (
    <main className="p-8">
      <h1 className="text-title font-semibold">rooma</h1>
    </main>
  )
}
