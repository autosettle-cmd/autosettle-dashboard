'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminReceiptsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/claims?type=receipt');
  }, [router]);
  return null;
}
