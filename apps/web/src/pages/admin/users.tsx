import { admin, ar } from '@purchasing-plus/shared/i18n/ar';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useCan, useSession } from '../../app/session.js';
import {
  DataTable,
  type TableColumn,
} from '../../components/shared/data-table.js';
import { Pagination } from '../../components/shared/pagination.js';
import {
  errorDetails,
  InlineError,
  LoadRecord,
} from '../../components/shared/record-feedback.js';
import { RecordManager } from '../../components/shared/record-manager.js';
import { Button } from '../../components/ui/button.js';
import { useConfirm, usePrompt } from '../../components/ui/dialogs.js';
import { Field, Input, Select } from '../../components/ui/field.js';
import { Modal } from '../../components/ui/modal.js';
import { toast } from '../../components/ui/toast.js';
import { ActiveStatus, scopeLabel } from '../../features/admin/labels.js';
import { UserForm } from '../../features/admin/user-form.js';
import { userApi, type User, type UserFilters } from '../../lib/api/users.js';

const copy = admin.users;
const blank: UserFilters = { search: '', roleId: '', siteId: '', active: '' };
const columns: TableColumn<User>[] = [
  { id: 'name', header: admin.name, cell: (user) => <bdi>{user.name}</bdi> },
  {
    id: 'username',
    header: ar.auth.username,
    cell: (user) => <bdi dir="ltr">{user.username}</bdi>,
  },
  {
    id: 'role',
    header: admin.role,
    cell: (user) => user.role?.name ?? ar.auth.support,
  },
  {
    id: 'scope',
    header: admin.scope,
    cell: (user) => scopeLabel(user.role?.siteScope ?? 'ALL'),
  },
  {
    id: 'sites',
    header: admin.sites,
    cell: (user) =>
      user.role?.siteScope !== 'ASSIGNED'
        ? admin.allSites
        : user.sites.map((item) => item.name).join('، ') ||
          copy.noAssignedSites,
  },
  {
    id: 'status',
    header: admin.status,
    cell: (user) => <ActiveStatus active={user.isActive} />,
  },
];

