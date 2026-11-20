import { ar } from '@purchasing-plus/shared/i18n/ar';
import { useEffect } from 'react';
import { useBeforeUnload, useBlocker } from 'react-router';

import { useConfirm } from '../ui/dialogs.js';

export function useLeaveGuard(dirty: boolean) {
  const blocker = useBlocker(dirty);
  const confirm = useConfirm();
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    let active = true;
    void confirm({
      title: ar.dialogs.leave,
      description: ar.dialogs.leaveDetail,
      confirmLabel: ar.dialogs.leaveAction,
      tone: 'danger',
    }).then((ok) => {
      if (active) {
        if (ok) blocker.proceed();
        else blocker.reset();
      }
    });
    return () => {
      active = false;
    };
  }, [blocker, confirm]);
  useBeforeUnload((event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });
}
