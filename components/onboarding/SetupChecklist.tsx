'use client';

import { useState, useEffect, useCallback } from 'react';
import SetupCoaModal from './SetupCoaModal';
import CreateFiscalYearModal from './CreateFiscalYearModal';

interface SetupStatus {
  firmDetails: { complete: boolean; missing: string[] };
  chartOfAccounts: { complete: boolean; count: number };
  fiscalYear: { complete: boolean; count: number };
  admin: { complete: boolean; count: number };
}

interface FirmOption {
  id: string;
  name: string;
}

interface SetupChecklistProps {
  firmId: string;
  firms: FirmOption[];
  onOpenEditFirm: () => void;
  onOpenAddAdmin: () => void;
}

const STEPS = [
  { key: 'firmDetails', label: 'Firm Details', description: 'Name, registration number, and contact email' },
  { key: 'chartOfAccounts', label: 'Chart of Accounts', description: 'GL accounts, tax codes, and category mappings' },
  { key: 'fiscalYear', label: 'Fiscal Year', description: 'Create your first fiscal year with 12 monthly periods' },
  { key: 'admin', label: 'Add Admin', description: 'Create an admin user for this firm' },
] as const;


export default function SetupChecklist({ firmId, firms, onOpenEditFirm, onOpenAddAdmin }: SetupChecklistProps) {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [showCoaModal, setShowCoaModal] = useState(false);
  const [showFyModal, setShowFyModal] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/accountant/firms/${firmId}/setup-status`);
      const json = await res.json();
      if (res.ok && json.data) setStatus(json.data);
    } catch (e) {
      console.error('Failed to fetch setup status:', e);
    } finally {
      setLoading(false);
    }
  }, [firmId]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Listen for external changes (firm edit saved, admin created)
  useEffect(() => {
    const handler = () => fetchStatus();
    window.addEventListener('setup-step-completed', handler);
    return () => window.removeEventListener('setup-step-completed', handler);
  }, [fetchStatus]);

  if (loading || !status) return null;

  const completedCount = STEPS.filter(s => status[s.key].complete).length;
  const allComplete = completedCount === STEPS.length;

  const handleStepAction = (key: string) => {
    switch (key) {
      case 'firmDetails':
        onOpenEditFirm();
        break;
      case 'chartOfAccounts':
        setShowCoaModal(true);
        break;
      case 'fiscalYear':
        setShowFyModal(true);
        break;
      case 'admin':
        onOpenAddAdmin();
        break;
    }
  };

  const handleStepComplete = () => {
    setShowCoaModal(false);
    setShowFyModal(false);
    fetchStatus();
  };

  return (
    <>
      <div className="card-button-pressed overflow-hidden">
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3 cursor-pointer select-none"
          onClick={() => setCollapsed(!collapsed)}
        >
          <div className="flex items-center gap-3">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className={`text-[var(--text-secondary)] flex-shrink-0 transition-transform duration-200 ${!collapsed ? 'rotate-90' : ''}`}>
              <path d="M9 18l6-6-6-6" />
            </svg>
            <h2 className="text-title-sm font-semibold text-[var(--text-primary)]">Firm Setup</h2>
            {allComplete ? (
              <span className="badge-green flex items-center gap-1">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                Complete
              </span>
            ) : (
              <span className="badge-amber">{completedCount} of {STEPS.length}</span>
            )}
          </div>
        </div>

        {/* Steps */}
        {!collapsed && (
          <div className="px-5 pb-4 space-y-2">
            {STEPS.map((step, i) => {
              const isComplete = status[step.key].complete;
              return (
                <div
                  key={step.key}
                  className="flex items-center gap-3 py-2"
                >
                  {/* Step number */}
                  <div className={`w-7 h-7 flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                    isComplete
                      ? 'bg-emerald-500 text-white'
                      : 'bg-[var(--surface-low)] border border-[#C0C4C8] text-[var(--text-secondary)]'
                  }`}>
                    {isComplete ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                    ) : (
                      i + 1
                    )}
                  </div>

                  {/* Label */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${isComplete ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)]'}`}>
                      {step.label}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] truncate">{step.description}</p>
                  </div>

                  {/* Action */}
                  {isComplete ? (
                    <span className="text-xs text-emerald-600 font-medium flex-shrink-0">Done</span>
                  ) : (
                    <button
                      onClick={() => handleStepAction(step.key)}
                      className="btn-thick-navy text-xs px-3 py-1.5 font-medium flex-shrink-0"
                    >
                      Set Up
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      {showCoaModal && (
        <SetupCoaModal
          firmId={firmId}
          firms={firms}
          onComplete={handleStepComplete}
          onClose={() => setShowCoaModal(false)}
        />
      )}
      {showFyModal && (
        <CreateFiscalYearModal
          firmId={firmId}
          onComplete={handleStepComplete}
          onClose={() => setShowFyModal(false)}
        />
      )}
    </>
  );
}
