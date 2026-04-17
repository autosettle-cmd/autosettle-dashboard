'use client';

import SuppliersPageContent from '@/components/pages/SuppliersPageContent';

export default function AdminSuppliersPage() {
  return (
    <SuppliersPageContent
      config={{
        role: 'admin',
        apiSuppliers: '/api/admin/suppliers',
        apiAging: '/api/admin/invoices/aging',
        apiPayments: '/api/admin/payments',
        apiReceipts: '/api/admin/receipts',
        linkPrefix: '/admin',
        showFirmColumn: false,
        showGlMapping: false,
        firmsLoaded: true,
      }}
    />
  );
}
