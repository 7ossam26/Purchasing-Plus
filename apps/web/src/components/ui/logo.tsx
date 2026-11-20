import { ar } from '@purchasing-plus/shared/i18n/ar';

import mark from '../../../../../assets/brand/logo.svg?raw';

export function Logo() {
  return (
    <bdi
      dir="ltr"
      className="inline-flex items-center gap-2 whitespace-nowrap text-subtitle font-extrabold"
    >
      <span
        aria-hidden="true"
        className="inline-flex size-7 shrink-0 [&>svg]:size-full"
        dangerouslySetInnerHTML={{ __html: mark }}
      />
      {ar.appName}
    </bdi>
  );
}
