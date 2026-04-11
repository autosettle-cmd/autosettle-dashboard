'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AccountantReceiptsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/accountant/claims?type=receipt');
  }, [router]);
  return null;
}
