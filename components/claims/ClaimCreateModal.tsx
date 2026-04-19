'use client';

import { type RefObject } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
}

interface ClaimCreateModalConfig {
  role: 'accountant' | 'admin';
  firms?: { id: string; name: string }[];
}

export interface ClaimCreateModalProps {
  config: ClaimCreateModalConfig;
  firms: { id: string; name: string }[];

  // Modal state
  modalType: 'claim' | 'receipt' | 'mileage';
  setModalType: (type: 'claim' | 'receipt' | 'mileage') => void;
  modalFirmId: string;
  setModalFirmId: (id: string) => void;
  modalEmployeeId: string;
  setModalEmployeeId: (id: string) => void;
  modalEmployees: { id: string; name: string }[];
  modalDate: string;
  setModalDate: (date: string) => void;
  modalMerchant: string;
  setModalMerchant: (merchant: string) => void;
  modalAmount: string;
  setModalAmount: (amount: string) => void;
  modalCategory: string;
  setModalCategory: (category: string) => void;
  modalCategories: Category[];
  modalReceipt: string;
  setModalReceipt: (receipt: string) => void;
  modalDesc: string;
  setModalDesc: (desc: string) => void;
  selectedFile: File | null;
  previewUrl: string | null;
  modalError: string;
  modalSaving: boolean;
  ocrScanning: boolean;
  fileInputRef: RefObject<HTMLInputElement>;

  // Mileage fields
  mileageFrom: string;
  setMileageFrom: (v: string) => void;
  mileageTo: string;
  setMileageTo: (v: string) => void;
  mileageDistance: string;
  setMileageDistance: (v: string) => void;
  mileagePurpose: string;
  setMileagePurpose: (v: string) => void;
  mileageRate: number;

