import { Eyebrow } from './ui/Eyebrow'
import { Stepper } from './ui/Stepper'

const STEPS = ['Upload assets', 'AI preflight', 'Generate & export']

/** Stepper and hero of the upload screen. The tagline is not a heading: the h1 is the project. */
export function UploadHeader() {
  return (
    <header className="flex flex-col gap-hero">
      <Stepper steps={STEPS} current={0} />
      <div className="flex flex-col gap-2">
        <Eyebrow tone="accent">Phase 01 / 03</Eyebrow>
        <p className="text-display font-semibold">Every room begins with a story.</p>
        <p className="text-lead text-fg-muted">
          Bring a blueprint, photographs and a few ideas together. We'll build the spatial
          foundation.
        </p>
      </div>
    </header>
  )
}
