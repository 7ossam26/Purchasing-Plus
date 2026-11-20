import { catalogImages as copy } from '@purchasing-plus/shared/i18n/ar';
import { useState } from 'react';

import { Button } from '../../components/ui/button.js';
import { Modal } from '../../components/ui/modal.js';
import type { CatalogItem } from '../../lib/api/catalog.js';

import { Carousel } from './Carousel.js';
import { attributeLabel, SamplePlaceholder } from './presentation.js';

export function ClientPresentation({ item }: { item: CatalogItem }) {
  const [open, setOpen] = useState(false);
  const attributes = item.attributeValues
    .filter(
      (value) =>
        value.attribute.clientVisible &&
        value.attribute.isActive &&
        value.option?.isActive !== false,
    )
    .map((value) => ({
      id: value.attributeId,
      label: value.attribute.name,
      text: attributeLabel(value),
    }));
  const images = item.images ?? [];
  return (
    <>
      <Button
        variant="secondary"
        className="w-fit"
        onClick={() => setOpen(true)}
      >
        {copy.client}
      </Button>
      <Modal
        open={open}
        fullScreen
        title={item.name}
        onClose={() => setOpen(false)}
      >
        <div className="mx-auto grid max-w-6xl gap-4">
          {images.length ? (
            <Carousel images={images} name={item.name} large />
          ) : (
            <div className="mx-auto w-full max-w-80">
              <SamplePlaceholder
                name={item.name}
                icon={item.categoryIcon}
                large
              />
            </div>
          )}
          {attributes.length > 0 && (
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {attributes.map((attribute) => (
                <div
                  key={attribute.id}
                  className="grid gap-1 rounded-control border border-seam p-3"
                >
                  <dt className="text-small text-concrete">
                    {attribute.label}
                  </dt>
                  <dd className="wrap-anywhere text-subtitle">
                    <bdi>{attribute.text}</bdi>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </Modal>
    </>
  );
}
