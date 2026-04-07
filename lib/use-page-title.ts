import { useEffect } from 'react';
import { brand } from '@/config/branding';

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} — ${brand.name}`;
    return () => { document.title = brand.name; };
  }, [title]);
}
