import { Navigate, Outlet, useLocation } from 'react-router'
import { Loading } from '../components/Loading'
import { useSession } from './session'

/** Layout route: signed-out users go to /login and come back to `state.from` (a path: check it with safeReturnPath). */
export function RequireAuth() {
  const session = useSession()
  const location = useLocation()
  if (session === undefined) {
    return <Loading />
  }
  if (session === null)
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
      />
    )
  return <Outlet />
}
