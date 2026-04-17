'use client';

import SuppliersPageContent from '@/components/pages/SuppliersPageContent';
import { useFirm } from '@/contexts/FirmContext';

export default function AccountantSuppliersPage() {
  const { firmId, firmsLoaded } = useFirm();

  return (
    <SuppliersPageContent
      config={{
        role: 'accountant',
        apiSuppliers: '/api/suppliers',
        apiAging: '/api/invoices/aging',
        apiPayments: '/api/payments',
        apiReceipts: '/api/receipts',
        linkPrefix: '/accountant',
        showFirmColumn: true,
        showGlMapping: true,
        firmId: firmId || undefined,
        firmsLoaded,
      }}
    />
  );
}
