import { useEffect } from 'react'
import { useLocation, useOutletContext } from 'react-router'

export type ProjectCrumb = { path: string; name: string }
type ShellContext = { setCrumb: (crumb: ProjectCrumb | undefined) => void }

/**
 * Gives the shell the project name for the last breadcrumb; outside the shell it does nothing.
 * The name travels with its path, so the shell can ignore it for any other route.
 */
export function useProjectCrumb(name: string | undefined) {
  const shell = useOutletContext<ShellContext | undefined>()
  const { pathname } = useLocation()
  const setCrumb = shell?.setCrumb
  useEffect(() => {
    setCrumb?.(name === undefined ? undefined : { path: pathname, name })
    return () => setCrumb?.(undefined)
  }, [setCrumb, pathname, name])
}
