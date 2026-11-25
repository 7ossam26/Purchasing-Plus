import { ar } from '@purchasing-plus/shared/i18n/ar';
import { KeyRound, LogOut, Monitor, Moon, Sun, UserRound } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { useNavigate } from 'react-router';

import { Button } from '../../components/ui/button.js';
import { SegmentedChoice } from '../../components/ui/choice.js';
import { useConfirm } from '../../components/ui/dialogs.js';
import { Field, Input } from '../../components/ui/field.js';
import { Modal } from '../../components/ui/modal.js';
import { toast, toastError } from '../../components/ui/toast.js';
import { ApiError } from '../../lib/api/client.js';
import {
  setThemePreference,
  themePreferences,
  useTheme,
  type ThemePreference,
} from '../../lib/theme.js';
import { useSession } from '../session.js';

const themeIcons = { system: Monitor, light: Sun, dark: Moon };
function AppearanceChoice() {
  const { preference } = useTheme();
  return (
    <SegmentedChoice
      label={ar.appearance.title}
      hint={ar.appearance.hint}
      value={preference}
      onChange={(value) => setThemePreference(value as ThemePreference)}
      options={themePreferences.map((id) => {
        const Icon = themeIcons[id];
        return {
          value: id,
          label: ar.appearance[id],
          icon: (
            <Icon
              className="shrink-0"
              size={18}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          ),
        };
      })}
    />
  );
}

export function AccountMenu() {
  const { profile, logout } = useSession();
  const [panel, setPanel] = useState<'menu' | 'password' | null>(null);
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();
  const navigate = useNavigate();
  if (!profile) return null;
  const identity = profile.isSuperadmin ? ar.auth.support : profile.roleName;
  async function signOut() {
    if (
      !(await confirm({
        title: ar.auth.logoutTitle,
        confirmLabel: ar.auth.logout,
        tone: 'danger',
      }))
    )
      return;
    setSaving(true);
    try {
      await logout();
      toast.success(ar.auth.logoutDone);
      void navigate('/login', { replace: true });
    } catch (error) {
      setPanel(null);
      toastError(
        error instanceof ApiError
          ? error
          : { message: ar.common.fallbackError },
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <Button
        variant="ghost"
        onClick={() => setPanel('menu')}
        aria-haspopup="dialog"
        aria-label={ar.auth.userMenu}
        className="max-md:px-2"
      >
        <UserRound size={24} strokeWidth={1.75} aria-hidden="true" />
        <span className="hidden max-w-40 truncate md:inline">
          <bdi>{profile.user.name}</bdi>
        </span>
      </Button>
      <Modal
        open={panel !== null}
        title={panel === 'password' ? ar.auth.changePassword : ar.auth.userMenu}
        onClose={() => setPanel(null)}
        dismissible={!saving}
      >
        {panel === 'menu' && (
          <div className="grid gap-4">
            <div className="border-b border-seam pb-4">
              <p className="text-subtitle">
                <bdi>{profile.user.name}</bdi>
              </p>
              {identity && (
                <p className="text-small text-concrete">
                  <bdi>{identity}</bdi>
                </p>
              )}
            </div>
            <div className="border-b border-seam pb-4">
              <AppearanceChoice />
            </div>
            <div className="grid gap-2">
              <Button
                variant="secondary"
                className="justify-start"
                onClick={() => setPanel('password')}
              >
                <KeyRound size={20} strokeWidth={1.75} aria-hidden="true" />
                {ar.auth.changePassword}
              </Button>
              <Button
                variant="danger-outline"
                className="justify-start"
                loading={saving}
                onClick={() => void signOut()}
              >
                <LogOut size={20} strokeWidth={1.75} aria-hidden="true" />
                {ar.auth.logout}
              </Button>
            </div>
          </div>
        )}
        {panel === 'password' && <PasswordForm onBusy={setSaving} />}
      </Modal>
    </>
  );
}
function PasswordForm({ onBusy }: { onBusy: (busy: boolean) => void }) {
  const { changePassword } = useSession();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const data = new FormData(event.currentTarget);
    setSaving(true);
    onBusy(true);
    setError(null);
    try {
      await changePassword({
        currentPassword: String(data.get('currentPassword')),
        newPassword: String(data.get('newPassword')),
      });
      toast.success(ar.auth.passwordChanged);
      void navigate('/login', { replace: true });
    } catch (error) {
      setError(
        error instanceof ApiError
          ? error
          : new ApiError(0, 'UNKNOWN', ar.common.fallbackError),
      );
    } finally {
      setSaving(false);
      onBusy(false);
    }
  }
  return (
    <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
      <Field label={ar.auth.currentPassword} required>
        {(props) => (
          <Input
            {...props}
            name="currentPassword"
            dir="ltr"
            autoComplete="current-password"
            type="password"
            maxLength={512}
          />
        )}
      </Field>
      <Field label={ar.auth.newPassword} hint={ar.auth.passwordHint} required>
        {(props) => (
          <Input
            {...props}
            name="newPassword"
            dir="ltr"
            autoComplete="new-password"
            type="password"
            minLength={8}
            maxLength={512}
          />
        )}
      </Field>
      {error && (
        <div
          role="alert"
          className="rounded-control bg-danger-bg p-3 text-small text-danger-fg"
        >
          <p>{error.message}</p>
          {error.fix && <p>{error.fix}</p>}
        </div>
      )}
      <Button type="submit" loading={saving}>
        {ar.auth.changePassword}
      </Button>
    </form>
  );
}
