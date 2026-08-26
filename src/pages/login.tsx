import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react'
import { GithubMark } from '@/components/github-mark'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { GitHubError, validateCredentials } from '@/lib/github'
import { useAuth } from '@/store/auth'
import { useOrgStore } from '@/store/orgs'

const schema = z.object({
  username: z
    .string()
    .trim()
    .min(1, 'GitHub username is required')
    .regex(
      /^[A-Za-z\d](?:[A-Za-z\d]|-(?=[A-Za-z\d])){0,38}$/,
      'That is not a valid GitHub username',
    ),
  token: z
    .string()
    .trim()
    .min(1, 'Personal access token is required')
    .min(20, 'That token looks too short'),
})

type FormValues = z.infer<typeof schema>

/** Scopes the rest of the app needs to read orgs and manage collaborators. */
const REQUIRED_SCOPES = ['repo', 'admin:org']

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation() as { state?: { from?: string } }
  const signIn = useAuth((s) => s.signIn)
  const isAuthenticated = useAuth((s) => Boolean(s.token && s.user))

  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [showToken, setShowToken] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: '', token: '' },
  })

  if (isAuthenticated) return <Navigate to="/dashboard" replace />

  const onSubmit = async (values: FormValues) => {
    setError(null)
    setWarning(null)
    try {
      const { user, scopes } = await validateCredentials(values.username, values.token)

      const missing = REQUIRED_SCOPES.filter(
        (scope) => !scopes.some((s) => s === scope || s.startsWith(`${scope}:`)),
      )
      // Fine-grained tokens report no scopes at all — don't block on that.
      if (scopes.length > 0 && missing.length > 0) {
        setWarning(
          `Token is valid but missing scope(s): ${missing.join(', ')}. Some actions may fail.`,
        )
      }

      signIn({ username: user.login, token: values.token.trim(), user, scopes })
      useOrgStore.getState().reset()
      navigate(location.state?.from ?? '/dashboard', { replace: true })
    } catch (cause) {
      if (cause instanceof GitHubError) {
        setError(
          cause.statusCode === 401
            ? cause.message.includes('belongs to')
              ? cause.message
              : 'GitHub rejected these credentials. Check the token and try again.'
            : cause.statusCode === 0
              ? 'Could not reach api.github.com. Check your connection.'
              : cause.message,
        )
      } else {
        setError('Something went wrong while validating the token.')
      }
    }
  }

  const submitting = form.formState.isSubmitting

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <GithubMark className="size-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">GitHub Jarvis</h1>
          <p className="text-sm text-muted-foreground">
            Manage organizations, repositories and access from one place.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Credentials are validated against the GitHub API and kept in this browser.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>GitHub username</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="octocat"
                          autoComplete="username"
                          autoCapitalize="none"
                          spellCheck={false}
                          disabled={submitting}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="token"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Personal access token</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showToken ? 'text' : 'password'}
                            placeholder="ghp_…"
                            autoComplete="current-password"
                            spellCheck={false}
                            disabled={submitting}
                            className="pr-10 font-mono"
                            {...field}
                          />
                          <button
                            type="button"
                            onClick={() => setShowToken((v) => !v)}
                            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                            aria-label={showToken ? 'Hide token' : 'Show token'}
                          >
                            {showToken ? (
                              <EyeOff className="size-4" />
                            ) : (
                              <Eye className="size-4" />
                            )}
                          </button>
                        </div>
                      </FormControl>
                      <FormDescription>
                        Needs <code className="font-mono">repo</code> and{' '}
                        <code className="font-mono">admin:org</code> scopes to manage access.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="size-4" />
                    <AlertTitle>Sign in failed</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {warning && (
                  <Alert>
                    <AlertCircle className="size-4" />
                    <AlertTitle>Heads up</AlertTitle>
                    <AlertDescription>{warning}</AlertDescription>
                  </Alert>
                )}

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting && <Loader2 className="animate-spin" />}
                  {submitting ? 'Validating…' : 'Sign in'}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          The token is stored in this browser's localStorage so the session survives a
          reload. Sign out to remove it.
        </p>
      </div>
    </div>
  )
}
