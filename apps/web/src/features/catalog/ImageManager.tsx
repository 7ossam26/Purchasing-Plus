import { ar, catalogImages as copy } from '@purchasing-plus/shared/i18n/ar';
import { useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronUp,
  Crop,
  GripVertical,
  Trash2,
  Upload,
} from 'lucide-react';
import { useRef, useState } from 'react';

import { InlineError } from '../../components/shared/record-feedback.js';
import { Button, buttonClass } from '../../components/ui/button.js';
import { useConfirm } from '../../components/ui/dialogs.js';
import { toast } from '../../components/ui/toast.js';
import { catalogImagesApi } from '../../lib/api/catalog-images.js';
import type { CatalogImage, CatalogItem } from '../../lib/api/catalog.js';
import { ApiError } from '../../lib/api/client.js';

import { CropEditor } from './CropEditor.js';

export function ImageManager({
  item,
  onBusy,
  disabled = false,
}: {
  item: CatalogItem;
  onBusy: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const client = useQueryClient();
  const confirm = useConfirm();
  const [working, setBusy] = useState(false);
  const busy = working || disabled;
  const [queue, setQueue] = useState<{ files: File[]; index: number }>();
  const [editingId, setEditingId] = useState<number>();
  const [error, setError] = useState<ApiError | null>(null);
  const dragging = useRef<number | null>(null);
  const images = item.images ?? [];
  const editingImage = images.find((image) => image.id === editingId);
  const pendingFile = queue?.files[queue.index];
  function apply(next: CatalogImage[]) {
    client.setQueryData<CatalogItem>(
      ['master-data', 'item', item.id],
      (previous) => ({ ...(previous ?? item), images: next }),
    );
  }
  async function perform(operation: () => Promise<void>) {
    setError(null);
    setBusy(true);
    onBusy(true);
    let shouldRefresh = true;
    try {
      await operation();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'IMAGE_CLEANUP')
        shouldRefresh = false;
      throw error;
    } finally {
      setBusy(false);
      onBusy(false);
      if (shouldRefresh)
        void client.invalidateQueries({
          queryKey: ['master-data'],
          refetchType: 'active',
        });
    }
  }
  async function run(operation: () => Promise<void>) {
    try {
      await perform(operation);
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? failure
          : new ApiError(0, 'IMAGE_ERROR', ar.common.fallbackError),
      );
    }
  }
  function selectFiles(files: File[]) {
    setError(null);
    if (images.length >= 10) toast.error(copy.tooMany);
    else setQueue({ files, index: 0 });
  }
  function nextFile() {
    setQueue((current) =>
      current && current.index + 1 < current.files.length
        ? { ...current, index: current.index + 1 }
        : undefined,
    );
  }
  function move(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || to >= images.length) return;
    const ids = images.map((image) => image.id);
    ids.splice(to, 0, ids.splice(from, 1)[0]!);
    void run(async () => {
      apply(await catalogImagesApi.order(item.id, ids));
      toast.success(copy.saved);
    });
  }
  async function remove(image: CatalogImage) {
    if (
      !(await confirm({
        title: copy.confirmDelete,
        confirmLabel: copy.delete,
        tone: 'danger',
      }))
    )
      return;
    void run(async () => {
      apply(await catalogImagesApi.remove(item.id, image.id));
      toast.success(copy.deleted);
    });
  }
  return (
    <section
      className="mt-6 grid gap-3 border-t border-seam pt-4"
      aria-label={copy.title}
    >
      <InlineError error={error} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-section">{copy.title}</h2>
          <p className="text-small text-concrete">
            {copy.limits} {copy.autoSave}
          </p>
        </div>
        <label
          className={
            buttonClass('secondary') +
            ' relative focus-within:outline-2 focus-within:outline-ppr ' +
            (busy ? 'opacity-55' : 'cursor-pointer')
          }
        >
          <Upload size={20} aria-hidden="true" />
          {copy.add}
          <input
            aria-label={copy.add}
            type="file"
            className="absolute inset-0 w-full cursor-pointer opacity-0"
            multiple
            disabled={busy}
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = '';
              if (files.length) selectFiles(files);
            }}
          />
        </label>
      </div>
      {!images.length && (
        <p className="text-small text-concrete">{copy.empty}</p>
      )}
      <ul className="divide-y divide-seam">
        {images.map((image, index) => (
          <li
            key={image.id}
            className="flex flex-wrap items-center justify-between gap-2 py-2"
            onDragOver={(event) => {
              if (!busy && dragging.current !== null) event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              const from = dragging.current;
              dragging.current = null;
              if (!busy && from !== null) move(from, index);
            }}
          >
            <div className="flex items-center gap-2">
              <span
                draggable={!busy}
                onDragStart={(event) => {
                  dragging.current = index;
                  event.dataTransfer.setData('text/plain', String(image.id));
                  event.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => {
                  dragging.current = null;
                }}
                title={copy.drag}
                className="hidden cursor-grab md:inline-flex"
              >
                <GripVertical size={20} aria-hidden="true" />
              </span>
              <img
                className="size-14 rounded-thumbnail border border-seam object-cover"
                src={image.thumbUrl}
                alt=""
                loading="lazy"
              />
              {image.isCover && (
                <span className="rounded-full bg-ppr-wash px-2 text-micro text-ppr-deep">
                  {copy.cover}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <Button
                variant="ghost"
                iconOnly
                disabled={busy}
                aria-label={copy.editCrop}
                title={copy.editCrop}
                onClick={() => setEditingId(image.id)}
              >
                <Crop size={20} aria-hidden="true" />
              </Button>
              {!image.isCover && (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      apply(await catalogImagesApi.cover(item.id, image.id));
                      toast.success(copy.saved);
                    })
                  }
                >
                  {copy.setCover}
                </Button>
              )}
              {index > 0 && (
                <Button
                  aria-label={copy.earlier}
                  variant="ghost"
                  iconOnly
                  disabled={busy}
                  onClick={() => move(index, index - 1)}
                >
                  <ChevronUp size={20} aria-hidden="true" />
                </Button>
              )}
              {index < images.length - 1 && (
                <Button
                  aria-label={copy.later}
                  variant="ghost"
                  iconOnly
                  disabled={busy}
                  onClick={() => move(index, index + 1)}
                >
                  <ChevronDown size={20} aria-hidden="true" />
                </Button>
              )}
              <Button
                aria-label={copy.delete}
                variant="ghost"
                iconOnly
                disabled={busy}
                onClick={() => void remove(image)}
              >
                <Trash2 size={20} aria-hidden="true" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {pendingFile && (
        <CropEditor
          key={queue?.index}
          itemId={item.id}
          source={{ file: pendingFile }}
          onClose={() => setQueue(undefined)}
          onSkip={nextFile}
          onAccept={async (crop, progress) => {
            let count = images.length;
            await perform(async () => {
              const next = await catalogImagesApi.upload(
                item.id,
                pendingFile,
                crop,
                progress,
              );
              apply(next);
              count = next.length;
            });
            toast.success(copy.uploaded);
            if (count < 10) nextFile();
            else {
              if (queue && queue.index + 1 < queue.files.length)
                toast.error(copy.tooMany);
              setQueue(undefined);
            }
          }}
        />
      )}
      {editingImage && (
        <CropEditor
          key={`image-${editingImage.id}`}
          itemId={item.id}
          source={{ image: editingImage }}
          onClose={() => setEditingId(undefined)}
          onAccept={async (crop) => {
            await perform(async () => {
              apply(
                await catalogImagesApi.crop(item.id, editingImage.id, crop),
              );
            });
            toast.success(copy.saved);
            setEditingId(undefined);
          }}
        />
      )}
    </section>
  );
}
