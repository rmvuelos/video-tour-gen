import { lazy, Suspense } from 'react'

// The gallery is dev and e2e only. The import sits in the dead branch so production builds
// drop the chunk (scripts/check-no-dev-routes.mjs fails CI if it ever ships).
const galleryEnabled = import.meta.env.DEV || import.meta.env.MODE === 'e2e'
const UiGallery = galleryEnabled ? lazy(() => import('./dev/UiGallery')) : null

export function App() {
  // shortcut: pathname switch instead of a router, until phase 4 adds one.
  if (UiGallery && window.location.pathname === '/dev/ui') {
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
