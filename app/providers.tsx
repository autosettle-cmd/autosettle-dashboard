'use client';

import { SessionProvider } from 'next-auth/react';
import { FirmProvider } from '@/contexts/FirmContext';
import { BatchProcessProvider } from '@/contexts/BatchProcessContext';
import { ToastProvider } from '@/contexts/ToastContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      <FirmProvider>
        <ToastProvider>
          <BatchProcessProvider>{children}</BatchProcessProvider>
        </ToastProvider>
      </FirmProvider>
    </SessionProvider>
  );
}
