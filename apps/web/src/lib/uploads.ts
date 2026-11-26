import { apiFetch } from './api'

type Kind = 'plan' | 'photo'
type JobStatus = 'queued' | 'running' | 'done' | 'failed'
type Signal = AbortSignal | null

export type FileStatus = 'pending' | 'uploaded' | 'valid' | 'invalid'
export type ProjectFile = {
  id: string
  kind: Kind
  filename: string
  size: number
  mime: string
  status: FileStatus
  error_code: string | null
  page_index: number | null
}
export type FileRequest = { kind: Kind; filename: string; size: number; mime: string }
export type UploadTarget = {
  file_id: string
  kind: Kind
  mime: string
  upload_url: string
  headers: Record<string, string>
}
export type SubmitOptions = { plan_page_index?: number; area_m2?: number; description?: string }
export type Job = { id: string; project_id: string; status: JobStatus; created_at: string }
export type JobState = Job & {
  error_code: string | null
  attempts: number
  started_at: string | null
  finished_at: string | null
  duration_ms: number | null
  files: {
    id: string
    kind: Kind
    status: FileStatus
    error_code: string | null
    width: number | null
    height: number | null
  }[]
}

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}`

export const listFiles = (projectId: string, signal: Signal = null) =>
  apiFetch<{ files: ProjectFile[] }>(`${base(projectId)}/files`, { signal })

export const registerFiles = (projectId: string, files: FileRequest[], signal: Signal = null) =>
  apiFetch<{ files: UploadTarget[] }>(`${base(projectId)}/files`, {
    method: 'POST',
    body: { files },
    signal,
  })

export const deleteFile = (projectId: string, fileId: string, signal: Signal = null) =>
  apiFetch<void>(`${base(projectId)}/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    signal,
  })

export const submitProject = (
  projectId: string,
  options: SubmitOptions = {},
  signal: Signal = null,
) => apiFetch<Job>(`${base(projectId)}/submit`, { method: 'POST', body: options, signal })

export const getLatestJob = (projectId: string, signal: Signal = null) =>
  apiFetch<JobState>(`${base(projectId)}/jobs/latest`, { signal })

export const retryIngest = (projectId: string, signal: Signal = null) =>
  apiFetch<Job>(`${base(projectId)}/jobs/ingest/retry`, { method: 'POST', signal })
