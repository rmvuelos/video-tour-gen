import { Eyebrow } from './ui/Eyebrow'
import { Stepper } from './ui/Stepper'

const STEPS = ['Upload assets', 'AI preflight', 'Generate & export']

/** Stepper and hero of the upload screen. The tagline is not a heading: the h1 is the project. */
export function UploadHeader() {
  return (
    <header className="flex flex-col gap-hero">
      <Stepper steps={STEPS} current={0} />
      <div className="flex flex-col gap-2">
        {/* Visible as designed; the stepper has no "step 1 of 3", so assistive tech gets it here. */}
        <Eyebrow tone="accent" aria-hidden="true">
          Phase 01 / 03
        </Eyebrow>
        <span className="sr-only">Phase 1 of 3</span>
        <p className="text-display font-semibold">Every room begins with a story.</p>
        <p className="text-lead text-fg-muted">
          Bring a blueprint, photographs and a few ideas together. We'll build the spatial
          foundation.
        </p>
      </div>
    </header>
  )
}
