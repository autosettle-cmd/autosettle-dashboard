'use client';

import InvoicesPageContent from '@/components/pages/InvoicesPageContent';
import { useFirm } from '@/contexts/FirmContext';

export default function AccountantInvoicesPage() {
  const { firms, firmId, firmsLoaded } = useFirm();

  return (
    <InvoicesPageContent
      config={{
        role: 'accountant',
        apiInvoices: '/api/invoices',
        apiSalesInvoices: '/api/sales-invoices',
        apiBatch: '/api/invoices/batch',
        apiDelete: '/api/invoices/delete',
        apiCategories: '/api/categories',
        apiSuppliers: '/api/suppliers',
        linkPrefix: '/accountant',
        showFirmColumn: true,
        showApproval: true,
        showGlFields: true,
        showLineItems: true,
        firmId: firmId || undefined,
        firmsLoaded,
        firms,
      }}
    />
  );
}
