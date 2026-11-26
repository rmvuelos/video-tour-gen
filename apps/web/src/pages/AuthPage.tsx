import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { z } from 'zod'
import { useSession } from '../auth/session'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Eyebrow } from '../components/ui/Eyebrow'
import { Field } from '../components/ui/Field'
import { Input } from '../components/ui/Input'
import { getSupabase } from '../lib/supabase'

// Matches supabase/config.toml `minimum_password_length`.
const MIN_PASSWORD = 6

const MODES = {
  login: {
    title: 'Sign in',
    pending: 'Signing in…',
    switchText: 'New here?',
    switchLabel: 'Create an account',
    switchTo: '/signup',
    autoComplete: 'current-password',
    // One message for every credential failure: it must not reveal whether the email exists.
    failure: (code: string | undefined) =>
      code === 'invalid_credentials'
        ? 'Incorrect email or password.'
        : 'Something went wrong. Try again in a moment.',
  },
  signup: {
    title: 'Create account',
    pending: 'Creating account…',
    switchText: 'Already have an account?',
    switchLabel: 'Sign in',
    switchTo: '/login',
    autoComplete: 'new-password',
    failure: () =>
      'We could not create your account. Check your details and try again, or sign in.',
  },
}

const formSchema = z.object({
  email: z.email({ error: 'Enter your email address.' }),
  password: z.string().min(1, 'Enter your password.'),
})

type Errors = { email?: string; password?: string }

export function AuthPage({ mode }: { mode: keyof typeof MODES }) {
  const copy = MODES[mode]
  const session = useSession()
  const location = useLocation()
  const [errors, setErrors] = useState<Errors>({})
  const [failure, setFailure] = useState<string>()
  const [notice, setNotice] = useState(false)
  const [pending, setPending] = useState(false)
  const email = useRef<HTMLInputElement>(null)
  const password = useRef<HTMLInputElement>(null)
  const alert = useRef<HTMLDivElement>(null)

  // Moves focus to the first thing the user has to fix (or read) after a submit.
  useEffect(() => {
    if (errors.email) email.current?.focus()
    else if (errors.password) password.current?.focus()
    else if (failure) alert.current?.focus()
  }, [errors, failure])

  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/'
  if (session) return <Navigate to={from} replace />

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const parsed = formSchema.safeParse(Object.fromEntries(form))
    const short = mode === 'signup' && String(form.get('password')).length < MIN_PASSWORD
    const next: Errors = {}
    for (const issue of parsed.error?.issues ?? []) {
      next[issue.path[0] as keyof Errors] ??= issue.message
    }
    if (short && !next.password) next.password = `Use at least ${MIN_PASSWORD} characters.`
    setErrors(next)
    setFailure(undefined)
    if (!parsed.success || short) return

    setPending(true)
    try {
      const { auth } = getSupabase()
      const { data, error } =
        mode === 'login'
          ? await auth.signInWithPassword(parsed.data)
          : await auth.signUp(parsed.data)
      if (error) setFailure(copy.failure(error.code))
      else if (!data.session) setNotice(true)
    } catch {
      setFailure(copy.failure(undefined))
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-8">
      <Card className="flex w-full max-w-md flex-col gap-6 p-8">
        <div className="flex flex-col gap-2">
          <Eyebrow tone="accent">rooma</Eyebrow>
          <h1 className="text-title font-semibold text-fg">{copy.title}</h1>
        </div>
        {failure && (
          <Alert ref={alert} tabIndex={-1} tone="error">
            {failure}
          </Alert>
        )}
        {notice && (
          <Alert tone="info">Check your email to confirm your account, then sign in.</Alert>
        )}
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Email" required {...(errors.email && { error: errors.email })}>
            {(control) => (
              <Input ref={email} name="email" type="email" autoComplete="email" {...control} />
            )}
          </Field>
          <Field
            label="Password"
            required
            {...(mode === 'signup' && { help: `At least ${MIN_PASSWORD} characters.` })}
            {...(errors.password && { error: errors.password })}
          >
            {(control) => (
              <Input
                ref={password}
                name="password"
                type="password"
                autoComplete={copy.autoComplete}
                {...control}
              />
            )}
          </Field>
          <Button type="submit" disabled={pending} className="self-start">
            {pending ? copy.pending : copy.title}
          </Button>
        </form>
        <p className="text-body text-fg-muted">
          {copy.switchText}{' '}
          <Link to={copy.switchTo} className="font-medium text-fg underline">
            {copy.switchLabel}
          </Link>
        </p>
      </Card>
    </main>
  )
}
