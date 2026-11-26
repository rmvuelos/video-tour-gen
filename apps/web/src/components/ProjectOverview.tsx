import checkIcon from '../assets/icons/check.svg'
import illustration from '../assets/illustrations/floor-plan.svg'
import type { sourceProgress } from '../lib/upload-rules'
import { Card } from './ui/Card'
import { Eyebrow } from './ui/Eyebrow'
import { Icon } from './ui/Icon'

type Progress = ReturnType<typeof sourceProgress>

function Requirement({
  label,
  count,
  of,
  met,
  missing,
}: {
  label: string
  count: number
  of: number
  met: boolean
  missing: string
}) {
  return (
    <li className="flex min-h-icon items-center gap-3 text-body font-medium">
      {/* The state is also text (sr-only), so the marker is never the only cue. */}
      <span
        aria-hidden="true"
        className="inline-flex size-icon-sm shrink-0 items-center justify-center"
      >
        {met ? (
          <Icon src={checkIcon} size="sm" className="text-success" />
        ) : (
          <span className="size-2 rounded-pill border border-field-border" />
        )}
      </span>
      <span>{label}</span>
      <span className="ml-auto text-caption font-normal text-fg-muted">
        {count} of {of}
      </span>
      <span className="sr-only">{met ? ', added' : `, ${missing}`}</span>
    </li>
  )
}

/** Summary of the project and of the required inputs, from the real state of the files. */
export function ProjectOverview({ name, progress }: { name: string; progress: Progress }) {
  const { plan, photos } = progress
  return (
    <aside aria-label="Project overview" className="flex">
      <Card className="flex flex-1 flex-col gap-4 p-card">
        <div className="flex flex-col gap-1">
          <Eyebrow>Project overview</Eyebrow>
          <p className="text-title-lg font-semibold break-words">{name}</p>
        </div>
        <div className="relative mt-2">
          <img src={illustration} alt="" className="block w-full rounded-panel" />
          <Eyebrow className="absolute bottom-3 left-summary-caption">
            Illustrative floor plan
          </Eyebrow>
        </div>
        <Eyebrow>Required inputs</Eyebrow>
        <ul aria-label="Required inputs" className="flex flex-col gap-2.5">
          <Requirement
            label="Blueprint / sketch"
            count={plan.count}
            of={plan.max}
            met={plan.met}
            missing="needs one floor plan"
          />
          <Requirement
            label="Photo references"
            count={photos.count}
            of={photos.max}
            met={photos.met}
            missing={`needs at least ${photos.min}`}
          />
        </ul>
        <p className="mt-auto border-t border-line pt-4 text-caption text-fg-muted">
          Private workspace
        </p>
      </Card>
    </aside>
  )
}
