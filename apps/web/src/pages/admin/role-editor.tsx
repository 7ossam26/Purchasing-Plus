import { createRole, formatNumber, pathId } from '@purchasing-plus/shared';
import { admin, ar } from '@purchasing-plus/shared/i18n/ar';
import {
  areas,
  closeOverRequires,
  registry,
  validateRoleKeys,
  type PermissionKey,
} from '@purchasing-plus/shared/permissions';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useState, type SubmitEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { useSession } from '../../app/session.js';
import {
  InlineError,
  LoadRecord,
} from '../../components/shared/record-feedback.js';
import { useLeaveGuard } from '../../components/shared/use-leave-guard.js';
import { Button, buttonClass } from '../../components/ui/button.js';
import { SelectableCard, ToggleRow } from '../../components/ui/choice.js';
import { Field, Input, Textarea } from '../../components/ui/field.js';
import { toast } from '../../components/ui/toast.js';
import { CopyRole } from '../../features/admin/copy-role.js';
import { scopeLabel } from '../../features/admin/labels.js';
import {
  roleApi,
  type Role,
  type RoleInput,
  type SiteScope,
} from '../../lib/api/roles.js';

const copy = admin.roles;
const rolesPath = '/admin/roles';
const scopes: SiteScope[] = ['ASSIGNED', 'ALL'];
const blank: RoleInput = {
  name: '',
  description: '',
  siteScope: 'ASSIGNED',
  keys: [],
};

export function NewRolePage() {
  return <RoleEditor />;
}

export function RoleEditorPage() {
  const parsed = pathId.safeParse(useParams().roleId);
  const id = parsed.success ? parsed.data : undefined;
  const query = useQuery({
    queryKey: ['roles', 'detail', id],
    queryFn: ({ signal }) => roleApi.get(id!, signal),
    enabled: id !== undefined,
  });
  if (id === undefined) return <p role="alert">{ar.errors.notFound}</p>;
  return (
    <LoadRecord query={query}>
      {(role) =>
        role.canEdit ? (
          <RoleEditor key={role.id} role={role} />
        ) : (
          <div className="grid gap-3">
            <h1 className="text-title">{role.name}</h1>
            <p role="alert">{copy.editBlocked}</p>
            <Link to={rolesPath} className={buttonClass()}>
              {ar.common.back}
            </Link>
          </div>
        )
      }
    </LoadRecord>
  );
}

