import { requestUi as copy } from '@purchasing-plus/shared/i18n/ar';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { useCan } from '../../app/session.js';
import {
  InlineError,
  LoadRecord,
} from '../../components/shared/record-feedback.js';
import { Button } from '../../components/ui/button.js';
import { ChipSelect } from '../../components/ui/choice.js';
import { Modal } from '../../components/ui/modal.js';
import { EmptyState } from '../../components/ui/states.js';
import { requestApi, type RequestOptions } from '../../lib/api/requests.js';
import { CategoryIcon } from '../catalog/presentation.js';

import {
  pickerHref,
  reviewHref,
  useOptions,
  useRequestUpdates,
} from './workspace.js';

function NewDraft({
  options,
  onClose,
}: {
  options: RequestOptions;
  onClose: () => void;
}) {
  const sites = options.sites.filter((site) => site.isActive);
  const categories = options.categories.filter((category) => category.isActive);
  const [selection, setSelection] = useState('');
  const siteId = sites.length === 1 ? sites[0]!.id : Number(selection);
  const navigate = useNavigate();
  const canBrowse = useCan('catalog.view');
  const updates = useRequestUpdates(0);
  const create = useMutation({
    mutationFn: (categoryId: number) =>
      requestApi.create({ siteId, categoryId }),
    onSuccess: (request) => {
      updates.update(request);
      onClose();
      void navigate(
        canBrowse
          ? pickerHref(request.id, request.categoryId)
          : reviewHref(request.id),
      );
    },
  });
  if (!sites.length) return <EmptyState title={copy.noSites} />;
  return (
    <div className="grid gap-4">
      {sites.length > 1 && (
        <div>
          <h3 className="text-subtitle">{copy.chooseSite}</h3>
          <ChipSelect
            label={copy.site}
            value={selection ? [selection] : []}
            options={sites.map((site) => ({
              value: String(site.id),
              label: site.name,
            }))}
            onChange={(values) => setSelection(values.at(-1) ?? '')}
          />
        </div>
      )}
      <div className="grid gap-2">
        <h3 className="text-subtitle">{copy.chooseCategory}</h3>
        {!categories.length ? (
          <EmptyState title={copy.noCategories} />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {categories.map((category) => (
              <Button
                key={category.id}
                variant="secondary"
                disabled={!siteId || create.isPending}
                className="min-h-20 flex-col whitespace-normal text-center"
                onClick={() => create.mutate(category.id)}
              >
                <CategoryIcon name={category.iconKey} />
                <bdi>{category.name}</bdi>
              </Button>
            ))}
          </div>
        )}
        {!siteId && (
          <p className="text-small text-concrete">{copy.chooseSite}</p>
        )}
        {create.isPending && (
          <p role="status" className="text-small text-concrete">
            {copy.saving}
          </p>
        )}
        <InlineError error={create.error} />
      </div>
    </div>
  );
}

export function NewRequestDialog({ onClose }: { onClose: () => void }) {
  const options = useOptions();
  return (
    <Modal open title={copy.newRequest} onClose={onClose}>
      <LoadRecord query={options}>
        {(data) => <NewDraft options={data} onClose={onClose} />}
      </LoadRecord>
    </Modal>
  );
}
