'use client';

import { SessionProvider } from 'next-auth/react';
import { FirmProvider } from '@/contexts/FirmContext';
import { BatchProcessProvider } from '@/contexts/BatchProcessContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      <FirmProvider>
        <BatchProcessProvider>{children}</BatchProcessProvider>
      </FirmProvider>
    </SessionProvider>
  );
}
