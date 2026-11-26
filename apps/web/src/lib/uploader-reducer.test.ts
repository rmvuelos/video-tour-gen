import { describe, expect, it } from 'vitest'
import { initialState, uploaderReducer as reduce, type UploaderItem } from './uploader-reducer'

const item = (id: string, over: Partial<UploaderItem> = {}): UploaderItem => ({
  id,
  kind: 'photo',
  filename: `${id}.jpg`,
  size: 1,
  mime: 'image/jpeg',
  status: 'uploading',
  progress: 0,
  ...over,
})
const withItems = (...items: UploaderItem[]) => ({
  ...initialState,
  phase: 'ready' as const,
  items,
})

describe('uploaderReducer', () => {
  it('loads items and records a load failure', () => {
    const loaded = reduce(initialState, { type: 'loaded', items: [item('a')] })
    expect(loaded).toMatchObject({ phase: 'ready', items: [{ id: 'a' }] })
    const failed = reduce(initialState, { type: 'loadFailed', error: 'boom' })
    expect(failed).toMatchObject({ phase: 'error', loadError: 'boom' })
    expect(reduce(failed, { type: 'loading' })).toEqual(initialState)
  })

  it('adds items without mutating the previous state', () => {
    const before = withItems(item('a'))
    const after = reduce(before, { type: 'added', items: [item('b')] })
    expect(after.items.map((i) => i.id)).toEqual(['a', 'b'])
    expect(before.items).toHaveLength(1)
  })

  it('updates progress, then marks done as pending without progress', () => {
    let s = reduce(withItems(item('a'), item('b')), { type: 'progress', id: 'a', progress: 0.5 })
    expect(s.items[0]?.progress).toBe(0.5)
    expect(s.items[1]?.progress).toBe(0)
    s = reduce(s, { type: 'done', id: 'a' })
    expect(s.items[0]).toMatchObject({ status: 'pending', progress: undefined })
  })

  it('fails an item and announces it with the uploaded count', () => {
    const s = reduce(
      withItems(item('a', { status: 'pending' }), item('h', { filename: 'hall.jpg' })),
      { type: 'failed', id: 'h', error: 'nope' },
    )
    expect(s.items[1]).toMatchObject({ status: 'failed', error: 'nope' })
    expect(s.announcement).toBe('hall.jpg failed. 1 of 10 uploaded')
  })

  it('ignores a failure for an item that is gone', () => {
    const s = withItems(item('a'))
    expect(reduce(s, { type: 'failed', id: 'zzz', error: 'x' }).announcement).toBe('')
  })

  it('restarts a failed item and swaps its id', () => {
    const failed = withItems(item('a', { status: 'failed', error: 'x', progress: 0.4 }))
    const retrying = reduce(failed, { type: 'uploading', id: 'a' })
    expect(retrying.items[0]).toMatchObject({ status: 'uploading', progress: 0, error: undefined })
    expect(reduce(failed, { type: 'replaceId', oldId: 'a', id: 'z' }).items[0]?.id).toBe('z')
  })

  it('removes and restores an item at its position', () => {
    const s = withItems(item('a'), item('b'), item('c'))
    const removed = reduce(s, { type: 'removed', id: 'b' })
    expect(removed.items.map((i) => i.id)).toEqual(['a', 'c'])
    expect(removed.announcement).toBe('b.jpg removed')
    const back = reduce(removed, { type: 'restore', item: item('b'), index: 1, error: 'cannot' })
    expect(back.items.map((i) => i.id)).toEqual(['a', 'b', 'c'])
    expect(back.error).toBe('cannot')
  })

  it('sets the hook error and the announcement', () => {
    const s = reduce(initialState, { type: 'error', error: 'bad' })
    expect(s.error).toBe('bad')
    expect(reduce(s, { type: 'announce', text: '4 photos uploaded' }).announcement).toBe(
      '4 photos uploaded',
    )
  })
})
