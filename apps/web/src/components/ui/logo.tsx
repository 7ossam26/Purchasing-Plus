import { ar } from '@purchasing-plus/shared/i18n/ar';

import places from '../../../../../assets/brand/places-logo.svg?raw';

// The PLACES lockup in `currentColor`, so it follows ink in the light theme and soft white in the
// dark theme. Sizes keep the wordmark legible in the 64 px top bar with its own clear space.
const sizes = {
  bar: 'h-7 lg:h-8',
  sidebar: 'h-7',
  hero: 'h-9',
} as const;

export function Logo({
  size = 'bar',
  product = false,
}: {
  size?: keyof typeof sizes;
  /** Adds the product name after a divider (hidden on phones in the top bar). */
  product?: boolean | 'wide';
}) {
  return (
    <span
      dir="ltr"
      className="inline-flex items-center gap-3 whitespace-nowrap"
    >
      <span
        role="img"
        aria-label={ar.brandName}
        className={`block aspect-[2292/660] shrink-0 [&>svg]:block [&>svg]:size-full ${sizes[size]}`}
        dangerouslySetInnerHTML={{ __html: places }}
      />
      {product && (
        <span
          className={`border-s border-seam ps-3 text-small font-bold text-concrete ${product === 'wide' ? 'max-sm:hidden' : ''}`}
        >
          {ar.appName}
        </span>
      )}
    </span>
  );
}
