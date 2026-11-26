import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { PageTitle } from '../components/PageTitle'
import { Eyebrow } from '../components/ui/Eyebrow'
import { Field } from '../components/ui/Field'
import { Input } from '../components/ui/Input'
import { ApiRequestError } from '../lib/api'
import {
  NAME_MAX,
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

type Loaded = {
  items: Project[]
  nextOffset: number
  hasMore: boolean
  loading: boolean
  error: string | null
  /** What the last "Load more" added: its count and the first new project (to focus). */
  added: { count: number; firstId: string | undefined } | null
}

function useProjects() {
  // `attempt` makes a retry of the same offset a new request for the effect.
  const [request, setRequest] = useState({ offset: 0, attempt: 0 })
  const [state, setState] = useState<Loaded>({
    items: [],
    nextOffset: 0,
    hasMore: false,
    loading: true,
    error: null,
    added: null,
  })

  useEffect(() => {
    const controller = new AbortController()
    listProjects(request.offset, controller.signal).then(
      (page) =>
        setState((prev) => {
          const known = new Set(prev.items.map((p) => p.id))
          const fresh = page.items.filter((p) => !known.has(p.id))
          const more = request.offset > 0
          return {
            items: more ? [...prev.items, ...fresh] : page.items,
            // The next page starts after what the API answered, whatever we de-duplicated.
            nextOffset: request.offset + page.items.length,
            hasMore: page.items.length === PAGE_SIZE,
            loading: false,
            error: null,
            added: more ? { count: fresh.length, firstId: fresh[0]?.id } : null,
          }
        }),
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
    setState((prev) => ({ ...prev, loading: true, error: null, added: null }))
    setRequest((prev) => ({ offset, attempt: prev.attempt + 1 }))
  }
  return {
    ...state,
    loadMore: () => start(state.nextOffset),
    retry: () => start(request.offset),
  }
}

function CreateProject() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [error, setError] = useState<string>()
  // An object, so the same message twice is a new failure and takes focus again.
  const [failure, setFailure] = useState<{ message: string }>()
  const [pending, setPending] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const alert = useRef<HTMLDivElement>(null)
  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => alert.current?.focus(), [failure])

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending) return
    const invalid = projectNameError(name)
    setError(invalid)
    setFailure(undefined)
    if (invalid) return void input.current?.focus()
    const current = (controller.current = new AbortController())
    setPending(true)
    try {
      const project = await createProject(name, current.signal)
      await navigate(`/projects/${project.id}`)
    } catch (e) {
      if (current.signal.aborted) return
      setFailure({ message: messageOf(e) })
      setPending(false)
    }
  }

  return (
    <Card className="p-card">
      <form noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
        <h2 className="text-subtitle font-semibold">New project</h2>
        {failure && (
          <Alert ref={alert} tabIndex={-1} tone="error">
            {failure.message}
          </Alert>
        )}
        <Field label="Project name" required {...(error && { error })}>
          {(control) => (
            <Input
              ref={input}
              name="name"
              maxLength={NAME_MAX}
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
          id={`project-${project.id}`}
          to={`/projects/${project.id}`}
          title={project.name}
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

function statusMessage({ items, loading, error, added }: ReturnType<typeof useProjects>) {
  if (loading) return items.length ? 'Loading more…' : 'Loading projects…'
  if (added) return `${added.count} more project${added.count === 1 ? '' : 's'} loaded`
  if (!error && !items.length) return 'No projects yet. Name one above to get started.'
  return ''
}

export function ProjectsPage() {
  useDocumentTitle('My projects')
  const projects = useProjects()
  const { items, hasMore, loading, error, added, loadMore, retry } = projects
  const alert = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (error) alert.current?.focus()
  }, [error])
  useEffect(() => {
    if (added?.firstId) document.getElementById(`project-${added.firstId}`)?.focus()
  }, [added])

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow tone="accent">Library</Eyebrow>
        <PageTitle className="text-title-lg font-semibold">My projects</PageTitle>
      </div>
      <CreateProject />
      {/* Always mounted, so screen readers announce each change of its text. */}
      <p role="status" className="text-body text-fg-muted empty:hidden">
        {statusMessage(projects)}
      </p>
      {items.length > 0 && (
        <ul aria-label="Projects" className="flex flex-col gap-card-gap">
          {items.map((project) => (
            <ProjectRow key={project.id} project={project} />
          ))}
        </ul>
      )}
      {error ? (
        <Alert
          ref={alert}
          tabIndex={-1}
          tone="error"
          action={{ label: 'Try again', onClick: retry }}
        >
          {error}
        </Alert>
      ) : (
        hasMore && (
          <Button
            variant="secondary"
            aria-disabled={loading}
            onClick={() => !loading && loadMore()}
            className="self-start aria-disabled:cursor-not-allowed aria-disabled:opacity-(--opacity-disabled)"
          >
            Load more
          </Button>
        )
      )}
    </div>
  )
}
