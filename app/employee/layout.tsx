'use client';

import RoleLayout from '@/components/RoleLayout';

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  return <RoleLayout role="employee">{children}</RoleLayout>;
}
