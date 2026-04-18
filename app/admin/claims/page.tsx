'use client';

import ClaimsPageContent from '@/components/pages/ClaimsPageContent';

export default function AdminClaimsPage() {
  return (
    <ClaimsPageContent
      config={{
        role: 'admin',
        apiClaims: '/api/admin/claims',
        apiBatch: '/api/admin/claims/batch',
        apiDelete: '/api/admin/claims/delete',
        apiCategories: '/api/admin/categories',
        apiEmployees: '/api/admin/employees',
        apiInvoices: '/api/admin/invoices',
        linkPrefix: '/admin',
        showFirmColumn: false,
        showStatusFilter: true,
        showGlFields: false,
        firmsLoaded: true,
      }}
    />
  );
}