  // Actions
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  clearFile: () => void;
  submitClaim: () => void;
  onClose: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ClaimCreateModal({
  config,
  firms,
  modalType,
  setModalType,
  modalFirmId,
  setModalFirmId,
  modalEmployeeId,
  setModalEmployeeId,
  modalEmployees,
  modalDate,
  setModalDate,
  modalMerchant,
  setModalMerchant,
  modalAmount,
  setModalAmount,
  modalCategory,
  setModalCategory,
  modalCategories,
  modalReceipt,
  setModalReceipt,
  modalDesc,
  setModalDesc,
  selectedFile,
  previewUrl,
  modalError,
  modalSaving,
  ocrScanning,
  fileInputRef,
  mileageFrom,
  setMileageFrom,
  mileageTo,
  setMileageTo,
  mileageDistance,
  setMileageDistance,
  mileagePurpose,
  setMileagePurpose,
  mileageRate,
  handleFileChange,
  clearFile,
  submitClaim,
  onClose,
}: ClaimCreateModalProps) {
  const isAccountant = config.role === 'accountant';

  return (
    <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4">
      <div className="bg-white shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 bg-[var(--primary)]">
          <h3 className="text-white font-bold text-sm uppercase tracking-widest">Submit New {modalType === 'mileage' ? 'Mileage Claim' : modalType === 'claim' ? 'Claim' : 'Receipt'}</h3>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
        </div>

        <div className="flex-1 overflow-y-scroll p-6 space-y-3">

        {/* Document preview */}
        {selectedFile && (() => {
          const url = URL.createObjectURL(selectedFile);
          const isPdf = selectedFile.type === 'application/pdf' || selectedFile.name.toLowerCase().endsWith('.pdf');
          return (
            <div className="overflow-hidden bg-[var(--surface-low)] mb-4">
              {isPdf ? (
                <iframe src={`${url}#toolbar=0&navpanes=0`} className="w-full h-[300px]" title="Document preview" />
              ) : (
                <img src={url} alt="Document preview" className="w-full max-h-[300px] object-contain" />
              )}
            </div>
          );
        })()}

        {/* -- Type Toggle -- */}
        <div className="flex overflow-hidden mb-4">
          {(['claim', 'receipt', 'mileage'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setModalType(t)}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${modalType === t ? 'bg-[var(--primary)] text-white' : 'bg-white text-[var(--text-secondary)] hover:bg-[var(--surface-low)]'}`}
            >
              {t === 'claim' ? 'Claim' : t === 'receipt' ? 'Receipt' : 'Mileage'}
            </button>
          ))}
        </div>

        {modalError && (
          <div className="mb-4 bg-[var(--reject-red)]/10 p-3">
            <p className="text-sm text-[var(--reject-red)]">{modalError}</p>
          </div>
        )}

        <div className="space-y-3">
          {/* Firm selector — accountant only */}
          {isAccountant && (
            <div>
              <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Firm *</label>
              <select
                value={modalFirmId}
                onChange={(e) => setModalFirmId(e.target.value)}
                className="input-recessed w-full"
              >
                <option value="">Select a firm</option>
                {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          )}
          {modalEmployees.length > 0 && modalType !== 'receipt' && (
            <div>
              <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Employee *</label>
              <select
                value={modalEmployeeId}
                onChange={(e) => setModalEmployeeId(e.target.value)}
                className="input-recessed w-full"
              >
                <option value="">Select employee</option>
                {modalEmployees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Date *</label>
            <input type="date" value={modalDate} onChange={(e) => setModalDate(e.target.value)} className="input-recessed w-full" required />
          </div>

          {modalType === 'mileage' ? (
            <>
              <div>
                <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">From *</label>
                <input type="text" value={mileageFrom} onChange={(e) => setMileageFrom(e.target.value)} className="input-recessed w-full" placeholder="e.g. PJ Office" autoFocus />
              </div>
              <div>
                <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">To *</label>
                <input type="text" value={mileageTo} onChange={(e) => setMileageTo(e.target.value)} className="input-recessed w-full" placeholder="e.g. Shah Alam client office" />
              </div>
              <div>
                <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Distance (km) *</label>
                <input type="number" value={mileageDistance} onChange={(e) => setMileageDistance(e.target.value)} className="input-recessed w-full" placeholder="e.g. 25" step="0.1" min="0" />
              </div>
              <div>
                <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Purpose *</label>
                <input type="text" value={mileagePurpose} onChange={(e) => setMileagePurpose(e.target.value)} className="input-recessed w-full" placeholder="e.g. Client meeting with ABC Sdn Bhd" />
              </div>
              {mileageDistance && parseFloat(mileageDistance) > 0 && (
                <div className="bg-[var(--primary)]/10 p-3">
                  <p className="text-sm text-[var(--primary)] font-medium tabular-nums">
                    Amount: RM {(parseFloat(mileageDistance) * mileageRate).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-[var(--primary)]/70 mt-0.5 tabular-nums">{mileageDistance} km x RM {mileageRate.toFixed(2)}/km</p>
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Merchant Name *</label>
                <input type="text" value={modalMerchant} onChange={(e) => setModalMerchant(e.target.value)} className="input-recessed w-full" placeholder="e.g. Petronas, Grab, etc." autoFocus />
              </div>
              <div>
                <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Amount (RM) *</label>
                <input type="number" value={modalAmount} onChange={(e) => setModalAmount(e.target.value)} className="input-recessed w-full" placeholder="0.00" step="0.01" min="0" />
              </div>
              <div>
                <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Category *</label>
                <select value={modalCategory} onChange={(e) => setModalCategory(e.target.value)} className="input-recessed w-full">
                  <option value="">Select a category</option>
                  {modalCategories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Receipt Number</label>
                <input type="text" value={modalReceipt} onChange={(e) => setModalReceipt(e.target.value)} className="input-recessed w-full" placeholder="Optional" />
              </div>
              <div>
                <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Description</label>
                <textarea value={modalDesc} onChange={(e) => setModalDesc(e.target.value)} className="input-recessed w-full" rows={2} placeholder="Optional" />
              </div>
              <div>
                <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Receipt</label>
                <div
                  className="border-2 border-dashed border-[var(--outline-ghost)] p-4 text-center cursor-pointer hover:border-[var(--outline)] transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {selectedFile ? (
                    <div className="space-y-2">
                      {selectedFile.type === 'application/pdf' ? (
                        <div className="mx-auto w-16 h-20 bg-[var(--reject-red)]/10 flex items-center justify-center">
                          <span className="text-[var(--reject-red)] font-bold text-xs">PDF</span>
                        </div>
                      ) : previewUrl ? (
                        <img src={previewUrl} alt="Preview" className="mx-auto max-h-32" />
                      ) : null}
                      <p className="text-sm text-[var(--text-secondary)]">{selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)</p>
                      <button type="button" onClick={(e) => { e.stopPropagation(); clearFile(); }} className="text-xs text-[var(--reject-red)] hover:text-[var(--reject-red)]/80">Remove</button>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm text-[var(--text-secondary)]">Click or drag to upload receipt</p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">JPG, PNG, PDF up to 10MB</p>
                    </div>
                  )}
                  <input type="file" accept="image/*,application/pdf" multiple onChange={handleFileChange} className="hidden" ref={fileInputRef} />
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1">Select multiple files to batch upload with auto OCR</p>
                {ocrScanning && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-[var(--primary)]">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Scanning document... fields will auto-fill shortly
                  </div>
                )}
              </div>
            </>
          )}

        </div>
        </div>

        <div className="flex gap-3 px-5 py-3 bg-[var(--surface-low)]">
          <button
            onClick={submitClaim}
            disabled={modalSaving || ocrScanning}
            className="btn-thick-navy flex-1 py-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {ocrScanning ? 'Scanning...' : modalSaving ? 'Submitting...' : `Submit ${modalType === 'mileage' ? 'Mileage Claim' : modalType === 'claim' ? 'Claim' : 'Receipt'}`}
          </button>
          <button
            onClick={onClose}
            disabled={modalSaving}
            className="btn-thick-white flex-1 py-2.5 text-sm font-semibold disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
