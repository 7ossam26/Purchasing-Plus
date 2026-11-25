import type { ImageCrop } from '@purchasing-plus/shared';
import { ar, catalogImages as copy } from '@purchasing-plus/shared/i18n/ar';
import { useEffect, useId, useRef, useState } from 'react';

import { InlineError } from '../../components/shared/record-feedback.js';
import { Button } from '../../components/ui/button.js';
import { Modal } from '../../components/ui/modal.js';
import { catalogImagesApi } from '../../lib/api/catalog-images.js';
import type { CatalogImage } from '../../lib/api/catalog.js';
import { ApiError } from '../../lib/api/client.js';

import {
  centeredCrop,
  imageFramingStyle,
  positionCrop,
  resizeCrop,
  type ImageSize,
} from './image-framing.js';

type CropSource = { file: File } | { image: CatalogImage };

export function CropEditor({
  itemId,
  source,
  onAccept,
  onClose,
  onSkip,
}: {
  itemId: number;
  source: CropSource;
  onAccept: (
    crop: ImageCrop | null,
    progress: (percent: number) => void,
  ) => Promise<void>;
  onClose: () => void;
  onSkip?: () => void;
}) {
  const file = 'file' in source ? source.file : null;
  const image = 'image' in source ? source.image : null;
  const [url, setUrl] = useState(image?.displayUrl);
  const [dimensions, setDimensions] = useState<ImageSize>();
  const [selection, setSelection] = useState<ImageCrop | null>(
    image?.crop ?? null,
  );
  const [error, setError] = useState<ApiError | null>(null);
  const [progress, setProgress] = useState<number>();
  const sliderId = useId();
  const drag = useRef<{
    pointer: number;
    x: number;
    y: number;
    crop: ImageCrop;
    scale: number;
  }>(null);
  const busy = progress !== undefined;
  const crop = dimensions ? (selection ?? centeredCrop(dimensions)) : null;
  const maximum = dimensions
    ? Math.min(dimensions.width, dimensions.height)
    : 0;
  const minimum = Math.min(
    Math.ceil(maximum / 3),
    image?.crop?.size ?? maximum,
  );

  useEffect(() => {
    if (!file) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    void catalogImagesApi
      .preview(itemId, file, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(imageError(failure));
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file, itemId]);

  function move(current: ImageCrop, x: number, y: number) {
    if (dimensions)
      setSelection(
        positionCrop(dimensions, current.size, current.x + x, current.y + y),
      );
  }

  async function accept() {
    setError(null);
    setProgress(0);
    try {
      await onAccept(selection, setProgress);
    } catch (failure) {
      setError(imageError(failure));
      setProgress(undefined);
    }
  }

  return (
    <Modal
      open
      title={copy.cropTitle}
      description={copy.cropHint}
      onClose={onClose}
      dismissible={!busy}
    >
      <div className="grid gap-3">
        {file && (
          <bdi className="wrap-anywhere text-small text-concrete">
            {file.name}
          </bdi>
        )}
        <InlineError error={error} />
        <div
          className="relative mx-auto aspect-square w-full max-w-72 touch-none overflow-hidden rounded-thumbnail border border-seam bg-plaster outline-offset-2 focus-visible:outline-ppr"
          dir="ltr"
          role="group"
          aria-label={copy.cropArea}
          tabIndex={crop && !busy ? 0 : -1}
          onPointerDown={(event) => {
            if (busy || !crop || !event.isPrimary || event.button !== 0) return;
            const width = event.currentTarget.getBoundingClientRect().width;
            if (!width) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = {
              pointer: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              crop,
              scale: crop.size / width,
            };
          }}
          onPointerMove={(event) => {
            const start = drag.current;
            if (!start || start.pointer !== event.pointerId || busy) return;
            move(
              start.crop,
              (start.x - event.clientX) * start.scale,
              (start.y - event.clientY) * start.scale,
            );
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
          onKeyDown={(event) => {
            if (!crop || busy) return;
            const step = Math.max(
              1,
              Math.round(crop.size / (event.shiftKey ? 10 : 40)),
            );
            switch (event.key) {
              case 'ArrowLeft':
                move(crop, step, 0);
                break;
              case 'ArrowRight':
                move(crop, -step, 0);
                break;
              case 'ArrowUp':
                move(crop, 0, step);
                break;
              case 'ArrowDown':
                move(crop, 0, -step);
                break;
              default:
                return;
            }
            event.preventDefault();
          }}
        >
          {url && (
            <img
              src={url}
              alt=""
              draggable={false}
              className="pointer-events-none absolute max-w-none select-none"
              hidden={!crop}
              style={
                dimensions && crop
                  ? imageFramingStyle(dimensions, crop)
                  : undefined
              }
              onLoad={(event) => {
                const { naturalWidth: width, naturalHeight: height } =
                  event.currentTarget;
                if (width && height) setDimensions({ width, height });
              }}
              onError={() =>
                setError(new ApiError(0, 'IMAGE_PREVIEW', copy.unavailable))
              }
            />
          )}
          {!crop && !error && (
            <span
              role="status"
              dir="rtl"
              className="grid h-full place-items-center text-small text-concrete"
            >
              {copy.cropPreviewLoading}
            </span>
          )}
        </div>
        {dimensions && crop && (
          <div className="grid gap-1">
            <label htmlFor={sliderId} className="text-small font-semibold">
              {copy.cropZoom}
            </label>
            <input
              id={sliderId}
              className="min-h-11 w-full accent-ppr"
              type="range"
              min={0}
              max={maximum - minimum}
              value={maximum - crop.size}
              disabled={busy || maximum === minimum}
              onChange={(event) => {
                // This dialog saves independently of the surrounding item form.
                event.stopPropagation();
                setSelection(
                  resizeCrop(
                    dimensions,
                    crop,
                    maximum - Number(event.target.value),
                  ),
                );
              }}
            />
            <Button
              variant="secondary"
              className="justify-self-start"
              disabled={busy || !selection}
              onClick={() => setSelection(null)}
            >
              {copy.cropReset}
            </Button>
          </div>
        )}
        {file && busy && (
          <progress
            className="w-full accent-ppr"
            aria-label={copy.processing}
            max={100}
            value={progress}
          />
        )}
        <div className="flex flex-wrap gap-2">
          <Button disabled={!crop} loading={busy} onClick={() => void accept()}>
            {file ? copy.cropUpload : copy.cropSave}
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={onSkip ?? onClose}
          >
            {file ? copy.cropSkip : ar.common.cancel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function imageError(error: unknown) {
  return error instanceof ApiError
    ? error
    : new ApiError(0, 'IMAGE_ERROR', ar.common.fallbackError);
}
