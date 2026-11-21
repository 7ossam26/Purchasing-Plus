import { createSupport } from '@purchasing-plus/shared';
import { admin, ar, supportUi } from '@purchasing-plus/shared/i18n/ar';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useSession } from '../../app/session.js';
import { Pagination } from '../../components/shared/pagination.js';
import {
  InlineError,
  LoadRecord,
} from '../../components/shared/record-feedback.js';
import { RecordManager } from '../../components/shared/record-manager.js';
import { Button } from '../../components/ui/button.js';
import { useConfirm, usePrompt } from '../../components/ui/dialogs.js';
import { Field, Input } from '../../components/ui/field.js';
import { Modal } from '../../components/ui/modal.js';
import { EmptyState } from '../../components/ui/states.js';
import { toast } from '../../components/ui/toast.js';
import { ActiveStatus } from '../../features/admin/labels.js';
import { supportApi } from '../../lib/api/support.js';
import type { User } from '../../lib/api/users.js';

const copy = supportUi.accounts;

function CreateAccount({
  close,
  created,
}: {
  close: () => void;
  created: () => Promise<void>;
}) {
  const [draft, setDraft] = useState({ name: '', username: '', password: '' });
  const parsed = createSupport.safeParse(draft);
  const create = useMutation({
    mutationFn: supportApi.create,
    onSuccess: async () => {
      toast.success(copy.added);
      close();
      await created();
    },
  });

  const fields = [
    { key: 'name', label: admin.name, type: 'text', max: 200 },
    { key: 'username', label: ar.auth.username, type: 'text', max: 100 },
    { key: 'password', label: ar.auth.newPassword, type: 'password', max: 512 },
  ] as const;

  return (
    <Modal
      open
      title={copy.add}
      dismissible={!create.isPending}
      onClose={close}
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (parsed.success && !create.isPending) create.mutate(parsed.data);
        }}
      >
        {fields.map(({ key, label, type, max }) => (
          <Field
            required
            key={key}
            label={label}
            hint={key === 'password' ? ar.auth.passwordHint : undefined}
          >
            {(props) => (
              <Input
                {...props}
                type={type}
                maxLength={max}
                dir={key === 'name' ? 'auto' : 'ltr'}
                data-initial-focus={key === 'name' || undefined}
                autoComplete={key === 'password' ? 'new-password' : 'off'}
                value={draft[key]}
                onChange={(event) =>
                  setDraft({ ...draft, [key]: event.currentTarget.value })
                }
              />
            )}
          </Field>
        ))}
        <InlineError error={create.error} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="secondary"
            disabled={create.isPending}
            onClick={close}
          >
            {ar.common.cancel}
          </Button>
          <Button
            type="submit"
            loading={create.isPending}
            disabled={!parsed.success}
          >
            {copy.add}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function SuperadminsPage() {
  const session = useSession();
  const client = useQueryClient();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const query = useQuery({
    queryKey: ['support', 'accounts', page],
    queryFn: ({ signal }) => supportApi.accounts(page, signal),
  });
  async function refresh() {
    await client.invalidateQueries({ queryKey: ['support'] });
  }
  const action = useMutation({
    mutationFn: async ({
      user,
      password,
    }: {
      user: User;
      password?: string;
    }) => {
      if (password !== undefined) {
        await supportApi.resetPassword(user.id, password);
        toast.success(admin.users.passwordReset);
      } else {
        await supportApi.deactivate(user.id);
        toast.success(admin.users.deactivated);
        if (user.id === session.profile?.user.id) await session.logout();
      }
    },
    onSuccess: refresh,
  });

  async function deactivate(user: User) {
    if (
      await confirm({
        title: admin.users.deactivateTitle,
        description: user.name,
        confirmLabel: admin.users.deactivate,
        tone: 'danger',
      })
    )
      action.mutate({ user });
  }

  async function resetPassword(user: User) {
    const password = await prompt({
      title: admin.users.resetTitle,
      description: admin.users.resetDetail,
      label: ar.auth.newPassword,
      confirmLabel: admin.users.resetPassword,
      mode: 'password',
    });
    if (password !== null) action.mutate({ user, password });
  }

  return (
    <RecordManager
      title={copy.title}
      add={{ id: 'add', label: copy.add, onClick: () => setAdding(true) }}
    >
      <InlineError error={action.error} />
      <LoadRecord query={query}>
        {({ items, activeTotal }) =>
          items.length ? (
            <ul
              aria-label={copy.title}
              className="divide-y divide-seam rounded-panel border border-seam"
            >
              {items.map((user) => (
                <li
                  key={user.id}
                  className="grid gap-3 p-3 sm:flex sm:items-start sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="wrap-anywhere text-subtitle">
                        <bdi>{user.name}</bdi>
                      </h2>
                      <ActiveStatus active={user.isActive} />
                    </div>
                    <bdi
                      dir="ltr"
                      className="wrap-anywhere text-small text-concrete"
                    >
                      {user.username}
                    </bdi>
                  </div>
                  <div className="flex flex-wrap items-start gap-2 sm:justify-end">
                    {user.id !== session.profile?.user.id && (
                      <Button
                        variant="ghost"
                        disabled={action.isPending}
                        onClick={() => void resetPassword(user)}
                      >
                        {admin.users.resetPassword}
                      </Button>
                    )}
                    {user.isActive && (
                      <>
                        <Button
                          variant="danger-outline"
                          disabled={action.isPending || activeTotal === 1}
                          onClick={() => void deactivate(user)}
                        >
                          {admin.users.deactivate}
                        </Button>
                        {activeTotal === 1 && (
                          <p className="w-full text-small text-concrete sm:text-end">
                            {copy.lastActive}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={copy.empty} />
          )
        }
      </LoadRecord>
      {query.data && query.data.total > query.data.pageSize && (
        <Pagination
          page={page}
          pageSize={query.data.pageSize}
          total={query.data.total}
          onPageChange={setPage}
        />
      )}
      {adding && (
        <CreateAccount close={() => setAdding(false)} created={refresh} />
      )}
    </RecordManager>
  );
}
