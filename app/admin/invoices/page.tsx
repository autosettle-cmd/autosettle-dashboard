'use client';

import InvoicesPageContent from '@/components/pages/InvoicesPageContent';

export default function AdminInvoicesPage() {
  return (
    <InvoicesPageContent
      config={{
        role: 'admin',
        apiInvoices: '/api/admin/invoices',
        apiSalesInvoices: '/api/admin/sales-invoices',
        apiBatch: '/api/admin/invoices/batch',
        apiDelete: '/api/invoices/delete',
        apiCategories: '/api/admin/categories',
        apiSuppliers: '/api/admin/suppliers',
        linkPrefix: '/admin',
        showFirmColumn: false,
        showApproval: false,
        showGlFields: false,
        showLineItems: false,
        firmsLoaded: true,
      }}
    />
  );
}
