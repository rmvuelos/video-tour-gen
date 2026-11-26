import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { PageTitle } from '../components/PageTitle'
import { PageTitle } from '../components/PageTitle'
import { Eyebrow } from '../components/ui/Eyebrow'
import { Field } from '../components/ui/Field'
import { Input } from '../components/ui/Input'
import { ApiRequestError } from '../lib/api'
import {
  PAGE_SIZE,
  createProject,
  listProjects,
  projectNameError,
  type Project,
} from '../lib/projects'
import { useDocumentTitle } from '../lib/use-document-title'

const STATUS_TEXT: Record<Project['status'], string> = {
  draft: 'Draft',
  ingesting: 'Processing',
  ready: 'Ready',
  needs_fix: 'Needs fixes',
}
const formatDate = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' })

const messageOf = (error: unknown) =>
  error instanceof ApiRequestError ? error.message : 'Something went wrong.'

type Loaded = { items: Project[]; hasMore: boolean; loading: boolean; error: string | null }

function useProjects() {
  // `attempt` makes a retry of the same offset a new request for the effect.
  const [request, setRequest] = useState({ offset: 0, attempt: 0 })
  const [state, setState] = useState<Loaded>({
    items: [],
    hasMore: false,
    loading: true,
    error: null,
  })

  useEffect(() => {
    const controller = new AbortController()
    listProjects(request.offset, controller.signal).then(
      (page) =>
        setState((prev) => ({
          items: request.offset === 0 ? page.items : [...prev.items, ...page.items],
          hasMore: page.items.length === PAGE_SIZE,
          loading: false,
          error: null,
        })),
      (error: unknown) => {
        if (controller.signal.aborted) return
        setState((prev) => ({ ...prev, loading: false, error: messageOf(error) }))
      },
    )
    return () => controller.abort()
  }, [request])

  // shortcut: offset paging (the API has no total); a project created elsewhere meanwhile can
  // shift a page. Move to keyset paging with the API when lists get long.
  const start = (offset: number) => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    setRequest((prev) => ({ offset, attempt: prev.attempt + 1 }))
  }
  return {
    ...state,
    loadMore: () => start(state.items.length),
    retry: () => start(request.offset),
  }
}

function CreateProject() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [error, setError] = useState<string>()
  const [failure, setFailure] = useState<string>()
  const [pending, setPending] = useState(false)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending) return
    const invalid = projectNameError(name)
    setError(invalid)
    setFailure(undefined)
    if (invalid) return
    const current = (controller.current = new AbortController())
    setPending(true)
    try {
      const project = await createProject(name, current.signal)
      await navigate(`/projects/${project.id}`)
    } catch (e) {
      if (current.signal.aborted) return
      setFailure(messageOf(e))
      setPending(false)
    }
  }

  return (
    <Card className="p-card">
      <form noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
        <h2 className="text-subtitle font-semibold">New project</h2>
        {failure && <Alert tone="error">{failure}</Alert>}
        <Field label="Project name" required {...(error && { error })}>
          {(control) => (
            <Input
              name="name"
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
              {...control}
            />
          )}
        </Field>
        <Button
          type="submit"
          aria-disabled={pending}
          className="self-start aria-disabled:cursor-not-allowed aria-disabled:opacity-(--opacity-disabled)"
        >
          {pending ? 'Creating…' : 'Create project'}
        </Button>
      </form>
    </Card>
  )
}

function ProjectRow({ project }: { project: Project }) {
  return (
    <li>
      <Card className="flex items-center justify-between gap-4 px-card py-5">
        <Link
          to={`/projects/${project.id}`}
          className="min-w-0 truncate text-subtitle font-semibold"
        >
          {project.name}
        </Link>
        <div className="flex shrink-0 items-center gap-6 text-label text-fg-muted">
          <span>{STATUS_TEXT[project.status]}</span>
          <time dateTime={project.created_at}>
            {formatDate.format(new Date(project.created_at))}
          </time>
        </div>
      </Card>
    </li>
  )
}

export function ProjectsPage() {
  useDocumentTitle('My projects')
  const { items, hasMore, loading, error, loadMore, retry } = useProjects()

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow tone="accent">Library</Eyebrow>
        <PageTitle className="text-title-lg font-semibold">My projects</PageTitle>
      </div>
      <CreateProject />
      {error && (
        <Alert tone="error" action={{ label: 'Try again', onClick: retry }}>
          {error}
        </Alert>
      )}
      {loading && items.length === 0 && (
        <p role="status" className="text-body text-fg-muted">
          Loading projects…
        </p>
      )}
      {!loading && !error && items.length === 0 && (
        <p className="text-body text-fg-muted">No projects yet. Name one above to get started.</p>
      )}
      {items.length > 0 && (
        <ul aria-label="Projects" className="flex flex-col gap-card-gap">
          {items.map((project) => (
            <ProjectRow key={project.id} project={project} />
          ))}
        </ul>
      )}
      {hasMore && (
        <Button variant="secondary" disabled={loading} onClick={loadMore} className="self-start">
          {loading ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </div>
  )
}
