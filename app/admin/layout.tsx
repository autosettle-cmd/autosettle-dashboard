'use client';

import RoleLayout from '@/components/RoleLayout';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <RoleLayout role="admin">{children}</RoleLayout>;
}
