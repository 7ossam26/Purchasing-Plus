import { createSite } from '@purchasing-plus/shared';
import { admin, ar } from '@purchasing-plus/shared/i18n/ar';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';

import { useCan, useSession } from '../../app/session.js';
import {
  InlineError,
  LoadRecord,
} from '../../components/shared/record-feedback.js';
import { Button } from '../../components/ui/button.js';
import { Field, Input, Textarea } from '../../components/ui/field.js';
import { Modal } from '../../components/ui/modal.js';
import { toast } from '../../components/ui/toast.js';
import {
  invalidateSiteQueries,
  siteApi,
  type Site,
  type SiteSave,
} from '../../lib/api/sites.js';

import { SiteEngineers, type EngineerChoice } from './site-engineers.js';

const copy = admin.siteManager;

export function SiteDialog({
  site,
  onClose,
}: {
  site?: Site;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const { profile } = useSession();
  const manageUsers = useCan('users.manage');
  // A new site is inside the viewer's scope only when the viewer covers every site.
  const canAssign =
    manageUsers &&
    (site !== undefined ||
      Boolean(profile?.isSuperadmin) ||
      profile?.siteScope === 'ALL');
  const current = useQuery({
    queryKey: ['sites', 'engineers', site?.id],
    enabled: canAssign && site !== undefined,
    queryFn: ({ signal }) => siteApi.engineers(site!.id, signal),
  });
  const [added, setAdded] = useState<EngineerChoice[]>([]);
  const [removed, setRemoved] = useState<number[]>([]);
  const assigned = current.data?.items ?? [];
  const selected: EngineerChoice[] = [
    ...assigned
      .filter(({ id }) => !removed.includes(id))
      .map((engineer) => ({ ...engineer, canRemove: engineer.canManage })),
    ...added,
  ];
  function toggle(choice: EngineerChoice) {
    if (added.some(({ id }) => id === choice.id))
      setAdded(added.filter(({ id }) => id !== choice.id));
    else if (removed.includes(choice.id))
      setRemoved(removed.filter((id) => id !== choice.id));
    else if (assigned.some(({ id }) => id === choice.id))
      setRemoved([...removed, choice.id]);
    else setAdded([...added, choice]);
  }
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [another, setAnother] = useState(false);
  const mutation = useMutation({
    mutationFn: (body: SiteSave) => siteApi.save(body, site?.id),
  });
  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    const element = event.currentTarget;
    const form = new FormData(element);
    const result = createSite.safeParse({
      name: form.get('name'),
      address: form.get('address'),
    });
    if (!result.success) {
      mutation.reset();
      setErrors(
        Object.fromEntries(
          result.error.issues.map((issue) => [
            String(issue.path[0]),
            issue.path[0] === 'address' ? copy.invalidAddress : admin.validName,
          ]),
        ),
      );
      return;
    }
    setErrors({});
    const addAnother =
      (event.nativeEvent.submitter as HTMLButtonElement | null)?.value ===
      'another';
    setAnother(addAnother);
    const addIds = added.map(({ id }) => id);
    const engineers: Partial<SiteSave> = site
      ? addIds.length || removed.length
        ? { engineers: { add: addIds, remove: removed } }
        : {}
      : addIds.length
        ? { engineerIds: addIds }
        : {};
    try {
      await mutation.mutateAsync({ ...result.data, ...engineers });
      toast.success(copy.saved);
      void invalidateSiteQueries(client);
      if (addAnother) {
        element.reset();
        setAdded([]);
        setRemoved([]);
        element.querySelector<HTMLInputElement>('[name="name"]')?.focus();
      } else {
        onClose();
      }
    } catch {
      // The mutation error and recovery hint stay in the form.
    }
  }
  const engineers = (
    <SiteEngineers
      siteId={site?.id}
      selected={selected}
      allowAdd={site?.isActive ?? true}
      onToggle={toggle}
    />
  );
  return (
    <Modal
      open
      title={site ? copy.edit : copy.add}
      dismissible={!mutation.isPending}
      onClose={onClose}
    >
      <form
        noValidate
        onSubmit={(event) => void save(event)}
        className="grid gap-4"
      >
        <Field label={admin.name} error={errors.name} required>
          {(props) => (
            <Input
              {...props}
              name="name"
              defaultValue={site?.name}
              data-initial-focus
            />
          )}
        </Field>
        <Field label={copy.address} error={errors.address}>
          {(props) => (
            <Textarea {...props} name="address" defaultValue={site?.address} />
          )}
        </Field>
        {canAssign &&
          (site ? (
            <LoadRecord query={current}>{() => engineers}</LoadRecord>
          ) : (
            engineers
          ))}
        <InlineError error={mutation.error} />
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            value="save"
            disabled={mutation.isPending}
            loading={mutation.isPending && !another}
          >
            {site ? admin.saveChanges : ar.common.save}
          </Button>
          {!site && (
            <Button
              type="submit"
              value="another"
              variant="secondary"
              disabled={mutation.isPending}
              loading={mutation.isPending && another}
            >
              {admin.saveAnother}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
