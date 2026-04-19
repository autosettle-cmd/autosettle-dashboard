'use client';

import { SessionProvider } from 'next-auth/react';
import { FirmProvider } from '@/contexts/FirmContext';
import { BatchUploadProvider } from '@/contexts/BatchUploadContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      <FirmProvider>
        <BatchUploadProvider>{children}</BatchUploadProvider>
      </FirmProvider>
    </SessionProvider>
  );
}
