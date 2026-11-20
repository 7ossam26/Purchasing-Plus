import { createUser, editUser } from '@purchasing-plus/shared';
import { admin, ar } from '@purchasing-plus/shared/i18n/ar';
import { useMutation } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';

import { InlineError } from '../../components/shared/record-feedback.js';
import { Button } from '../../components/ui/button.js';
import { ChipSelect, ToggleRow } from '../../components/ui/choice.js';
import { useConfirm } from '../../components/ui/dialogs.js';
import { Field, Input, Select } from '../../components/ui/field.js';
import { userApi, type User, type UserOptions } from '../../lib/api/users.js';

import { scopeLabel } from './labels.js';

const copy = admin.users;

export function UserForm({
  user,
  ownAccount,
  options,
  onSaved,
  onBusy,
}: {
  user?: User;
  ownAccount: boolean;
  options: UserOptions;
  onSaved: (another: boolean) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [roleId, setRoleId] = useState(String(user?.roleId ?? ''));
  const [siteIds, setSiteIds] = useState(
    user?.sites.map(({ siteId }) => String(siteId)) ?? [],
  );
  const [active, setActive] = useState(user?.isActive ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingAction, setPendingAction] = useState('');
  const confirm = useConfirm();
  const mutation = useMutation({
    mutationFn: (
      input:
        | { mode: 'create'; body: Parameters<typeof userApi.create>[0] }
        | {
            mode: 'edit';
            id: number;
            body: Parameters<typeof userApi.update>[1];
          },
    ) =>
      input.mode === 'create'
        ? userApi.create(input.body)
        : userApi.update(input.id, input.body),
  });
  const roles = options.roles.filter((item) => item.assignable);
  const role = roles.find((item) => String(item.id) === roleId);
  const sites = options.sites
    .filter((item) => item.isActive || siteIds.includes(String(item.id)))
    .map((item) => ({
      value: String(item.id),
      label: item.isActive
        ? item.name
        : item.name + ' (' + admin.inactive + ')',
    }));

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    const fields = new FormData(event.currentTarget);
    const another =
      (event.nativeEvent.submitter as HTMLButtonElement | null)?.value ===
      'another';
    const identity = {
      name: fields.get('name'),
      username: fields.get('username'),
    };
    const access = {
      roleId: Number(roleId),
      siteIds: role?.siteScope === 'ASSIGNED' ? siteIds.map(Number) : [],
      isActive: active,
    };
    const submission = user
      ? {
          mode: 'edit' as const,
          id: user.id,
          result: editUser.safeParse(
            ownAccount ? identity : { ...identity, ...access },
          ),
        }
      : {
          mode: 'create' as const,
          result: createUser.safeParse({
            ...identity,
            ...access,
            password: fields.get('password'),
          }),
        };
    if (!submission.result.success) {
      const messages: Record<string, string> = {
        name: admin.validName,
        username: copy.invalidUsername,
        roleId: copy.selectRole,
        password: copy.invalidPassword,
      };
      setErrors(
        Object.fromEntries(
          submission.result.error.issues.map((issue) => [
            String(issue.path[0]),
            messages[String(issue.path[0])] ?? ar.common.fallbackError,
          ]),
        ),
      );
      mutation.reset();
      return;
    }
    setErrors({});
    if (
      user &&
      !ownAccount &&
      active !== user.isActive &&
      !(await confirm({
        title: active ? copy.reactivateTitle : copy.deactivateTitle,
        confirmLabel: active ? copy.reactivate : copy.deactivate,
        tone: active ? 'default' : 'danger',
      }))
    )
      return;
    setPendingAction(another ? 'another' : 'save');
    onBusy(true);
    try {
      await mutation.mutateAsync(
        submission.mode === 'create'
          ? { mode: 'create', body: submission.result.data }
          : { mode: 'edit', id: submission.id, body: submission.result.data },
      );
      onSaved(another);
    } catch {
      // The mutation error is rendered in the form, including the API fix text.
    } finally {
      onBusy(false);
    }
  }

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(event) => void submit(event)}
    >
      <Field label={admin.name} error={errors.name} required>
        {(props) => (
          <Input
            {...props}
            name="name"
            defaultValue={user?.name}
            data-initial-focus
          />
        )}
      </Field>
      <Field
        label={ar.auth.username}
        hint={copy.usernameHint}
        error={errors.username}
        required
      >
        {(props) => (
          <Input
            {...props}
            name="username"
            dir="ltr"
            autoComplete="off"
            defaultValue={user?.username}
          />
        )}
      </Field>
      {!user && (
        <Field
          label={ar.auth.password}
          hint={ar.auth.passwordHint}
          error={errors.password}
          required
        >
          {(props) => (
            <Input
              {...props}
              name="password"
              dir="ltr"
              type="password"
              autoComplete="new-password"
            />
          )}
        </Field>
      )}
      {!ownAccount && (
        <>
          <Field
            label={admin.role}
            error={errors.roleId}
            hint={!roles.length ? copy.noRoles : undefined}
            required
          >
            {(props) => (
              <Select
                {...props}
                value={roleId}
                onChange={(event) => setRoleId(event.currentTarget.value)}
              >
                <option value="">{ar.common.choose}</option>
                {roles.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} — {scopeLabel(item.siteScope)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {role?.siteScope === 'ASSIGNED' &&
            (sites.length ? (
              <ChipSelect
                label={admin.sites}
                options={sites}
                value={siteIds}
                onChange={setSiteIds}
              />
            ) : (
              <p className="text-small text-concrete">{copy.noSites}</p>
            ))}
          <ToggleRow
            label={admin.active}
            checked={active}
            onChange={setActive}
          />
        </>
      )}
      <InlineError error={mutation.error} />
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          value="save"
          disabled={mutation.isPending}
          loading={mutation.isPending && pendingAction === 'save'}
        >
          {user ? admin.saveChanges : ar.common.save}
        </Button>
        {!user && (
          <Button
            type="submit"
            value="another"
            variant="secondary"
            disabled={mutation.isPending}
            loading={mutation.isPending && pendingAction === 'another'}
          >
            {admin.saveAnother}
          </Button>
        )}
      </div>
    </form>
  );
}
