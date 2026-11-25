import { ar } from '@purchasing-plus/shared/i18n/ar';
import { Toaster, toast } from 'sonner';

import { useTheme } from '../../lib/theme.js';

export function Toast() {
  const { theme } = useTheme();
  return (
    <Toaster
      theme={theme}
      dir="rtl"
      position="top-center"
      duration={4000}
      closeButton
      visibleToasts={3}
      containerAriaLabel={ar.navigation.notifications}
      toastOptions={{
        closeButtonAriaLabel: ar.common.close,
        classNames: {
          toast: 'ui-toast',
          description: 'text-concrete',
        },
      }}
    />
  );
}
export function toastError(error: { message: string; fix?: string }) {
  toast.error(error.message, { description: error.fix, duration: 5500 });
}
export { toast };
