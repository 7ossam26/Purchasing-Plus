import { formatNumber } from '@purchasing-plus/shared';
import { ar, uiPreview } from '@purchasing-plus/shared/i18n/ar';
import {
  statusMap,
  type DisplayStatus,
} from '@purchasing-plus/shared/lifecycle';
import { Check, FileText, Folder } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';

import { StandardShell } from '../app/shells/standard.js';
import { ActionBar } from '../components/shared/action-bar.js';
import { DataTable } from '../components/shared/data-table.js';
import { Pagination } from '../components/shared/pagination.js';
import { useLeaveGuard } from '../components/shared/use-leave-guard.js';
import { Button } from '../components/ui/button.js';
import { Chip, StatusChip } from '../components/ui/chip.js';
import {
  ChipSelect,
  SelectableCard,
  ToggleRow,
} from '../components/ui/choice.js';
import { useConfirm, usePrompt } from '../components/ui/dialogs.js';
import {
  Field,
  Input,
  NumberInput,
  Select,
  Textarea,
} from '../components/ui/field.js';
import { Modal } from '../components/ui/modal.js';
import { EmptyState, Skeleton } from '../components/ui/states.js';
import { Tabs } from '../components/ui/tabs.js';
import { toast } from '../components/ui/toast.js';

const d = uiPreview;
const c = ar.common;
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid min-w-0 gap-4 rounded-panel border border-seam bg-paper p-4 sm:p-6">
      <h2 className="text-section">{title}</h2>
      {children}
    </section>
  );
}

function Fields() {
  const [quantity, setQuantity] = useState('12.50');
  const [dirty, setDirty] = useState(false);
  useLeaveGuard(dirty);
  return (
    <Section title={d.fields}>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <Field label={d.name} required>
          {(props) => (
            <Input
              {...props}
              defaultValue={d.exampleA}
              onChange={() => setDirty(true)}
            />
          )}
        </Field>
        <Field label={d.quantity}>
          {(props) => (
            <NumberInput
              {...props}
              value={quantity}
              onValueChange={setQuantity}
            />
          )}
        </Field>
        <Field label={d.notes}>{(props) => <Textarea {...props} />}</Field>
        <Field label={d.site}>
          {(props) => (
            <Select {...props}>
              <option>{d.exampleA}</option>
              <option>{d.exampleB}</option>
            </Select>
          )}
        </Field>
      </div>
      {dirty && (
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              setDirty(false);
              toast.success(d.saved);
            }}
          >
            {c.save}
          </Button>
          <Link
            to="/"
            className="inline-flex min-h-target items-center px-3 underline"
          >
            {c.home}
          </Link>
        </div>
      )}
    </Section>
  );
}
function Choices() {
  const [selected, setSelected] = useState(['a']);
  const [scope, setScope] = useState('assigned');
  const [active, setActive] = useState(true);
  const [tab, setTab] = useState('summary');
  return (
    <Section title={d.choices}>
      <ChipSelect
        label={d.site}
        options={[
          { value: 'a', label: d.exampleA },
          { value: 'b', label: d.exampleB },
        ]}
        value={selected}
        onChange={setSelected}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        {[
          { value: 'assigned', label: d.assigned, description: d.assignedHint },
          { value: 'all', label: d.allSites, description: d.allHint },
        ].map((option) => (
          <SelectableCard
            key={option.value}
            name="preview-scope"
            option={option}
            selected={scope === option.value}
            onSelect={setScope}
          />
        ))}
      </div>
      <ToggleRow
        label={d.active}
        description={d.assignedHint}
        checked={active}
        onChange={setActive}
      />
      <Tabs
        label={d.details}
        value={tab}
        onChange={setTab}
        tabs={[
          {
            id: 'summary',
            label: d.details,
            count: 2,
            content: <p>{d.exampleA}</p>,
          },
          { id: 'notes', label: d.notes, content: <p>{d.exampleB}</p> },
        ]}
      />
      <Tabs
        variant="route"
        label={d.demoTab}
        tabs={[
          { to: '/dev/ui', label: d.title },
          { to: '/', label: c.home },
        ]}
      />
    </Section>
  );
}
function Overlays() {
  const [depth, setDepth] = useState(0);
  const confirm = useConfirm();
  const prompt = usePrompt();
  return (
    <Section title={d.overlays}>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setDepth(1)}>{d.showModal}</Button>
        <Button
          variant="secondary"
          onClick={async () => {
            const reason = await prompt({
              title: d.reasonTitle,
              mode: 'reason',
              confirmLabel: c.save,
            });
            if (reason) toast.success(d.saved);
          }}
        >
          {d.showPrompt}
        </Button>
        <Button
          variant="danger-outline"
          onClick={async () => {
            if (
              await confirm({
                title: d.ask,
                confirmLabel: d.remove,
                tone: 'danger',
              })
            )
              toast.success(d.saved);
          }}
        >
          {d.showConfirm}
        </Button>
      </div>
      <Modal
        title={d.details}
        icon={<FileText size={20} strokeWidth={1.75} aria-hidden="true" />}
        open={depth > 0}
        onClose={() => setDepth(0)}
      >
        <Button variant="secondary" onClick={() => setDepth(2)}>
          {d.stack}
        </Button>
        <Modal title={d.notes} open={depth > 1} onClose={() => setDepth(1)}>
          <p>{d.exampleA}</p>
        </Modal>
      </Modal>
    </Section>
  );
}

