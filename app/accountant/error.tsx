'use client';

import ErrorPage from '@/components/ErrorPage';

export default function AccountantError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPage error={error} reset={reset} dashboardHref="/accountant/dashboard" />;
}