export function UsersPage() {
  const { profile } = useSession();
  const canManage = useCan('users.manage');
  const client = useQueryClient();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [filters, setFilters] = useState(blank);
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<User | 'new' | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const scope = [
    profile?.siteScope,
    profile?.sites.map((site) => site.id),
    profile?.permissions,
  ];
  const options = useQuery({
    queryKey: ['users', 'options', scope],
    queryFn: ({ signal }) => userApi.options(signal),
  });
  const results = useQuery({
    queryKey: ['users', 'list', page, filters, scope],
    queryFn: ({ signal }) => userApi.list(page, filters, signal),
  });
  async function refresh() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['users', 'list'] }),
      client.invalidateQueries({ queryKey: ['roles'] }),
    ]);
  }
  const rowAction = useMutation({
    mutationFn: async (action: { user: User; password?: string }) => {
      if (action.password !== undefined) {
        await userApi.reset(action.user.id, action.password);
        return copy.passwordReset;
      }
      await userApi.update(action.user.id, { isActive: !action.user.isActive });
      return action.user.isActive ? copy.deactivated : copy.reactivated;
    },
    onSuccess: async (message) => {
      toast.success(message);
      await refresh();
    },
  });
  function filter(key: keyof UserFilters, value: string) {
    setPage(1);
    setFilters({ ...filters, [key]: value });
  }
  function resetFilters() {
    setPage(1);
    setFilters(blank);
  }
  const filtered = Object.values(filters).some(Boolean);
  async function changeStatus(user: User) {
    if (
      await confirm({
        title: user.isActive ? copy.deactivateTitle : copy.reactivateTitle,
        confirmLabel: user.isActive ? copy.deactivate : copy.reactivate,
        tone: user.isActive ? 'danger' : 'default',
      })
    )
      rowAction.mutate({ user });
  }
  async function resetPassword(user: User) {
    const password = await prompt({
      title: copy.resetTitle,
      label: ar.auth.newPassword,
      description: copy.resetDetail,
      confirmLabel: copy.resetPassword,
      mode: 'password',
      required: true,
    });
    if (password !== null) rowAction.mutate({ user, password });
  }
  return (
    <RecordManager
      title={copy.title}
      add={
        canManage
          ? {
              id: 'add',
              label: copy.add,
              onClick: () => setModal('new'),
            }
          : undefined
      }
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Field label={admin.search}>
          {(props) => (
            <Input
              {...props}
              type="search"
              maxLength={200}
              value={filters.search}
              onChange={(event) => filter('search', event.currentTarget.value)}
            />
          )}
        </Field>
        <Field label={admin.role}>
          {(props) => (
            <Select
              {...props}
              value={filters.roleId}
              onChange={(event) => filter('roleId', event.currentTarget.value)}
            >
              <option value="">{admin.all}</option>
              {options.data?.roles.map((role) => (
                <option value={role.id} key={role.id}>
                  {role.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={admin.site}>
          {(props) => (
            <Select
              {...props}
              value={filters.siteId}
              onChange={(event) => filter('siteId', event.currentTarget.value)}
            >
              <option value="">{admin.all}</option>
              {options.data?.sites.map((site) => (
                <option value={site.id} key={site.id}>
                  {site.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={admin.status}>
          {(props) => (
            <Select
              {...props}
              value={filters.active}
              onChange={(event) => filter('active', event.currentTarget.value)}
            >
              <option value="">{admin.all}</option>
              <option value="true">{admin.active}</option>
              <option value="false">{admin.inactive}</option>
            </Select>
          )}
        </Field>
      </div>
      <InlineError error={options.error} retry={() => void options.refetch()} />
      <InlineError error={rowAction.error} />
      <DataTable
        caption={copy.title}
        rows={results.data?.items ?? []}
        rowKey={(row) => row.id}
        columns={columns}
        loading={results.isPending}
        error={results.error ? errorDetails(results.error) : undefined}
        onRetry={() => void results.refetch()}
        emptyMessage={copy.empty}
        filtered={filtered}
        filteredMessage={admin.noMatches}
        onReset={resetFilters}
        actions={
          canManage
            ? (user) =>
                user.canManage && (
                  <div className="flex flex-wrap justify-end gap-1">
                    <Button variant="secondary" onClick={() => setModal(user)}>
                      {admin.edit}
                    </Button>
                    {profile?.user.id !== user.id && (
                      <>
                        <Button
                          variant="secondary"
                          disabled={rowAction.isPending}
                          onClick={() => void resetPassword(user)}
                        >
                          {copy.resetPassword}
                        </Button>
                        <Button
                          variant={
                            user.isActive ? 'danger-outline' : 'secondary'
                          }
                          disabled={rowAction.isPending}
                          onClick={() => void changeStatus(user)}
                        >
                          {user.isActive ? copy.deactivate : copy.reactivate}
                        </Button>
                      </>
                    )}
                  </div>
                )
            : undefined
        }
      />
      {results.data && (
        <Pagination
          page={page}
          pageSize={results.data.pageSize}
          total={results.data.total}
          onPageChange={setPage}
        />
      )}
      <Modal
        open={canManage && modal !== null}
        title={modal === 'new' ? copy.add : copy.edit}
        dismissible={!saving}
        onClose={() => setModal(null)}
      >
        <LoadRecord query={options}>
          {(data) => (
            <UserForm
              key={formKey}
              user={modal === 'new' ? undefined : (modal ?? undefined)}
              ownAccount={modal !== 'new' && modal?.id === profile?.user.id}
              options={data}
              onBusy={setSaving}
              onSaved={(another) => {
                toast.success(modal === 'new' ? copy.added : copy.saved);
                void refresh();
                if (another) setFormKey((key) => key + 1);
                else setModal(null);
              }}
            />
          )}
        </LoadRecord>
      </Modal>
    </RecordManager>
  );
}
