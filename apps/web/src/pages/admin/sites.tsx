import { admin } from '@purchasing-plus/shared/i18n/ar';
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
} from '../../components/shared/record-feedback.js';
import { RecordManager } from '../../components/shared/record-manager.js';
import { Button } from '../../components/ui/button.js';
import { useConfirm } from '../../components/ui/dialogs.js';
import { Field, Input, Select } from '../../components/ui/field.js';
import { toast } from '../../components/ui/toast.js';
import { ActiveStatus } from '../../features/admin/labels.js';
import { SiteDialog } from '../../features/admin/site-dialog.js';
import {
  invalidateSiteQueries,
  siteApi,
  type Site,
} from '../../lib/api/sites.js';

const copy = admin.siteManager;
const columns: TableColumn<Site>[] = [
  { id: 'name', header: admin.name, cell: (site) => <bdi>{site.name}</bdi> },
  { id: 'address', header: copy.address, cell: (site) => site.address },
  {
    id: 'status',
    header: admin.status,
    cell: (site) => <ActiveStatus active={site.isActive} />,
  },
];

export function SitesPage() {
  const canAdd = useCan('sites.create');
  const canEdit = useCan('sites.edit');
  const canDeactivate = useCan('sites.delete');
  const { profile } = useSession();
  const client = useQueryClient();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [active, setActive] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<Site | 'new' | null>(null);
  const query = useQuery({
    queryKey: [
      'sites',
      'list',
      page,
      search,
      active,
      profile?.siteScope,
      profile?.sites.map((site) => site.id),
    ],
    queryFn: ({ signal }) => siteApi.list(page, search, active, signal),
  });
  const deactivate = useMutation({
    mutationFn: siteApi.deactivate,
    onSuccess: async () => {
      toast.success(copy.deactivated);
      if (page > 1 && active === 'true' && query.data?.items.length === 1)
        setPage(page - 1);
      await invalidateSiteQueries(client);
    },
  });
  async function deactivateSite(site: Site) {
    if (
      await confirm({
        title: copy.deactivateTitle,
        description: copy.deactivateDetail,
        confirmLabel: copy.deactivate,
        tone: 'danger',
      })
    )
      deactivate.mutate(site.id);
  }

  return (
    <RecordManager
      title={admin.sites}
      parent="/master-data"
      add={
        canAdd
          ? {
              id: 'add',
              label: copy.add,
              onClick: () => setModal('new'),
            }
          : undefined
      }
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label={admin.search}>
          {(props) => (
            <Input
              {...props}
              type="search"
              maxLength={200}
              value={search}
              onChange={(event) => {
                setPage(1);
                setSearch(event.currentTarget.value);
              }}
            />
          )}
        </Field>
        <Field label={admin.status}>
          {(props) => (
            <Select
              {...props}
              value={active}
              onChange={(event) => {
                setPage(1);
                setActive(event.currentTarget.value);
              }}
            >
              <option value="">{admin.all}</option>
              <option value="true">{admin.active}</option>
              <option value="false">{admin.inactive}</option>
            </Select>
          )}
        </Field>
      </div>
      <InlineError error={deactivate.error} />
      <DataTable
        caption={admin.sites}
        rows={query.data?.items ?? []}
        rowKey={(site) => site.id}
        columns={columns}
        loading={query.isPending}
        error={query.error ? errorDetails(query.error) : undefined}
        onRetry={() => void query.refetch()}
        emptyMessage={copy.empty}
        filtered={Boolean(search || active)}
        filteredMessage={admin.noMatches}
        onReset={() => {
          setPage(1);
          setSearch('');
          setActive('');
        }}
        actions={
          canEdit || canDeactivate
            ? (site) => (
                <div className="flex flex-wrap justify-end gap-1">
                  {canEdit && (
                    <Button variant="secondary" onClick={() => setModal(site)}>
                      {admin.edit}
                    </Button>
                  )}
                  {canDeactivate && site.isActive && (
                    <Button
                      variant="danger-outline"
                      disabled={deactivate.isPending}
                      onClick={() => void deactivateSite(site)}
                    >
                      {copy.deactivate}
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
      {modal && (modal === 'new' ? canAdd : canEdit) && (
        <SiteDialog
          site={modal === 'new' ? undefined : modal}
          onClose={() => setModal(null)}
        />
      )}
    </RecordManager>
  );
}
