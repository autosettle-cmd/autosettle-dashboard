'use client';

import Sidebar from '@/components/Sidebar';

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#F7F9FB]">
      <Sidebar role="employee" />
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
