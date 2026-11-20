import type { ReactNode } from 'react';
import { Outlet } from 'react-router';

export function BareShell({ children }: { children?: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center p-4 sm:p-8">
      <div className="w-full max-w-[28rem] rounded-panel border border-seam bg-paper p-6 sm:p-8">
        {children ?? <Outlet />}
      </div>
    </main>
  );
}
