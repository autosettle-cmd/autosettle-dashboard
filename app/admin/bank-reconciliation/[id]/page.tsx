'use client';

import BankReconDetailContent from '@/components/pages/BankReconDetailContent';

export default function AdminBankReconDetailPage() {
  return (
    <BankReconDetailContent
      config={{
        role: 'admin',
        apiStatements: '/api/admin/bank-reconciliation/statements',
        apiOutstanding: '/api/admin/bank-reconciliation/unreconciled-payments',
        apiMatch: '/api/admin/bank-reconciliation/match',
        apiMatchLegacy: '/api/admin/bank-reconciliation/match',
        apiConfirm: '/api/admin/bank-reconciliation/confirm',
        apiCreateVoucher: '/api/admin/bank-reconciliation/create-voucher',
        apiCreateReceipt: '/api/admin/bank-reconciliation/create-receipt',
        apiRematch: '/api/admin/bank-reconciliation/rematch',
        apiUnmatch: '/api/admin/bank-reconciliation/unmatch',
        apiSuppliers: '/api/admin/suppliers',
        apiCategories: '/api/admin/categories',
        apiInvoices: '/api/admin/invoices',
        apiOutstandingItems: '/api/bank-reconciliation/outstanding-items',
        apiMatchItem: '/api/bank-reconciliation/match-item',
        linkPrefix: '/admin',
        showAutoRematch: false,
        showAliasLearning: false,
        showDescriptionEdit: false,
        showClaimPreview: false,
        showGlPersistence: false,
        showRichPreview: false,
        showMultiInvoiceAllocations: false,
        useFirmScope: false,
      }}
    />
  );
}
