import { createSite } from '@purchasing-plus/shared';
import { admin, ar } from '@purchasing-plus/shared/i18n/ar';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';

import { InlineError } from '../../components/shared/record-feedback.js';
import { Button } from '../../components/ui/button.js';
import { Field, Input, Textarea } from '../../components/ui/field.js';
import { Modal } from '../../components/ui/modal.js';
import { toast } from '../../components/ui/toast.js';
import {
  invalidateSiteQueries,
  siteApi,
  type Site,
} from '../../lib/api/sites.js';

const copy = admin.siteManager;

export function SiteDialog({
  site,
  onClose,
}: {
  site?: Site;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [another, setAnother] = useState(false);
  const mutation = useMutation({
    mutationFn: (body: ReturnType<typeof createSite.parse>) =>
      siteApi.save(body, site?.id),
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
    try {
      await mutation.mutateAsync(result.data);
      toast.success(copy.saved);
      void invalidateSiteQueries(client);
      if (addAnother) {
        element.reset();
        element.querySelector<HTMLInputElement>('[name="name"]')?.focus();
      } else {
        onClose();
      }
    } catch {
      // The mutation error and recovery hint stay in the form.
    }
  }
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
