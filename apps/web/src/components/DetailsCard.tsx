import { useId, type ReactNode } from 'react'
import editIcon from '../assets/icons/edit.svg'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { Icon } from './ui/Icon'

type Props = {
  open: boolean
  onToggle: () => void
  /** The fields. They stay mounted while collapsed, so what was typed is kept. */
  children: ReactNode
}

/** Collapsible card for the optional project details; the toggle is a disclosure button. */
export function DetailsCard({ open, onToggle, children }: Props) {
  const [titleId, hintId, panelId] = [useId(), useId(), useId()]
  return (
    <Card className="flex min-h-spec-card flex-col justify-center gap-6 p-card">
      <div className="flex items-center gap-4">
        <Icon src={editIcon} className="text-fg-accent" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h2 id={titleId} className="text-title-sm font-semibold">
            Add optional project details
          </h2>
          <p id={hintId} className="text-body text-fg-muted">
            Dimensions, descriptions, materials, lighting or renovation notes.
          </p>
        </div>
        {/* The label stays the same when open: the state is aria-expanded, not the text. */}
        <Button
          variant="secondary"
          aria-expanded={open}
          aria-controls={panelId}
          aria-describedby={hintId}
          onClick={onToggle}
        >
          Add description
        </Button>
      </div>
      <div
        id={panelId}
        role="region"
        aria-labelledby={titleId}
        hidden={!open}
        className="flex flex-col gap-6"
      >
        {children}
      </div>
    </Card>
  )
}
