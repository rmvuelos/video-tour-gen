import type { FileKind, UploadStatus } from './upload-rules'

export type UploaderItem = {
  id: string
  kind: FileKind
  filename: string
  size: number
  mime: string
  status: UploadStatus
  /** 0..1 while uploading. */
  progress?: number | undefined
  error?: string | undefined
  /** Only for files added in this session (thumbnails); never for items from the server. */
  file?: File
}

export type UploaderState = {
  phase: 'loading' | 'ready' | 'error'
  loadError: string | null
  /** Last add/remove problem, for the screen to show. */
  error: string | null
  items: UploaderItem[]
  /** Files of each kind whose register request is still in flight (they already use a slot). */
  registering: Record<FileKind, number>
  /** Text for the single shared role="status" region. */
  announcement: string
}

export type UploaderAction =
  | { type: 'loading' }
  | { type: 'loaded'; items: UploaderItem[] }
  | { type: 'loadFailed'; error: string }
  | { type: 'added'; items: UploaderItem[] }
  | { type: 'registering' | 'registerEnded'; kind: FileKind; count: number }
  | { type: 'progress'; id: string; progress: number }
  | { type: 'done'; id: string }
  | { type: 'failed'; id: string; error: string }
  | { type: 'uploading'; id: string }
  | { type: 'replaceId'; oldId: string; id: string }
  | { type: 'removed'; id: string }
  | { type: 'restore'; item: UploaderItem; index: number; error: string }
  | { type: 'error'; error: string | null }
  | { type: 'invalidated'; errors: { id: string; error: string }[] }
  | { type: 'announce'; text: string }

export const initialState: UploaderState = {
  phase: 'loading',
  loadError: null,
  error: null,
  items: [],
  registering: { plan: 0, photo: 0 },
  announcement: '',
}

const CANCELLED = 'The upload was cancelled. Retry or remove it.'

/** A live region reads only changes: the same text twice gets a trailing space the 2nd time. */
const say = (state: UploaderState, text: string): UploaderState => ({
  ...state,
  announcement: state.announcement === text ? `${text} ` : text,
})

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
      return failed ? say(next, `${failed.filename} failed to upload. Retry or remove it.`) : next
    }
    case 'removed': {
      const gone = state.items.find((i) => i.id === action.id)
      const next = { ...state, error: null, items: state.items.filter((i) => i.id !== action.id) }
      return gone ? say(next, `${gone.filename} removed`) : next
    }
    case 'restore': {
      // An upload we aborted for the delete cannot go on by itself: offer Retry.
      const item: UploaderItem =
        action.item.status === 'uploading'
          ? { ...action.item, status: 'failed', progress: undefined, error: CANCELLED }
          : action.item
      return { ...state, error: action.error, items: state.items.toSpliced(action.index, 0, item) }
    }
    case 'registering':
    case 'registerEnded': {
      const delta = action.type === 'registering' ? action.count : -action.count
      const count = Math.max(0, state.registering[action.kind] + delta)
      return { ...state, registering: { ...state.registering, [action.kind]: count } }
    }
    case 'error':
      return { ...state, error: action.error }
    case 'invalidated': {
      const messages = new Map(action.errors.map((e) => [e.id, e.error]))
      const hit = state.items.filter((i) => messages.has(i.id)).length
      if (hit === 0) return state
      const items = state.items.map((i) =>
        messages.has(i.id) ? { ...i, status: 'invalid' as const, error: messages.get(i.id) } : i,
      )
      // The screen alert says how many need fixing, so the live region stays quiet.
      return { ...state, items }
    }
    case 'announce':
      return say(state, action.text)
  }
}
