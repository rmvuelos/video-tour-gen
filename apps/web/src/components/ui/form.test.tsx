import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Field } from './Field'
import { Input } from './Input'
import { Textarea } from './Textarea'

describe('Field', () => {
  it('labels the control and links help and error through aria-describedby', () => {
    render(
      <Field label="Area" help="In square meters" error="Enter a number above 0">
        {(props) => <Input {...props} />}
      </Field>,
    )
    const input = screen.getByRole('textbox', { name: 'Area' })
    expect(input).toHaveAccessibleDescription('In square meters Enter a number above 0')
    expect(input).toBeInvalid()
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a number above 0')
  })

  it('is valid and has no description without help or error', () => {
    render(<Field label="Area">{(props) => <Input {...props} />}</Field>)
    const input = screen.getByRole('textbox', { name: 'Area' })
    expect(input).toBeValid()
    expect(input).not.toHaveAttribute('aria-describedby')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('gives every field its own ids', () => {
    render(
      <>
        <Field label="A">{(props) => <Input {...props} />}</Field>
        <Field label="B">{(props) => <Input {...props} />}</Field>
      </>,
    )
    expect(screen.getByLabelText('A').id).not.toBe(screen.getByLabelText('B').id)
  })

  it('does not let a disabled input take typing', async () => {
    render(<Input aria-label="Area" disabled />)
    await userEvent.setup().type(screen.getByLabelText('Area'), '12')
    expect(screen.getByLabelText('Area')).toHaveValue('')
  })
})

describe('Textarea', () => {
  it('counts characters, describes the field with the count and stays quiet while far from the limit', async () => {
    render(<Textarea aria-label="Description" maxLength={2000} />)
    const area = screen.getByLabelText('Description')
    await userEvent.setup().type(area, 'héllo')
    expect(area).toHaveAccessibleDescription('5 / 2,000')
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('announces the remaining characters politely near the limit', () => {
    render(<Textarea aria-label="Description" maxLength={20} defaultValue={'x'.repeat(18)} />)
    expect(screen.getByRole('status')).toHaveTextContent('2 characters remaining')
  })

  it('follows a controlled value and keeps the description passed by a Field', () => {
    render(
      <Field label="Notes" help="Optional">
        {(props) => <Textarea {...props} maxLength={50} value="abc" onChange={() => {}} />}
      </Field>,
    )
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveAccessibleDescription(
      'Optional 3 / 50',
    )
  })
})
