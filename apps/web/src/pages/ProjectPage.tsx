import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Alert } from '../components/ui/Alert'
import { ApiRequestError } from '../lib/api'
import { getProject, type Project } from '../lib/projects'
import { useDocumentTitle } from '../lib/use-document-title'

type State = { project: Project } | { error: string } | null

// shortcut: only the name and a link to the upload step; the uploader (4d) replaces this page.
export function ProjectPage() {
  const { id = '' } = useParams()
  const [state, setState] = useState<State>(null)
  useDocumentTitle(state && 'project' in state ? state.project.name : 'Project')

  useEffect(() => {
    const controller = new AbortController()
    getProject(id, controller.signal).then(
      (project) => setState({ project }),
      (error: unknown) => {
        if (controller.signal.aborted) return
        setState({
          error: error instanceof ApiRequestError ? error.message : 'Something went wrong.',
        })
      },
    )
    return () => controller.abort()
  }, [id])

  if (state && 'error' in state) return <Alert tone="error">{state.error}</Alert>
  if (!state)
    return (
      <p role="status" className="text-body text-fg-muted">
        Loading project…
      </p>
    )
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-title-lg font-semibold">{state.project.name}</h1>
      {/* The route behind this link arrives with the uploader (4d). */}
      <Link to={`/projects/${encodeURIComponent(id)}/upload`} className="font-medium underline">
        Upload assets
      </Link>
    </div>
  )
}
