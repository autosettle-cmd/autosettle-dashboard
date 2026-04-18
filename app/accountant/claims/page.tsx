'use client';

import ClaimsPageContent from '@/components/pages/ClaimsPageContent';
import { useFirm } from '@/contexts/FirmContext';

export default function AccountantClaimsPage() {
  const { firms, firmId, firmsLoaded } = useFirm();

  return (
    <ClaimsPageContent
      config={{
        role: 'accountant',
        apiClaims: '/api/claims',
        apiBatch: '/api/claims/batch',
        apiDelete: '/api/claims/delete',
        apiCategories: '/api/categories',
        apiEmployees: '/api/employees',
        apiInvoices: '/api/invoices',
        linkPrefix: '/accountant',
        showFirmColumn: true,
        showStatusFilter: false,
        showGlFields: true,
        firmId: firmId || undefined,
        firmsLoaded,
        firms,
      }}
    />
  );
}
