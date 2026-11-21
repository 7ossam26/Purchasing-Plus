import { formatNumber } from '@purchasing-plus/shared';
import { catalogImages as copy } from '@purchasing-plus/shared/i18n/ar';
import {
  ChevronLeft,
  ChevronRight,
  Maximize,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useRef, useState, type PointerEvent } from 'react';

import { Button } from '../../components/ui/button.js';
import { Modal } from '../../components/ui/modal.js';
import type { CatalogImage } from '../../lib/api/catalog.js';

function Controls({
  count,
  index,
  onChange,
}: {
  count: number;
  index: number;
  onChange: (index: number) => void;
}) {
  if (count < 2) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-1">
      {index > 0 && (
        <Button
          variant="ghost"
          iconOnly
          aria-label={copy.previous}
          onClick={() => onChange(index - 1)}
        >
          <ChevronLeft className="rtl-mirror" size={20} />
        </Button>
      )}
      <bdi dir="ltr" className="numeric whitespace-nowrap px-2 text-small">
        {formatNumber(index + 1)} / {formatNumber(count)}
      </bdi>
      <div className="flex flex-wrap justify-center">
        {Array.from({ length: count }, (_, i) => (
          <button
            type="button"
            key={i}
            aria-label={copy.label + ' ' + formatNumber(i + 1)}
            aria-current={i === index ? 'true' : undefined}
            onClick={() => onChange(i)}
            className="grid size-11 place-items-center rounded-full hover:bg-plaster"
          >
            <span
              className={`size-2 rounded-full ${i === index ? 'bg-ppr' : 'border border-concrete'}`}
            />
          </button>
        ))}
      </div>
      {index < count - 1 && (
        <Button
          variant="ghost"
          iconOnly
          aria-label={copy.next}
          onClick={() => onChange(index + 1)}
        >
          <ChevronRight className="rtl-mirror" size={20} />
        </Button>
      )}
    </div>
  );
}
export function Carousel({
  images,
  name,
  large = false,
  compact = false,
}: {
  images: CatalogImage[];
  name: string;
  large?: boolean;
  compact?: boolean;
}) {
  const [active, setActive] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const index = Math.min(active, Math.max(0, images.length - 1));
  function go(next: number) {
    const container = viewport.current;
    const child = container?.children[next];
    if (!child || !container) return;
    container.scrollLeft +=
      child.getBoundingClientRect().right -
      container.getBoundingClientRect().right;
    setActive(next);
  }
  function read() {
    const container = viewport.current;
    if (!container) return;
    const edge = container.getBoundingClientRect().right;
    let closest = 0,
      distance = Infinity;
    for (const [position, slide] of Array.from(container.children).entries()) {
      const gap = Math.abs(edge - slide.getBoundingClientRect().right);
      if (gap < distance) {
        distance = gap;
        closest = position;
      }
    }
    setActive(closest);
  }
  if (!images.length) return null;
  return (
    <section
      aria-label={copy.title}
      className="min-w-0"
      onKeyDown={(event) => {
        if (
          event.defaultPrevented ||
          (event.target instanceof HTMLElement &&
            event.target.closest('dialog') !==
              event.currentTarget.closest('dialog'))
        )
          return;
        const next =
          event.key === 'ArrowLeft'
            ? index + 1
            : event.key === 'ArrowRight'
              ? index - 1
              : null;
        if (next !== null) {
          event.preventDefault();
          go(next);
        }
      }}
    >
      <div
        ref={viewport}
        dir="rtl"
        onScroll={read}
        className="chip-strip flex snap-x snap-mandatory overflow-x-auto rounded-panel bg-plaster"
      >
        {images.map((image, i) => (
          <div
            key={image.id}
            className="relative min-w-full flex-none snap-start"
          >
            <button
              type="button"
              aria-label={copy.open + ' ' + formatNumber(i + 1)}
              tabIndex={i === index ? 0 : -1}
              onClick={() => setViewer(i)}
              className={`grid w-full place-items-center focus-visible:-outline-offset-3 ${compact ? 'h-32 sm:h-48' : large ? 'h-[min(62dvh,56rem)]' : 'aspect-square'}`}
            >
              <img
                src={image.displayUrl}
                alt={name}
                loading="lazy"
                draggable={false}
                width={image.width}
                height={image.height}
                className="absolute inset-0 h-full w-full object-contain"
              />
              <span className="absolute end-2 bottom-2 rounded-control border border-seam bg-paper p-2">
                <Maximize size={20} aria-hidden="true" />
              </span>
            </button>
          </div>
        ))}
      </div>
      <Controls count={images.length} index={index} onChange={go} />
      {viewer !== null && (
        <Modal
          fullScreen
          open
          title={copy.fullscreen}
          onClose={() => setViewer(null)}
        >
          <div
            className="flex h-full min-h-0 flex-col gap-2"
            onKeyDown={(event) => {
              const next =
                event.key === 'ArrowLeft'
                  ? viewer + 1
                  : event.key === 'ArrowRight'
                    ? viewer - 1
                    : null;
              if (next !== null) {
                event.preventDefault();
                event.stopPropagation();
                if (images[next]) setViewer(next);
              }
            }}
          >
            {images[viewer] && (
              <ZoomImage
                key={images[viewer].id}
                image={images[viewer]}
                name={name}
                swipe={(step) => {
                  if (images[viewer + step]) setViewer(viewer + step);
                }}
              />
            )}
            <Controls
              count={images.length}
              index={viewer}
              onChange={setViewer}
            />
          </div>
        </Modal>
      )}
    </section>
  );
}

