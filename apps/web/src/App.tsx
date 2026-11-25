import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import { RequireAuth } from './auth/RequireAuth'

// The gallery is dev and e2e only. The import sits in the dead branch so production builds
// drop the chunk (scripts/check-no-dev-routes.mjs fails CI if it ever ships).
const galleryEnabled = import.meta.env.DEV || import.meta.env.MODE === 'e2e'
const UiGallery = galleryEnabled ? lazy(() => import('./dev/UiGallery')) : null

export function App() {
  return (
    <Routes>
      {/* shortcut: placeholder so the redirect lands somewhere; feature/web-login replaces it. */}
      <Route path="/login" element={<h1 className="p-8 text-title font-semibold">Sign in</h1>} />
      {UiGallery && (
        <Route
          path="/dev/ui"
          element={
            <Suspense fallback={null}>
              <UiGallery />
            </Suspense>
          }
        />
      )}
      <Route element={<RequireAuth />}>
        <Route
          path="/"
          element={
            <main className="p-8">
              <h1 className="text-title font-semibold">rooma</h1>
            </main>
          }
        />
      </Route>
    </Routes>
  )
}
