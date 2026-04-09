'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useSession } from 'next-auth/react';

interface Firm {
  id: string;
  name: string;
}

interface FirmContextValue {
  firms: Firm[];
  firmId: string;
  setFirmId: (id: string) => void;
  firmsLoaded: boolean;
}

const FirmContext = createContext<FirmContextValue>({
  firms: [],
  firmId: '',
  setFirmId: () => {},
  firmsLoaded: false,
});

export function FirmProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const [firms, setFirms] = useState<Firm[]>([]);
  const [firmId, setFirmId] = useState('');
  const [firmsLoaded, setFirmsLoaded] = useState(false);

  useEffect(() => {
    if (session?.user?.role !== 'accountant') {
      setFirmsLoaded(true);
      return;
    }
    fetch('/api/firms')
      .then((r) => r.json())
      .then((j) => {
        const list: Firm[] = j.data ?? [];
        setFirms(list);
        if (list.length === 1) setFirmId(list[0].id);
        setFirmsLoaded(true);
      })
      .catch(() => setFirmsLoaded(true));
  }, [session?.user?.role]);

  return (
    <FirmContext.Provider value={{ firms, firmId, setFirmId, firmsLoaded }}>
      {children}
    </FirmContext.Provider>
  );
}

export function useFirm() {
  return useContext(FirmContext);
}
