import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { Alert } from '../components/ui/Alert'
import { PageTitle } from '../components/PageTitle'
import { IngestStatus } from '../components/IngestStatus'
import { Uploader } from '../components/Uploader'
import { ApiRequestError } from '../lib/api'
import { getProject, type Project } from '../lib/projects'
import { useDocumentTitle } from '../lib/use-document-title'

type State = { project: Project } | { error: string } | null

function ProjectBody({
  project,
  onSubmitted,
  onSettled,
}: {
  project: Project
  onSubmitted: () => void
  onSettled: () => void
}) {
  if (project.status === 'ingesting') {
    // A failed job stays here with its retry; only a finished one changes the project.
    return (
      <IngestStatus
        key={project.id}
        projectId={project.id}
        onSettled={(job) => job.status === 'done' && onSettled()}
      />
    )
  }
  if (project.status === 'ready') {
    return <p className="text-body text-fg">Your files are ready.</p>
  }
  return (
    <Uploader
      key={project.id}
      projectId={project.id}
      initial={{ area_m2: project.area_m2, description: project.description }}
      onSubmitted={onSubmitted}
    />
  )
}

function ProjectView({ id }: { id: string }) {
  const [state, setState] = useState<State>(null)
  // Bumped to read the project again (after a job settles).
  const [reads, setReads] = useState(0)
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
  }, [id, reads])

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
      <ProjectBody
        project={state.project}
        onSubmitted={() => setState({ project: { ...state.project, status: 'ingesting' } })}
        onSettled={() => setReads((n) => n + 1)}
      />
    </div>
  )
}

/** `key` gives every project its own state, so a new id never shows the previous project. */
export function ProjectPage() {
  const { id = '' } = useParams()
  return <ProjectView key={id} id={id} />
}
