import { Outlet, useLocation, useNavigate } from 'react-router'
import { useSession } from '../auth/session'
import { Avatar } from '../components/ui/Avatar'
import { Breadcrumb } from '../components/ui/Breadcrumb'
import { Sidebar } from '../components/ui/Sidebar'
import { getSupabase } from '../lib/supabase'

// shortcut: "Upload assets" has no project to open until the uploader (4d); it points at the list.
const HREFS = { upload: '/projects', projects: '/projects' }

function userLabel(email: string | undefined) {
  const name = email?.split('@')[0] || 'You'
  return { name, initials: name.slice(0, 2).toUpperCase() }
}

// shortcut: crumbs come from the path; show the project name instead of "Project" when the page can supply it.
function crumbsFor(pathname: string) {
  const root = [{ label: 'Workspace' }, { label: 'Projects', href: '/projects' }]
  return pathname.startsWith('/projects/') ? [...root, { label: 'Project' }] : root
}

/** Authenticated layout: sidebar and header around the routed page. */
export function AppShell() {
  const session = useSession()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const user = userLabel(session?.user.email)
  const onProject = pathname.startsWith('/projects/')

  return (
    <div className="flex min-h-screen bg-canvas text-fg">
      <Sidebar
        current={onProject ? 'upload' : 'projects'}
        hrefs={HREFS}
        user={user}
        onNavigate={(id, event) => {
          event.preventDefault()
          void navigate(HREFS[id])
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col pr-10 pl-gutter">
        <header className="flex h-25 shrink-0 items-center justify-between gap-6 border-b border-line">
          <Breadcrumb items={crumbsFor(pathname)} className="min-w-0" />
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
          <Outlet />
        </main>
      </div>
    </div>
  )
}
