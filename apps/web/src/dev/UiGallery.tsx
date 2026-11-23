import { useId, type ReactNode } from 'react'
import cube from '../assets/icons/cube.svg'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Eyebrow } from '../components/ui/Eyebrow'
import { Icon } from '../components/ui/Icon'

// Static class names so Tailwind can see them.
const PRIMITIVES = [
  ['ink', 'bg-ink'],
  ['caramel', 'bg-caramel'],
  ['cream', 'bg-cream'],
  ['ivory', 'bg-ivory'],
  ['taupe', 'bg-taupe'],
  ['sage', 'bg-sage'],
  ['mist', 'bg-mist'],
  ['mustard', 'bg-mustard'],
  ['sand-1', 'bg-sand-1'],
  ['sand-2', 'bg-sand-2'],
  ['sand-3', 'bg-sand-3'],
  ['sand-4', 'bg-sand-4'],
  ['sand-5', 'bg-sand-5'],
  ['sand-6', 'bg-sand-6'],
  ['sand-7', 'bg-sand-7'],
  ['sand-8', 'bg-sand-8'],
  ['sand-9', 'bg-sand-9'],
  ['taupe-deep', 'bg-taupe-deep'],
  ['caramel-deep', 'bg-caramel-deep'],
] as const

const SEMANTIC = [
  ['canvas', 'bg-canvas'],
  ['surface', 'bg-surface'],
  ['surface-subtle', 'bg-surface-subtle'],
  ['selected', 'bg-selected'],
  ['control', 'bg-control'],
  ['line', 'bg-line'],
  ['fg', 'bg-fg'],
  ['fg-muted', 'bg-fg-muted'],
  ['fg-accent', 'bg-fg-accent'],
  ['accent', 'bg-accent'],
  ['success', 'bg-success'],
  ['action', 'bg-action'],
] as const

const TYPE = [
  ['text-display font-semibold', 'display 55 / 600'],
  ['text-title-lg font-semibold', 'title-lg 26 / 600'],
  ['text-title font-semibold', 'title 24 / 600'],
  ['text-title-sm font-semibold', 'title-sm 21 / 600'],
  ['text-lead', 'lead 19 / 400'],
  ['text-subtitle font-semibold', 'subtitle 18 / 600'],
  ['text-stage font-semibold', 'stage 17 / 600'],
  ['text-nav font-medium', 'nav 16 / 500'],
  ['text-body', 'body 15 / 400'],
  ['text-label font-medium', 'label 14 / 500'],
  ['text-caption', 'caption 13 / 400'],
] as const

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id}>
        <Eyebrow tone="accent">{title}</Eyebrow>
      </h2>
      {children}
    </section>
  )
}

function Swatches({ items }: { items: readonly (readonly [string, string])[] }) {
  return (
    <ul className="flex flex-wrap gap-4">
      {items.map(([name, bg]) => (
        <li key={name} className="flex w-24 flex-col gap-1 text-caption text-fg-muted">
          <span className={`h-11 rounded-panel border border-line ${bg}`} />
          {name}
        </li>
      ))}
    </ul>
  )
}

export default function UiGallery() {
  return (
    <main className="flex max-w-5xl flex-col gap-10 p-10">
      <h1 className="text-display font-semibold">UI primitives</h1>
      <Section title="Primitive colors">
        <Swatches items={PRIMITIVES} />
      </Section>
      <Section title="Semantic colors">
        <Swatches items={SEMANTIC} />
      </Section>
      <Section title="Type scale (DM Sans)">
        {TYPE.map(([cls, label]) => (
          <p key={label} className={cls}>
            Every room begins with a story. <span className="text-fg-muted">{label}</span>
          </p>
        ))}
        <p>
          <Eyebrow>Spatial AI studio</Eyebrow> <Eyebrow tone="accent">Phase 01 / 03</Eyebrow>
        </p>
      </Section>
      <Section title="Button">
        <p className="text-caption text-fg-muted">
          Real states: hover a button, press Tab to see the focus ring (the first one starts
          focused).
        </p>
        {(['primary', 'secondary', 'cta'] as const).map((variant, index) => (
          <div key={variant} className="flex flex-wrap items-center gap-4">
            <Button variant={variant} autoFocus={index === 0}>
              {LABELS[variant]}
            </Button>
            <Button variant={variant} disabled>
              {LABELS[variant]} (disabled)
            </Button>
          </div>
        ))}
      </Section>
      <Section title="Card, Avatar, brand mark">
        <div className="flex flex-wrap items-center gap-6">
          <Card className="p-card">Card surface, radius and shadow</Card>
          <Avatar initials="AM" label="Adri M." />
          <Avatar initials="AM" label="Adri M." variant="solid" />
          <span className="inline-flex size-brand-mark items-center justify-center rounded-panel bg-action text-fg-on-action">
            <Icon src={cube} />
          </span>
        </div>
      </Section>
    </main>
  )
}

const LABELS = {
  primary: 'Browse files',
  secondary: 'Add description',
  cta: 'Continue to preflight',
}
