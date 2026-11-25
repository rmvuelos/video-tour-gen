import { Navigate, Outlet, useLocation } from 'react-router'
import { useSession } from './session'

/** Layout route: signed-out users go to /login and come back to `state.from` after signing in. */
export function RequireAuth() {
  const session = useSession()
  const location = useLocation()
  if (session === undefined) {
    return (
      <p role="status" className="p-8 text-body text-fg-muted">
        Loading…
      </p>
    )
  }
  if (session === null) return <Navigate to="/login" replace state={{ from: location }} />
  return <Outlet />
}
