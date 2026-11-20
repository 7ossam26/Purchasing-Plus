import { admin } from '@purchasing-plus/shared/i18n/ar';

import { Chip } from '../../components/ui/chip.js';
import type { SiteScope } from '../../lib/api/roles.js';

export const scopeLabel = (scope: SiteScope) =>
  scope === 'ALL' ? admin.allSites : admin.assigned;

export function ActiveStatus({ active }: { active: boolean }) {
  return (
    <Chip tone={active ? 'success' : 'neutral'}>
      {active ? admin.active : admin.inactive}
    </Chip>
  );
}
