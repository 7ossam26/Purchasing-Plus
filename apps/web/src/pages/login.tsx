import { ar } from '@purchasing-plus/shared/i18n/ar';
import { useState, type SubmitEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router';

import { safeReturnTo } from '../app/navigation.js';
import { SessionState } from '../app/session-state.js';
import { useSession } from '../app/session.js';
import { Button } from '../components/ui/button.js';
import { Field, Input } from '../components/ui/field.js';
import { Logo } from '../components/ui/logo.js';
import { ApiError } from '../lib/api/client.js';

export function LoginPage() {
  const { profile, login } = useSession();
  const [params] = useSearchParams();
  const [error, setError] = useState<Error | null>(null);
  const [saving, setSaving] = useState(false);
  if (profile === undefined) return <SessionState />;
  if (profile)
    return <Navigate to={safeReturnTo(params.get('returnTo'))} replace />;

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const data = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    try {
      await login({
        username: String(data.get('username')),
        password: String(data.get('password')),
      });
    } catch (error) {
      setError(
        error instanceof Error ? error : new Error(ar.common.fallbackError),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-6 border-b border-seam pb-5">
        <Logo size="hero" product />
      </div>
      <h1 className="mb-5 text-title sm:text-title-wide">{ar.auth.title}</h1>
      <form onSubmit={(event) => void submit(event)} className="grid gap-4">
        <Field label={ar.auth.username} required>
          {(props) => (
            <Input
              {...props}
              name="username"
              dir="ltr"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={100}
            />
          )}
        </Field>
        <Field label={ar.auth.password} required>
          {(props) => (
            <Input
              {...props}
              name="password"
              dir="ltr"
              type="password"
              autoComplete="current-password"
              maxLength={512}
            />
          )}
        </Field>
        {error && (
          <div role="alert" className="rounded-control bg-danger-bg p-3">
            <p className="text-small font-semibold text-danger-fg">
              {error instanceof ApiError
                ? error.message
                : ar.common.fallbackError}
            </p>
            {error instanceof ApiError &&
              (error.fix ||
                error.status === 401 ||
                error.status === 423 ||
                error.status === 429) && (
                <p className="mt-1 text-small text-danger-fg">
                  {error.fix ??
                    (error.status === 429
                      ? ar.auth.rateLimit
                      : ar.auth.lockout)}
                </p>
              )}
          </div>
        )}
        <Button type="submit" loading={saving}>
          {ar.auth.login}
        </Button>
      </form>
    </div>
  );
}
