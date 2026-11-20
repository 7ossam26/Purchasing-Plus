import { formatNumber } from '@purchasing-plus/shared';
import { admin } from '@purchasing-plus/shared/i18n/ar';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { useCan } from '../../app/session.js';
import {
  DataTable,
  type TableColumn,
} from '../../components/shared/data-table.js';
import { Pagination } from '../../components/shared/pagination.js';
import {
  errorDetails,
  InlineError,
} from '../../components/shared/record-feedback.js';
import { RecordManager } from '../../components/shared/record-manager.js';
import { Button, buttonClass } from '../../components/ui/button.js';
import { useConfirm } from '../../components/ui/dialogs.js';
import { toast } from '../../components/ui/toast.js';
import { scopeLabel } from '../../features/admin/labels.js';
import { roleApi, type Role } from '../../lib/api/roles.js';

const copy = admin.roles;
const columns: TableColumn<Role>[] = [
  { id: 'name', header: admin.name, cell: (role) => <bdi>{role.name}</bdi> },
  {
    id: 'scope',
    header: admin.scope,
    cell: (role) => scopeLabel(role.siteScope),
  },
  {
    id: 'keys',
    header: copy.keyCount,
    numeric: true,
    cell: (role) => formatNumber(role.keyCount),
  },
  {
    id: 'users',
    header: copy.userCount,
    numeric: true,
    cell: (role) => formatNumber(role.userCount),
  },
];

export function RolesPage() {
  const canManage = useCan('roles.manage');
  const confirm = useConfirm();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['roles', 'list', page],
    queryFn: ({ signal }) => roleApi.list(page, signal),
  });
  const remove = useMutation({
    mutationFn: roleApi.delete,
    onSuccess: async () => {
      toast.success(copy.deleted);
      if (page > 1 && query.data?.items.length === 1) setPage(page - 1);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['roles'] }),
        client.invalidateQueries({ queryKey: ['users', 'options'] }),
      ]);
    },
  });
  async function deleteRole(role: Role) {
    const confirmed = await confirm({
      title: copy.deleteTitle,
      description: role.name,
      confirmLabel: admin.delete,
      tone: 'danger',
    });
    if (confirmed) {
      remove.mutate(role.id);
    }
  }
  return (
    <RecordManager
      title={copy.title}
      add={
        canManage
          ? {
              id: 'add',
              label: copy.add,
              onClick: () => void navigate('new'),
            }
          : undefined
      }
    >
      <InlineError error={remove.error} />
      <DataTable
        caption={copy.title}
        rows={query.data?.items ?? []}
        rowKey={(row) => row.id}
        columns={columns}
        loading={query.isPending}
        error={query.error ? errorDetails(query.error) : undefined}
        onRetry={() => void query.refetch()}
        emptyMessage={copy.empty}
        actions={
          canManage
            ? (role) =>
                role.canEdit && (
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <Link to={String(role.id)} className={buttonClass()}>
                      {admin.edit}
                    </Link>
                    {role.userCount > 0 ? (
                      <span className="text-small text-concrete">
                        {copy.inUse(formatNumber(role.userCount))}
                      </span>
                    ) : (
                      <Button
                        variant="danger-outline"
                        disabled={remove.isPending}
                        onClick={() => void deleteRole(role)}
                      >
                        {admin.delete}
                      </Button>
                    )}
                  </div>
                )
            : undefined
        }
      />
      {query.data && (
        <Pagination
          page={page}
          pageSize={query.data.pageSize}
          total={query.data.total}
          onPageChange={setPage}
        />
      )}
    </RecordManager>
  );
}
