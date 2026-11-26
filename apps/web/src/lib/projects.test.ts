import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('./api', () => api)

import { createProject, getProject, listProjects, PAGE_SIZE, projectNameError } from './projects'

beforeEach(() => api.apiFetch.mockReset())

describe('projectNameError', () => {
  it.each([
    ['', 'Enter a project name.'],
    ['   ', 'Enter a project name.'],
    ['a'.repeat(121), 'Use 120 characters or fewer.'],
    ['bad\u0000name', 'Remove control or invisible characters.'],
    ['zero​width', 'Remove control or invisible characters.'],
    ['line\nbreak', 'Remove control or invisible characters.'],
  ])('rejects %j', (name, message) => {
    expect(projectNameError(name)).toBe(message)
  })

  it.each(['A', 'a'.repeat(120), '  padded  ', 'Salón 🏠 – ático'])('accepts %j', (name) => {
    expect(projectNameError(name)).toBeUndefined()
  })

  it('counts the trimmed name, like the API', () => {
    expect(projectNameError(` ${'a'.repeat(120)} `)).toBeUndefined()
  })
})

describe('project requests', () => {
  it('lists a page by offset and passes the abort signal', async () => {
    const signal = new AbortController().signal
    api.apiFetch.mockResolvedValue({ items: [], limit: PAGE_SIZE, offset: 40 })
    await listProjects(40, signal)
    expect(api.apiFetch).toHaveBeenCalledWith(`/projects?limit=${PAGE_SIZE}&offset=40`, { signal })
  })

  it('creates a project with the trimmed name', async () => {
    api.apiFetch.mockResolvedValue({ id: 'p1' })
    await createProject('  Loft  ')
    expect(api.apiFetch).toHaveBeenCalledWith('/projects', {
      method: 'POST',
      body: { name: 'Loft' },
      signal: undefined,
    })
  })

  it('gets one project by id, encoded', async () => {
    api.apiFetch.mockResolvedValue({ id: 'p1' })
    await getProject('a/b')
    expect(api.apiFetch).toHaveBeenCalledWith('/projects/a%2Fb', { signal: undefined })
  })
})
