import { useEffect } from 'react'
import { useOutletContext } from 'react-router'

type ShellContext = { setProjectName: (name: string | undefined) => void }

/** Gives the shell the project name for the last breadcrumb; outside the shell it does nothing. */
export function useProjectCrumb(name: string | undefined) {
  const shell = useOutletContext<ShellContext | undefined>()
  const set = shell?.setProjectName
  useEffect(() => {
    set?.(name)
    return () => set?.(undefined)
  }, [set, name])
}
