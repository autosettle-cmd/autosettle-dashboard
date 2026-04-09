'use client';

import { SessionProvider } from 'next-auth/react';
import { FirmProvider } from '@/contexts/FirmContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      <FirmProvider>{children}</FirmProvider>
    </SessionProvider>
  );
}
