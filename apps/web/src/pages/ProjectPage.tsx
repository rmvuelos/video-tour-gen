import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { Alert } from '../components/ui/Alert'
import { PageTitle } from '../components/PageTitle'
import { Uploader } from '../components/Uploader'
import { ApiRequestError } from '../lib/api'
import { getProject, type Project } from '../lib/projects'
import { useDocumentTitle } from '../lib/use-document-title'

type State = { project: Project } | { error: string } | null

const EDITABLE = new Set(['draft', 'needs_fix'])

function ProjectView({ id }: { id: string }) {
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
      <PageTitle className="text-title-lg font-semibold break-words">
        {state.project.name}
      </PageTitle>
      {EDITABLE.has(state.project.status) ? (
        <Uploader key={state.project.id} projectId={state.project.id} />
      ) : (
        <p className="text-body text-fg-muted">
          This project was already sent, so its files can&apos;t be changed.
        </p>
      )}
    </div>
  )
}

/** `key` gives every project its own state, so a new id never shows the previous project. */
export function ProjectPage() {
  const { id = '' } = useParams()
  return <ProjectView key={id} id={id} />
}
