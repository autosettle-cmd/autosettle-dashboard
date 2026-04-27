'use client';

import RoleLayout from '@/components/RoleLayout';

export default function AccountantLayout({ children }: { children: React.ReactNode }) {
  return <RoleLayout role="accountant">{children}</RoleLayout>;
}
