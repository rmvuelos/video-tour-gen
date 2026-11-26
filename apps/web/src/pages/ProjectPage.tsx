import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { Alert } from '../components/ui/Alert'
import { PageTitle } from '../components/PageTitle'
import { IngestStatus } from '../components/IngestStatus'
import { UploadHeader } from '../components/UploadHeader'
import { Uploader } from '../components/Uploader'
import { ApiRequestError } from '../lib/api'
import { getProject, type Project } from '../lib/projects'
import { useDocumentTitle } from '../lib/use-document-title'

// After a job finishes the project may take a moment to show its new status.
const REREAD_MS = 2000
const MAX_REREADS = 5

type State = { project: Project } | { error: string } | null

/** No next step exists yet: the heading takes the focus so the change is announced. */
function ReadyView() {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  return (
    <h2 ref={heading} tabIndex={-1} className="text-title-sm font-semibold outline-none">
      Your files are ready
    </h2>
  )
}

function ProjectBody({
  project,
  onSubmitted,
  onSettled,
  onNotEditable,
}: {
  project: Project
  onSubmitted: () => void
  onSettled: () => void
  onNotEditable: () => void
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
    return <ReadyView />
  }
  return (
    <>
      <UploadHeader />
      <Uploader
        key={project.id}
        projectId={project.id}
        projectName={project.name}
        initial={{ area_m2: project.area_m2, description: project.description }}
        onSubmitted={onSubmitted}
        onNotEditable={onNotEditable}
      />
    </>
  )
}

function ProjectView({ id }: { id: string }) {
  const [state, setState] = useState<State>(null)
  // Bumped to read the project again (after a job settles).
  const [reads, setReads] = useState(0)
  useDocumentTitle(state && 'project' in state ? state.project.name : 'Project')

  // Set once a job is done: until the project shows its new status, errors and a stale
  // "ingesting" keep the current view and read again instead of replacing it.
  const expecting = useRef(false)
  const attempts = useRef(0)

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const later = (giveUp: string) => {
      attempts.current += 1
      if (attempts.current < MAX_REREADS)
        timer = setTimeout(() => setReads((n) => n + 1), REREAD_MS)
      else {
        expecting.current = false
        setState({ error: giveUp })
      }
    }
    getProject(id, controller.signal).then(
      (project) => {
        if (controller.signal.aborted) return
        if (expecting.current && project.status === 'ingesting') {
          return later('We could not confirm the result yet.')
        }
        expecting.current = false
        attempts.current = 0
        setState({ project })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        const message = error instanceof ApiRequestError ? error.message : 'Something went wrong.'
        if (expecting.current) return later(message)
        setState({ error: message })
      },
    )
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [id, reads])

  const reread = () => setReads((n) => n + 1)
  const tryAgain = () => {
    expecting.current = false
    attempts.current = 0
    setState(null)
    reread()
  }

  if (state && 'error' in state) {
    return (
      <Alert tone="error" action={{ label: 'Try again', onClick: tryAgain }}>
        {state.error}
      </Alert>
    )
  }
  if (!state)
    return (
      <p role="status" className="text-body text-fg-muted">
        Loading project…
      </p>
    )
  const editing = state.project.status === 'draft' || state.project.status === 'needs_fix'
  return (
    <div className="flex flex-col gap-hero">
      {/* In the upload view the name is shown in the overview card: the h1 is for assistive tech. */}
      <PageTitle className={`break-words ${editing ? 'sr-only' : 'text-title-lg font-semibold'}`}>
        {state.project.name}
      </PageTitle>
      <ProjectBody
        project={state.project}
        onSubmitted={() => setState({ project: { ...state.project, status: 'ingesting' } })}
        onSettled={() => {
          expecting.current = true
          attempts.current = 0
          reread()
        }}
        onNotEditable={reread}
      />
    </div>
  )
}

/** `key` gives every project its own state, so a new id never shows the previous project. */
export function ProjectPage() {
  const { id = '' } = useParams()
  return <ProjectView key={id} id={id} />
}
