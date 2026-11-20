import { formatNumber } from '@purchasing-plus/shared';
import { ar } from '@purchasing-plus/shared/i18n/ar';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '../ui/button.js';
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav
      aria-label={ar.common.pagination}
      className="flex flex-wrap items-center justify-between gap-2"
    >
      {page > 1 ? (
        <Button variant="secondary" onClick={() => onPageChange(page - 1)}>
          <ChevronLeft
            size={20}
            strokeWidth={1.75}
            className="rtl-mirror"
            aria-hidden="true"
          />
          {ar.common.previous}
        </Button>
      ) : (
        <span />
      )}
      <bdi dir="ltr" className="numeric text-small text-concrete">
        {formatNumber(page)} / {formatNumber(pages)}
      </bdi>
      {page < pages ? (
        <Button variant="secondary" onClick={() => onPageChange(page + 1)}>
          {ar.common.next}
          <ChevronRight
            size={20}
            strokeWidth={1.75}
            className="rtl-mirror"
            aria-hidden="true"
          />
        </Button>
      ) : (
        <span />
      )}
    </nav>
  );
}
