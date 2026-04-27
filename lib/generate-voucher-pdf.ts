import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { brand } from '@/config/branding';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface VoucherData {
  type: 'PV' | 'OR';
  voucher_number: string;
  issue_date: string;
  firm_name: string;
  vendor_name: string;
  total_amount: string;
  category_name: string;
  gl_account_label: string | null;
  contra_gl_account_label: string | null;
  notes: string | null;
  approval: string;
  uploader_name: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(val: string) {
  if (!val) return '';
  const d = new Date(val);
  return [
    d.getUTCDate().toString().padStart(2, '0'),
    (d.getUTCMonth() + 1).toString().padStart(2, '0'),
    d.getUTCFullYear(),
  ].join('/');
}

function fmtRM(val: string | number) {
  const n = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(n)) return 'RM 0.00';
  return `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function hexToRgb(hex: string): [number, number, number] {
  return hex.replace('#', '').match(/\w{2}/g)!.map(h => parseInt(h, 16)) as [number, number, number];
}

// ─── PDF Generator ──────────────────────────────────────────────────────────

export function generateVoucherPdf(data: VoucherData) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const primaryRgb = hexToRgb(brand.colors.primary);
  const title = data.type === 'PV' ? 'PAYMENT VOUCHER' : 'OFFICIAL RECEIPT';

  // ── Colored header bar ──
  doc.setFillColor(...primaryRgb);
  doc.rect(0, 0, pageWidth, 28, 'F');

  doc.setTextColor(255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 14, 13);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${brand.name} ${brand.tagline}`, 14, 21);

  // ── Voucher details ──
  doc.setTextColor(0);
  let y = 38;

  const addField = (label: string, value: string, x: number, fieldY: number) => {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(130);
    doc.text(label.toUpperCase(), x, fieldY);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text(value || '—', x, fieldY + 5.5);
  };

  // Row 1: Voucher No + Date
  addField('Voucher No.', data.voucher_number, 14, y);
  addField('Date', fmtDate(data.issue_date), 100, y);
  y += 14;

  // Row 2: Firm + Vendor
  addField('Firm', data.firm_name, 14, y);
  addField(data.type === 'PV' ? 'Payee / Vendor' : 'Received From', data.vendor_name, 100, y);
  y += 14;

  // ── Divider ──
  doc.setDrawColor(220);
  doc.line(14, y, pageWidth - 14, y);
  y += 6;

  // ── Summary boxes ──
  const boxW = (pageWidth - 28 - 6) / 3;
  const summaryItems = [
    { label: 'Total Amount', value: fmtRM(data.total_amount) },
    { label: 'Category', value: data.category_name || '—' },
    { label: 'Status', value: data.approval === 'approved' ? 'Approved' : data.approval === 'not_approved' ? 'Rejected' : 'Pending Approval' },
  ];

  summaryItems.forEach((item, i) => {
    const x = 14 + i * (boxW + 3);
    doc.setDrawColor(200);
    doc.setFillColor(248, 249, 251);
    doc.roundedRect(x, y, boxW, 16, 2, 2, 'FD');

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(130);
    doc.text(item.label.toUpperCase(), x + 3, y + 5.5);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text(item.value, x + 3, y + 12);
  });

  y += 24;

  // ── GL Account table ──
  const tableBody: string[][] = [];
  if (data.gl_account_label) {
    tableBody.push([data.type === 'PV' ? 'Expense Account' : 'Revenue Account', data.gl_account_label, fmtRM(data.total_amount)]);
  }
  if (data.contra_gl_account_label) {
    tableBody.push(['Contra Account', data.contra_gl_account_label, fmtRM(data.total_amount)]);
  }

  if (tableBody.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['Account Type', 'GL Account', 'Amount']],
      body: tableBody,
      theme: 'grid',
      headStyles: {
        fillColor: primaryRgb,
        textColor: 255,
        fontSize: 8,
        fontStyle: 'bold',
      },
      styles: { fontSize: 8, cellPadding: 2.5 },
      columnStyles: {
        2: { halign: 'right' },
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── Notes ──
  if (data.notes) {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(130);
    doc.text('NOTES', 14, y);
    y += 5;
    doc.setFontSize(9);
    doc.setTextColor(60);
    const lines = doc.splitTextToSize(data.notes, pageWidth - 28);
    doc.text(lines, 14, y);
    y += lines.length * 4.5 + 4;
  }

  // ── Footer ──
  doc.setDrawColor(220);
  doc.line(14, y, pageWidth - 14, y);
  y += 6;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(130);
  doc.text(`Prepared by: ${data.uploader_name}`, 14, y);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-MY')}`, pageWidth - 14, y, { align: 'right' });

  // ── Save ──
  const safeNum = data.voucher_number.replace(/[^a-zA-Z0-9-]/g, '_');
  doc.save(`${safeNum}.pdf`);
}
