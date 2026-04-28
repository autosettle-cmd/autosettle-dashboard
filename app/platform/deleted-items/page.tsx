'use client';

import PlatformSidebar from '@/components/PlatformSidebar';
import DeletedItemsPage from '@/components/DeletedItemsPage';

export default function PlatformDeletedItems() {
  return (
    <div className="flex h-screen overflow-hidden bg-[var(--surface)]">
      <PlatformSidebar />
      <DeletedItemsPage showFirm />
    </div>
  );
}
