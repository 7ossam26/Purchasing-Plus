import {
  renderMessageTemplate,
  settingsSchema,
  templateKeys,
  type Settings,
} from '@purchasing-plus/shared';
import { admin } from '@purchasing-plus/shared/i18n/ar';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock3, MessageSquare } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';

import {
  InlineError,
  LoadRecord,
} from '../../components/shared/record-feedback.js';
import { Button } from '../../components/ui/button.js';
import { Field, NumberInput, Textarea } from '../../components/ui/field.js';
import { toast } from '../../components/ui/toast.js';
import { settingsApi } from '../../lib/api/settings.js';

const copy = admin.settings;
const templateFields = ['rfqIntro', 'supplyOrderIntro'] as const;

export function SettingsPage() {
  const query = useQuery({
    queryKey: ['settings'],
    queryFn: ({ signal }) => settingsApi.get(signal),
  });
  return (
    <section className="mx-auto grid max-w-[900px] gap-4">
      <h1 className="text-title">{copy.title}</h1>
      <LoadRecord query={query}>
        {(data) => <SettingsForm settings={data} />}
      </LoadRecord>
    </section>
  );
}

function SettingsForm({ settings }: { settings: Settings }) {
  const client = useQueryClient();
  const [draft, setDraft] = useState(settings);
  const [days, setDays] = useState(String(settings.agingDays));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mutation = useMutation({
    mutationFn: settingsApi.save,
    onSuccess: (saved) => {
      client.setQueryData(['settings'], saved);
      setDraft(saved);
      setDays(String(saved.agingDays));
      toast.success(copy.saved);
    },
  });

  function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    const result = settingsSchema.safeParse({
      ...draft,
      agingDays: Number(days),
    });
    if (!result.success) {
      mutation.reset();
      setErrors(
        Object.fromEntries(
          result.error.issues.map((issue) => {
            const key = String(issue.path[0]);
            return [
              key,
              key === 'agingDays' ? copy.invalidDays : copy.invalidTemplate,
            ];
          }),
        ),
      );
      return;
    }
    setErrors({});
    mutation.mutate(result.data);
  }

  return (
    <form noValidate onSubmit={save} className="grid gap-4">
      <fieldset
        disabled={mutation.isPending}
        className="grid min-w-0 gap-4 rounded-panel border border-seam bg-paper p-4"
      >
        <h2 className="flex items-center gap-2 text-subtitle">
          <MessageSquare size={20} aria-hidden="true" />
          {copy.templates}
        </h2>
        <div className="rounded-control bg-plaster p-3">
          <h3 className="font-semibold">{copy.placeholders}</h3>
          <dl className="mt-1 grid grid-cols-1 gap-2 text-small sm:grid-cols-2">
            {templateKeys.map((key) => (
              <div key={key} className="flex flex-wrap items-baseline gap-2">
                <dt>
                  <bdi dir="ltr">{'{' + key + '}'}</bdi>
                </dt>
                <dd>{copy.labels[key]}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {templateFields.map((field) => (
            <div className="grid content-start gap-2" key={field}>
              <Field label={copy[field]} error={errors[field]}>
                {(props) => (
                  <Textarea
                    {...props}
                    rows={4}
                    value={draft[field]}
                    onChange={(event) =>
                      setDraft({ ...draft, [field]: event.currentTarget.value })
                    }
                  />
                )}
              </Field>
              <div className="rounded-control border border-seam p-3">
                <p className="text-small font-semibold">{copy.preview}</p>
                <output
                  aria-label={copy[field] + ' — ' + copy.preview}
                  className="block whitespace-pre-wrap break-words"
                >
                  {renderMessageTemplate(draft[field], copy.sample)}
                </output>
              </div>
            </div>
          ))}
        </div>
      </fieldset>
      <fieldset
        disabled={mutation.isPending}
        className="grid min-w-0 gap-3 rounded-panel border border-seam bg-paper p-4"
      >
        <h2 className="flex items-center gap-2 text-subtitle">
          <Clock3 size={20} aria-hidden="true" />
          {copy.operations}
        </h2>
        <div className="max-w-sm">
          <Field
            label={copy.agingDays}
            hint={copy.agingHint}
            error={errors.agingDays}
            required
          >
            {(props) => (
              <NumberInput {...props} value={days} onValueChange={setDays} />
            )}
          </Field>
        </div>
      </fieldset>
      <InlineError error={mutation.error} />
      <div className="sticky bottom-0 z-20 rounded-panel border border-seam bg-paper p-3 sm:static">
        <Button type="submit" loading={mutation.isPending}>
          {admin.saveChanges}
        </Button>
      </div>
    </form>
  );
}