function RoleEditor({ role }: { role?: Role }) {
  const { profile } = useSession();
  const client = useQueryClient();
  const navigate = useNavigate();
  const formId = useId();
  const [initial, setInitial] = useState<RoleInput>(() =>
    role
      ? {
          name: role.name,
          description: role.description,
          siteScope: role.siteScope,
          keys: role.keys,
        }
      : blank,
  );
  const [draft, setDraft] = useState(initial);
  const [automatic, setAutomatic] = useState<PermissionKey[]>([]);
  const [notice, setNotice] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [copyOpen, setCopyOpen] = useState(false);
  const [created, setCreated] = useState(false);
  const dirty =
    draft.name !== initial.name ||
    draft.description !== initial.description ||
    draft.siteScope !== initial.siteScope ||
    draft.keys.length !== initial.keys.length ||
    draft.keys.some((key) => !initial.keys.includes(key));
  useLeaveGuard(dirty);
  useEffect(() => {
    if (created && !dirty) void navigate(rolesPath, { replace: true });
  }, [created, dirty, navigate]);

  const mutation = useMutation({
    mutationFn: (input: RoleInput) => roleApi.save(input, role?.id),
    onSuccess: (saved) => {
      const next = {
        name: saved.name,
        description: saved.description,
        keys: saved.keys,
        siteScope: saved.siteScope,
      };
      setDraft(next);
      setInitial(next);
      toast.success(copy.saved);
      if (!role) setCreated(true);
      void client.invalidateQueries({ queryKey: ['roles'] });
      void client.invalidateQueries({ queryKey: ['users'] });
    },
  });
  const permissions = registry.filter(
    (permission) =>
      !permission.superadminOnly &&
      (profile?.isSuperadmin || profile?.permissions.includes(permission.key)),
  );
  const visible = new Set<string>(
    permissions.map((permission) => permission.key),
  );
  const dependencyLabels = (key: PermissionKey) =>
    permissions
      .filter(
        (permission) =>
          permission.key !== key &&
          draft.keys.includes(permission.key) &&
          closeOverRequires([permission.key]).includes(key),
      )
      .map((permission) => permission.label)
      .join('، ');
  const query = search.trim().toLowerCase();
  const results = permissions.some((permission) => matches(permission));

  function matches(permission: (typeof registry)[number]) {
    return [permission.area, permission.label, permission.consequence].some(
      (text) => text.toLowerCase().includes(query),
    );
  }
  function select(keys: string[], replace = false) {
    const available = keys.filter(
      (key) =>
        visible.has(key) &&
        closeOverRequires([key]).every((dependency) => visible.has(dependency)),
    );
    const explicit = new Set(
      replace ? available : [...draft.keys, ...available],
    );
    const expanded = closeOverRequires(explicit);
    setDraft({ ...draft, keys: expanded });
    setAutomatic([
      ...(replace ? [] : automatic.filter((key) => !available.includes(key))),
      ...expanded.filter((key) => !explicit.has(key)),
    ]);
    setNotice(
      available.length < keys.length && !replace
        ? copy.unavailableDependency
        : '',
    );
  }
  function toggle(key: PermissionKey, checked: boolean) {
    if (checked) {
      select([key]);
      return;
    }
    const parents = dependencyLabels(key);
    if (parents) {
      setNotice(copy.required(parents));
      return;
    }
    setDraft({ ...draft, keys: draft.keys.filter((item) => item !== key) });
    setAutomatic(automatic.filter((item) => item !== key));
    setNotice('');
  }
  function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending || created) return;
    const parsed = createRole.safeParse(draft);
    const validKeys =
      validateRoleKeys(draft.keys).valid &&
      draft.keys.every((key) => visible.has(key));
    const messages: Record<string, string> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        messages[key] =
          key === 'description' ? copy.invalidDescription : admin.validName;
      }
    }
    if (!validKeys) messages.keys = copy.invalidKeys;
    setErrors(messages);
    if (parsed.success && validKeys) mutation.mutate(parsed.data);
    else mutation.reset();
  }
  return (
    <section className="mx-auto grid max-w-[900px] gap-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-title">{role ? copy.edit : copy.add}</h1>
        <Link to={rolesPath} className={buttonClass()}>
          {ar.common.back}
        </Link>
      </header>
      <form id={formId} noValidate className="grid gap-4" onSubmit={save}>
        <fieldset
          disabled={mutation.isPending}
          className="grid min-w-0 gap-4 rounded-panel border border-seam bg-paper p-4"
        >
          <Field label={admin.name} required error={errors.name}>
            {(props) => (
              <Input
                {...props}
                value={draft.name}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.currentTarget.value })
                }
              />
            )}
          </Field>
          <Field label={admin.description} error={errors.description}>
            {(props) => (
              <Textarea
                {...props}
                value={draft.description}
                onChange={(event) =>
                  setDraft({ ...draft, description: event.currentTarget.value })
                }
              />
            )}
          </Field>
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="mb-2 text-small font-semibold">
              {admin.scope}
            </legend>
            {scopes
              .filter(
                (scope) => scope === 'ASSIGNED' || profile?.siteScope === 'ALL',
              )
              .map((scope) => (
                <SelectableCard
                  key={scope}
                  name="scope"
                  selected={scope === draft.siteScope}
                  option={{
                    value: scope,
                    label: scopeLabel(scope),
                    description:
                      scope === 'ALL' ? admin.allSitesHint : admin.assignedHint,
                  }}
                  onSelect={() => setDraft({ ...draft, siteScope: scope })}
                />
              ))}
          </fieldset>
        </fieldset>
        <fieldset disabled={mutation.isPending} className="grid min-w-0 gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1">
              <Field label={copy.search}>
                {(props) => (
                  <Input
                    {...props}
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.currentTarget.value)}
                  />
                )}
              </Field>
            </div>
            <Button variant="secondary" onClick={() => setCopyOpen(true)}>
              {copy.copy}
            </Button>
          </div>
          {notice && (
            <p
              role="alert"
              className="rounded-control bg-danger-bg p-3 text-danger-fg"
            >
              {notice}
            </p>
          )}
          {errors.keys && (
            <p role="alert" className="text-danger-fg">
              {errors.keys}
            </p>
          )}
          {!results && <p>{query ? admin.noMatches : copy.noPermissions}</p>}
          {areas().map((area) => {
            const group = permissions.filter(
              (permission) => permission.area === area,
            );
            const matchesSearch = group.filter(matches);
            if (!matchesSearch.length) return null;
            return (
              <section
                key={area}
                aria-label={area}
                className="grid gap-2 rounded-panel border border-seam bg-paper p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-subtitle">{area}</h2>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      select(group.map((permission) => permission.key))
                    }
                  >
                    {copy.selectAll}
                  </Button>
                </div>
                {matchesSearch.map((permission) => {
                  const reasons =
                    automatic.includes(permission.key) &&
                    dependencyLabels(permission.key);
                  return (
                    <div key={permission.key}>
                      <ToggleRow
                        label={permission.label}
                        description={permission.consequence}
                        checked={draft.keys.includes(permission.key)}
                        onChange={(checked) => toggle(permission.key, checked)}
                      />
                      {reasons && (
                        <p className="px-3 pt-1 text-small text-concrete">
                          {copy.auto(reasons)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </section>
            );
          })}
        </fieldset>
        <InlineError error={mutation.error} />
      </form>
      <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-2 rounded-panel border border-seam bg-paper p-3 sm:static">
        <Button
          type="submit"
          form={formId}
          loading={mutation.isPending}
          disabled={created}
        >
          {admin.saveChanges}
        </Button>
        <span role="status">{copy.count(formatNumber(draft.keys.length))}</span>
      </div>
      {copyOpen && (
        <CopyRole
          currentId={role?.id}
          onClose={() => setCopyOpen(false)}
          onCopy={(keys) => {
            select(keys, true);
            setCopyOpen(false);
          }}
        />
      )}
    </section>
  );
}
