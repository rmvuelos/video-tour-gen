import {
  useEffect,
  useId,
  useState,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
} from 'react'
import cube from '../../assets/icons/cube.svg'
import grid from '../../assets/icons/grid-sm.svg'
import layers from '../../assets/icons/layers.svg'
import settings from '../../assets/icons/settings.svg'
import { Avatar } from './Avatar'
import { Eyebrow } from './Eyebrow'
import { Icon } from './Icon'

type Section = 'upload' | 'projects'

type Props = Omit<ComponentProps<'aside'>, 'children'> & {
  current: Section
  hrefs: Record<Section, string>
  user: { name: string; initials: string }
  /** Receives the click so a router can `preventDefault` and navigate on its own. */
  onNavigate?: (id: Section, event: MouseEvent<HTMLAnchorElement>) => void
}

const STEPS = [
  { n: '01', label: 'Upload assets', id: 'upload' },
  { n: '02', label: 'AI preflight' },
  { n: '03', label: '3D generation' },
] as const
const LIBRARY = [
  { label: 'My projects', icon: grid, id: 'projects' },
  { label: 'Templates', icon: layers },
  { label: 'Preferences', icon: settings },
] as const

/**
 * Not yet built (D-09). A focusable `aria-disabled` button, not a disabled one, so keyboard and
 * screen reader users reach the item and hear "Coming soon" (a `disabled` button is skipped). The
 * tooltip sits inside the wrapper with its gap as padding, so the pointer can cross onto it.
 */
function ComingSoon({ className = '', children }: { className?: string; children: ReactNode }) {
  const id = useId()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const shown = (hovered || focused) && !dismissed

  // Escape works from anywhere while it is visible, also when it came from hover alone.
  useEffect(() => {
    if (!shown) return
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && setDismissed(true)
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [shown])

  return (
    <span
      className="relative block"
      onMouseEnter={() => (setHovered(true), setDismissed(false))}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => (setFocused(true), setDismissed(false))}
      onBlur={() => setFocused(false)}
    >
      <button
        type="button"
        aria-disabled="true"
        aria-describedby={id}
        className={`flex w-full cursor-not-allowed items-center text-left text-fg-muted ${className}`}
      >
        {children}
      </button>
      {/* shortcut: absolute and clipped by any scrolling ancestor; if the sidebar ever needs
          vertical scroll, move the tooltip to position: fixed or a popover. */}
      <span
        role="tooltip"
        id={id}
        hidden={!shown}
        className="absolute top-1/2 left-full z-10 -translate-y-1/2 pl-2"
      >
        <span className="block forced-outline rounded-control bg-action px-3 py-1.5 text-caption whitespace-nowrap text-fg-on-action">
          Coming soon
        </span>
      </span>
    </span>
  )
}

const STEP_ROW = 'h-15 gap-1 rounded-control px-3.25'
const LINK_ROW = 'min-h-6.5 gap-4.25 px-3.5'

function StepContent({ n, label, active }: { n: string; label: string; active: boolean }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={`w-8.5 text-eyebrow font-bold ${active ? 'text-fg-accent' : ''}`}
      >
        {n}
      </span>
      <span className={`text-stage ${active ? 'font-semibold text-fg' : 'font-medium'}`}>
        {label}
      </span>
    </>
  )
}

/**
 * Fixed 273 px, as in Figma. shortcut: desktop only (MVP, min 1024 px), no collapsed or drawer
 * variant; make it responsive when tablet or mobile enters scope.
 */
export function Sidebar({ current, hrefs, user, onNavigate, className = '', ...rest }: Props) {
  const createId = useId()
  const libraryId = useId()
  const link = (id: Section, row: string, children: ReactNode) => (
    <a
      href={hrefs[id]}
      aria-current={current === id ? 'page' : undefined}
      onClick={(e) => onNavigate?.(id, e)}
      className={`flex items-center text-fg-muted hover:text-fg ${row} ${current === id ? 'bg-selected forced-colors:border forced-colors:border-[Highlight]' : ''}`}
    >
      {children}
    </a>
  )
  return (
    <aside
      className={`flex w-sidebar shrink-0 flex-col bg-surface pr-5.25 pl-5.75 pt-8 pb-13.5 ${className}`}
      {...rest}
    >
      <div className="flex items-center gap-3.5 px-2.75">
        <span className="inline-flex size-brand-mark forced-outline items-center justify-center rounded-panel bg-action text-fg-on-action">
          <Icon src={cube} />
        </span>
        <span className="text-brand font-bold">rooma.</span>
      </div>
      <Eyebrow tone="accent" className="mt-7.5 px-3">
        Spatial AI studio
      </Eyebrow>
      <div aria-hidden="true" className="ml-2.25 mr-3 mt-5 h-px bg-line" />
      <nav aria-label="Main">
        <Eyebrow className="mt-10 block px-3">Workspace</Eyebrow>
        <Eyebrow id={createId} className="mt-8 block px-3">
          Create
        </Eyebrow>
        <ul aria-labelledby={createId} className="mt-4.5 flex flex-col gap-4">
          {STEPS.map((step) => (
            <li key={step.n}>
              {'id' in step ? (
                link(step.id, STEP_ROW, <StepContent {...step} active={current === step.id} />)
              ) : (
                <ComingSoon className={STEP_ROW}>
                  <StepContent {...step} active={false} />
                </ComingSoon>
              )}
            </li>
          ))}
        </ul>
        <Eyebrow id={libraryId} className="mt-16.5 block px-3">
          Library
        </Eyebrow>
        <ul aria-labelledby={libraryId} className="mt-5.5 flex flex-col gap-8.25">
          {LIBRARY.map(({ label, icon, ...item }) => {
            const content = (
              <>
                <Icon src={icon} size="nav" />
                <span className="text-nav font-medium">{label}</span>
              </>
            )
            return (
              <li key={label}>
                {'id' in item ? (
                  link(item.id, LINK_ROW, content)
                ) : (
                  <ComingSoon className={LINK_ROW}>{content}</ComingSoon>
                )}
              </li>
            )
          })}
        </ul>
      </nav>
      {/* Decorative (D-09): no behavior yet, so plain text rather than a disabled control. */}
      <div className="mt-auto flex h-plan-card flex-col items-start gap-1.5 rounded-panel bg-surface-subtle px-4.75 pt-5.5 text-fg-muted">
        <Eyebrow tone="accent">Your plan</Eyebrow>
        <span className="text-subtitle font-semibold text-fg">Studio / Free</span>
        <span className="mt-1 text-caption">2 of 5 projects used</span>
      </div>
      <div aria-hidden="true" className="ml-2.25 mr-3 mt-7 h-px bg-line" />
      <div className="mt-6.5 flex items-center gap-3 px-3.25">
        <Avatar initials={user.initials} aria-hidden="true" />
        <div className="flex flex-col">
          <span className="text-stage font-semibold">{user.name}</span>
          <span className="text-eyebrow text-fg-muted">Personal workspace</span>
        </div>
      </div>
    </aside>
  )
}