type Point = { x: number; y: number };
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
function ZoomImage({
  image,
  name,
  swipe,
}: {
  image: CatalogImage;
  name: string;
  swipe: (step: number) => void;
}) {
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const [unavailable, setUnavailable] = useState(false);
  const surface = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef({
    start: { x: 0, y: 0 },
    origin: { scale: 1, x: 0, y: 0 },
    pinch: 0,
    multi: false,
  });
  const lastTap = useRef<{ time: number; point: Point } | null>(null);

  function place(scale: number, x = 0, y = 0) {
    const box = surface.current;
    const maxX = ((scale - 1) * (box?.clientWidth ?? 0)) / 2,
      maxY = ((scale - 1) * (box?.clientHeight ?? 0)) / 2;
    setView({
      scale,
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    });
  }
  function buttonZoom() {
    place(view.scale > 1 ? 1 : 2);
  }
  function down(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);
    if (pointers.current.size === 1)
      gesture.current = { start: point, origin: view, pinch: 0, multi: false };
    else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        start: point,
        origin: view,
        pinch: distance(a!, b!),
        multi: true,
      };
    }
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);
    const { start, origin, pinch, multi } = gesture.current;
    const [a, b] = [...pointers.current.values()];
    if (a && b && pinch > 0) {
      place(
        Math.max(1, Math.min(4, (origin.scale * distance(a, b)) / pinch)),
        origin.x,
        origin.y,
      );
    } else if (!multi && origin.scale > 1)
      place(
        origin.scale,
        origin.x + point.x - start.x,
        origin.y + point.y - start.y,
      );
  }
  function up(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.delete(event.pointerId) || gesture.current.multi)
      return;
    const { start, origin } = gesture.current;
    const point = { x: event.clientX, y: event.clientY };
    const dx = point.x - start.x;
    if (
      origin.scale === 1 &&
      Math.abs(dx) > 42 &&
      Math.abs(dx) > Math.abs(point.y - start.y)
    ) {
      swipe(dx > 0 ? 1 : -1);
      return;
    }
    if (distance(start, point) > 10) return;
    const tap = lastTap.current;
    if (tap && Date.now() - tap.time < 320 && distance(tap.point, point) < 30) {
      lastTap.current = null;
      buttonZoom();
    } else lastTap.current = { point, time: Date.now() };
  }
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-panel bg-plaster">
      <div
        ref={surface}
        className="relative grid min-h-0 flex-1 touch-none select-none place-items-center overflow-hidden"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={(event) => {
          pointers.current.delete(event.pointerId);
        }}
      >
        {unavailable ? (
          <p className="text-concrete">{copy.unavailable}</p>
        ) : (
          <img
            draggable={false}
            onError={() => setUnavailable(true)}
            src={image.displayUrl}
            alt={name}
            className="absolute inset-0 h-full w-full object-contain"
            style={{
              transform: `translate(${view.x}px,${view.y}px) scale(${view.scale})`,
            }}
          />
        )}
      </div>
      {!unavailable && (
        <Button
          className="absolute end-3 bottom-3"
          variant="secondary"
          iconOnly
          onClick={buttonZoom}
          aria-label={view.scale > 1 ? copy.zoomOut : copy.zoomIn}
        >
          {view.scale > 1 ? <ZoomOut size={20} /> : <ZoomIn size={20} />}
        </Button>
      )}
    </div>
  );
}
