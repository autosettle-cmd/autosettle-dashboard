'use client';

import BankReconDetailContent from '@/components/pages/BankReconDetailContent';
import { useFirm } from '@/contexts/FirmContext';

export default function AccountantBankReconDetailPage() {
  useFirm(); // keep hook active for sidebar context

  return (
    <BankReconDetailContent
      config={{
        role: 'accountant',
        apiStatements: '/api/bank-reconciliation/statements',
        apiOutstanding: '/api/bank-reconciliation/outstanding-items',
        apiMatch: '/api/bank-reconciliation/match',
        apiConfirm: '/api/bank-reconciliation/confirm',
        apiCreateVoucher: '/api/bank-reconciliation/create-voucher',
        apiCreateReceipt: '/api/bank-reconciliation/create-receipt',
        apiRematch: '/api/bank-reconciliation/rematch',
        apiUnmatch: '/api/bank-reconciliation/unmatch',
        apiSuppliers: '/api/suppliers',
        apiCategories: '/api/categories',
        apiInvoices: '/api/invoices',
        apiOutstandingItems: '/api/bank-reconciliation/outstanding-items',
        apiMatchItem: '/api/bank-reconciliation/match-item',
        apiUpdateTxn: '/api/bank-reconciliation/update-txn',
        linkPrefix: '/accountant',
        showAutoRematch: true,
        showAliasLearning: true,
        showDescriptionEdit: true,
        showClaimPreview: true,
        showGlPersistence: true,
        showRichPreview: true,
        showMultiInvoiceAllocations: true,
        useFirmScope: true,
      }}
    />
  );
}
