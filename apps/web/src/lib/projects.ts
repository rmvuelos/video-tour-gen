import { apiFetch } from './api'

export const PAGE_SIZE = 20
const NAME_MAX = 120

export type ProjectStatus = 'draft' | 'ingesting' | 'ready' | 'needs_fix'
export type Project = {
  id: string
  name: string
  status: ProjectStatus
  created_at: string
}
type ProjectPage = { items: Project[]; limit: number; offset: number }

// Same rule as the API (strip, 1-120, no Cc/Cf/Cs): the server stays the authority.
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Cs}]/u

export function projectNameError(name: string): string | undefined {
  const trimmed = name.trim()
  if (!trimmed) return 'Enter a project name.'
  if ([...trimmed].length > NAME_MAX) return `Use ${NAME_MAX} characters or fewer.`
  if (INVISIBLE.test(trimmed)) return 'Remove control or invisible characters.'
  return undefined
}

export const listProjects = (offset: number, signal: AbortSignal | null = null) =>
  apiFetch<ProjectPage>(`/projects?limit=${PAGE_SIZE}&offset=${offset}`, { signal })

export const createProject = (name: string, signal: AbortSignal | null = null) =>
  apiFetch<Project>('/projects', { method: 'POST', body: { name: name.trim() }, signal })

export const getProject = (id: string, signal: AbortSignal | null = null) =>
  apiFetch<Project>(`/projects/${encodeURIComponent(id)}`, { signal })
