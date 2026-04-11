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
  const [firmId, setFirmIdState] = useState('');
  const [firmsLoaded, setFirmsLoaded] = useState(false);

  const setFirmId = (id: string) => {
    setFirmIdState(id);
    try { localStorage.setItem('autosettle_firm_id', id); } catch {}
  };

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
        // Restore saved firm, or default to single firm
        const saved = (() => { try { return localStorage.getItem('autosettle_firm_id') ?? ''; } catch { return ''; } })();
        if (saved && list.some((f) => f.id === saved)) {
          setFirmIdState(saved);
        } else if (list.length === 1) {
          setFirmId(list[0].id);
        }
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
