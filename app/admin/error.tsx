'use client';

import ErrorPage from '@/components/ErrorPage';

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPage error={error} reset={reset} dashboardHref="/admin/dashboard" />;
}