const rows = [
  { id: 1, name: d.exampleA, quantity: '12.50' },
  { id: 2, name: d.exampleB, quantity: '8.25' },
];
function TablePreview() {
  const [state, setState] = useState('populated');
  const [page, setPage] = useState(1);
  return (
    <Section title={d.table}>
      <Field label={d.table}>
        {(props) => (
          <Select
            {...props}
            value={state}
            onChange={(e) => setState(e.currentTarget.value)}
          >
            <option value="populated">{d.populated}</option>
            <option value="loading">{c.loading}</option>
            <option value="empty">{d.empty}</option>
            <option value="filtered">{d.filter}</option>
            <option value="error">{d.failed}</option>
          </Select>
        )}
      </Field>
      <DataTable
        caption={d.site}
        columns={[
          { id: 'site', header: d.site, cell: (row) => row.name },
          {
            id: 'quantity',
            header: d.quantity,
            numeric: true,
            cell: (row) => <bdi>{formatNumber(row.quantity)}</bdi>,
          },
        ]}
        rowKey={(row) => row.id}
        rows={state === 'populated' || state === 'error' ? rows : []}
        emptyMessage={d.noRows}
        filteredMessage={d.filtered}
        loading={state === 'loading'}
        filtered={state === 'filtered'}
        error={
          state === 'error'
            ? { message: d.error, fix: ar.common.networkFix }
            : undefined
        }
        onRetry={() => setState('populated')}
        onReset={() => setState('populated')}
        actions={() => (
          <Button variant="ghost" onClick={() => toast.success(d.saved)}>
            {d.edit}
          </Button>
        )}
      />
      <Pagination page={page} pageSize={2} total={6} onPageChange={setPage} />
    </Section>
  );
}

export function Component() {
  const [saving, setSaving] = useState(false);
  return (
    <StandardShell>
      <div className="mx-auto grid max-w-5xl gap-4">
        <h1 className="text-title sm:text-title-wide">{d.title}</h1>
        <Section title={d.buttons}>
          <div className="flex flex-wrap gap-2">
            <Button
              loading={saving}
              onClick={() => {
                setSaving(true);
                window.setTimeout(() => {
                  setSaving(false);
                  toast.success(d.saved);
                }, 900);
              }}
            >
              {c.save}
            </Button>
            <Button variant="secondary" onClick={() => toast.success(d.saved)}>
              {d.toast}
            </Button>
            <Button
              variant="danger-outline"
              onClick={() =>
                toast.error(d.error, { description: c.networkFix })
              }
            >
              {d.failed}
            </Button>
            <Button variant="ghost" onClick={() => toast.message(d.details)}>
              {d.details}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip
              icon={<Check size={14} strokeWidth={1.75} aria-hidden="true" />}
            >
              {d.active}
            </Chip>
            {(Object.keys(statusMap) as DisplayStatus[]).map((status) => (
              <StatusChip key={status} status={status} />
            ))}
          </div>
        </Section>
        <Fields />
        <Choices />
        <Overlays />
        <TablePreview />
        <Section title={d.layout}>
          <Skeleton className="w-1/2" />
          <EmptyState
            title={d.noRows}
            icon={<Folder size={24} strokeWidth={1.75} />}
          />
        </Section>
        <ActionBar
          primary={{
            id: 'add',
            label: d.add,
            onClick: () => toast.success(d.saved),
          }}
          secondary={[
            {
              id: 'edit',
              label: d.edit,
              reason: d.disabled,
              onClick: () => undefined,
            },
          ]}
          overflow={[
            {
              id: 'remove',
              label: d.remove,
              variant: 'danger-outline',
              onClick: () => toast.message(d.ask),
            },
          ]}
        />
      </div>
    </StandardShell>
  );
}
