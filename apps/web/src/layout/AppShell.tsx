import { useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { useSession } from '../auth/session'
import { Avatar } from '../components/ui/Avatar'
import { Breadcrumb } from '../components/ui/Breadcrumb'
import { Sidebar } from '../components/ui/Sidebar'
import { getSupabase } from '../lib/supabase'
import type { ProjectCrumb } from '../lib/use-project-crumb'

// shortcut: the uploader lives at /projects/:id, but the sidebar has no current project; it points at the list.
const HREFS = { upload: '/projects', projects: '/projects' }

function userLabel(email: string | undefined) {
  const name = email?.split('@')[0] || 'You'
  return { name, initials: name.slice(0, 2).toUpperCase() }
}

// crumbs come from the path; a project page supplies its name (useProjectCrumb), "Project" until then.
function crumbsFor(pathname: string, projectName: string | undefined) {
  const root = [{ label: 'Workspace' }, { label: 'Projects', href: '/projects' }]
  return pathname.startsWith('/projects/') ? [...root, { label: projectName ?? 'Project' }] : root
}

/** Authenticated layout: sidebar and header around the routed page. */
export function AppShell() {
  const session = useSession()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const user = userLabel(session?.user.email)
  const [crumb, setCrumb] = useState<ProjectCrumb>()
  // Stable, so the page's effect does not run again on every shell render.
  const outletContext = useMemo(() => ({ setCrumb }), [])
  // A name for another route (the previous project, one frame late) is ignored.
  const projectName = crumb?.path === pathname ? crumb.name : undefined

  return (
    <div className="flex min-h-screen bg-canvas text-fg">
      <Sidebar
        current="projects"
        hrefs={HREFS}
        user={user}
        onNavigate={(id, event) => {
          // Ctrl/Cmd/Shift-click and middle click keep the browser default (new tab or window).
          if (
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          )
            return
          event.preventDefault()
          void navigate(HREFS[id])
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col pr-10 pl-gutter">
        <header className="flex h-25 shrink-0 items-center justify-between gap-6 border-b border-line">
          <Breadcrumb items={crumbsFor(pathname, projectName)} className="min-w-0" />
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => void getSupabase().auth.signOut({ scope: 'local' })}
              className="min-h-6 cursor-pointer rounded-control px-2 text-label font-medium text-fg underline"
            >
              Sign out
            </button>
            <Avatar variant="solid" initials={user.initials} aria-hidden="true" />
          </div>
        </header>
        <main className="flex-1 py-10">
          {/* key: a new route remounts the page, so its heading takes focus again */}
          <Outlet key={pathname} context={outletContext} />
        </main>
      </div>
    </div>
  )
}
