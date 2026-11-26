import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import { RequireAuth } from './auth/RequireAuth'
import { PageTitle } from './components/PageTitle'
import { AppShell } from './layout/AppShell'
import { useDocumentTitle } from './lib/use-document-title'
import { AuthPage } from './pages/AuthPage'
import { NotFound } from './pages/NotFound'
import { ProjectPage } from './pages/ProjectPage'

// The gallery is dev and e2e only. The import sits in the dead branch so production builds
// drop the chunk (scripts/check-no-dev-routes.mjs fails CI if it ever ships).
const galleryEnabled = import.meta.env.DEV || import.meta.env.MODE === 'e2e'
const UiGallery = galleryEnabled ? lazy(() => import('./dev/UiGallery')) : null

function Home() {
  useDocumentTitle('Home')
  return <PageTitle className="text-title font-semibold">Welcome back</PageTitle>
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage key="login" mode="login" />} />
      <Route path="/signup" element={<AuthPage key="signup" mode="signup" />} />
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
        <Route element={<AppShell />}>
          <Route path="/" element={<Home />} />
          <Route path="/projects/:id" element={<ProjectPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
