import { useId, type ReactNode } from 'react'
import cube from '../assets/icons/cube.svg'
import { Avatar } from '../components/ui/Avatar'
import { Breadcrumb } from '../components/ui/Breadcrumb'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Checklist } from '../components/ui/Checklist'
import { Eyebrow } from '../components/ui/Eyebrow'
import { Field } from '../components/ui/Field'
import { Icon } from '../components/ui/Icon'
import { Input } from '../components/ui/Input'
import { SaveStatus } from '../components/ui/SaveStatus'
import { Sidebar } from '../components/ui/Sidebar'
import { Stepper } from '../components/ui/Stepper'
import { Textarea } from '../components/ui/Textarea'

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
          <span className="inline-flex size-brand-mark forced-outline items-center justify-center rounded-panel bg-action text-fg-on-action">
            <Icon src={cube} />
          </span>
        </div>
      </Section>
      <Section title="Breadcrumb, save status">
        <Breadcrumb
          items={[
            { label: 'Workspace', href: '#' },
            { label: 'Projects', href: '#' },
            { label: 'Arles bedroom' },
          ]}
        />
        <SaveStatus status="saved" />
        <SaveStatus status="saving" />
        <SaveStatus status="error" />
      </Section>
      <Section title="Stepper">
        {[0, 1, 2].map((current) => (
          <Stepper key={current} steps={STEPS} current={current} />
        ))}
        <p className="text-caption text-fg-muted">In a 750px container (a 1024px window):</p>
        <div data-testid="stepper-750" className="w-187.5 border border-line">
          <Stepper steps={STEPS} current={1} />
        </div>
      </Section>
      <Section title="Checklist">
        <Checklist
          title="Required inputs"
          items={[
            { label: 'Blueprint / sketch', done: true },
            { label: 'Photo references', done: false },
          ]}
        />
      </Section>
      <Section title="Sidebar">
        <p className="text-caption text-fg-muted">
          Hover or Tab to a disabled item to see the Coming soon tooltip.
        </p>
        {/* 1080 px = the Figma frame height. */}
        <Sidebar
          current="upload"
          hrefs={{ upload: '#upload', projects: '#projects' }}
          user={{ name: 'Adri M.', initials: 'AM' }}
          className="h-270 shadow-card"
        />
      </Section>
      <Section title="Field, input, textarea">
        <p className="text-caption text-fg-muted">
          Press Tab to see the focus ring on each control.
        </p>
        <Card className="grid grid-cols-2 gap-card-gap p-card">
          <Field label="Area" help="In square meters">
            {(p) => <Input {...p} inputMode="decimal" placeholder="e.g. 42" />}
          </Field>
          <Field label="Area (error)" error="Enter a number above 0">
            {(p) => <Input {...p} defaultValue="-3" />}
          </Field>
          <Field label="Area (disabled)">
            {(p) => <Input {...p} disabled defaultValue="42" />}
          </Field>
          <Field
            label="Description"
            help="Materials, lighting or renovation notes"
            className="col-span-2"
          >
            {(p) => <Textarea {...p} maxLength={2000} defaultValue={'Oak floor. '.repeat(180)} />}
          </Field>
        </Card>
      </Section>
    </main>
  )
}

const LABELS = {
  primary: 'Browse files',
  secondary: 'Add description',
  cta: 'Continue to preflight',
}

const STEPS = ['Upload assets', 'AI preflight', 'Generate & export']
