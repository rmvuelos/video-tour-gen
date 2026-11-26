import { remainingSlots, type FileKind, type UploadStatus } from './upload-rules'

export type UploaderItem = {
  id: string
  kind: FileKind
  filename: string
  size: number
  mime: string
  status: UploadStatus
  /** 0..1 while uploading. */
  progress?: number
  error?: string
  /** Only for files added in this session (thumbnails); never for items from the server. */
  file?: File
}

export type UploaderState = {
  phase: 'loading' | 'ready' | 'error'
  loadError: string | null
  /** Last add/remove problem, for the screen to show. */
  error: string | null
  items: UploaderItem[]
  /** Text for the single shared role="status" region. */
  announcement: string
}

export type UploaderAction =
  | { type: 'loading' }
  | { type: 'loaded'; items: UploaderItem[] }
  | { type: 'loadFailed'; error: string }
  | { type: 'added'; items: UploaderItem[] }
  | { type: 'progress'; id: string; progress: number }
  | { type: 'done'; id: string }
  | { type: 'failed'; id: string; error: string }
  | { type: 'uploading'; id: string }
  | { type: 'replaceId'; oldId: string; id: string }
  | { type: 'removed'; id: string }
  | { type: 'restore'; item: UploaderItem; index: number; error: string }
  | { type: 'error'; error: string | null }
  | { type: 'announce'; text: string }

export const initialState: UploaderState = {
  phase: 'loading',
  loadError: null,
  error: null,
  items: [],
  announcement: '',
}

const DONE = new Set<UploadStatus>(['pending', 'uploaded', 'valid'])

const patch = (state: UploaderState, id: string, change: Partial<UploaderItem>) => ({
  ...state,
  items: state.items.map((i) => (i.id === id ? { ...i, ...change } : i)),
})

export function uploaderReducer(state: UploaderState, action: UploaderAction): UploaderState {
  switch (action.type) {
    case 'loading':
      return initialState
    case 'loaded':
      return { ...state, phase: 'ready', loadError: null, items: action.items }
    case 'loadFailed':
      return { ...state, phase: 'error', loadError: action.error }
    case 'added':
      return { ...state, error: null, items: [...state.items, ...action.items] }
    case 'progress':
      return patch(state, action.id, { progress: action.progress })
    case 'done':
      return patch(state, action.id, { status: 'pending', progress: undefined, error: undefined })
    case 'uploading':
      return patch(state, action.id, { status: 'uploading', progress: 0, error: undefined })
    case 'replaceId':
      return patch(state, action.oldId, { id: action.id, progress: 0 })
    case 'failed': {
      const next = patch(state, action.id, { status: 'failed', error: action.error })
      const failed = next.items.find((i) => i.id === action.id)
      if (!failed) return next
      const uploaded = next.items.filter((i) => i.kind === failed.kind && DONE.has(i.status))
      const total = remainingSlots(failed.kind, 0)
      return {
        ...next,
        announcement: `${failed.filename} failed. ${uploaded.length} of ${total} uploaded`,
      }
    }
    case 'removed': {
      const gone = state.items.find((i) => i.id === action.id)
      return {
        ...state,
        error: null,
        items: state.items.filter((i) => i.id !== action.id),
        announcement: gone ? `${gone.filename} removed` : state.announcement,
      }
    }
    case 'restore':
      return {
        ...state,
        error: action.error,
        items: state.items.toSpliced(action.index, 0, action.item),
      }
    case 'error':
      return { ...state, error: action.error }
    case 'announce':
      return { ...state, announcement: action.text }
  }
}
