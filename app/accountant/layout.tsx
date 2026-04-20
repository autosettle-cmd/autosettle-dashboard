'use client';

import Sidebar from '@/components/Sidebar';

export default function AccountantLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#F7F9FB]">
      <Sidebar role="accountant" />
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
