import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── Types (shared with statement pages) ─────────────────────────────────────

export interface SupplierInfo {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
}

export interface StatementEntry {
  date: string;
  type: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface StatementData {
  supplier: SupplierInfo;
  period: { from: string; to: string };
  opening_balance: number;
  entries: StatementEntry[];
  totals: { total_debit: number; total_credit: number };
  closing_balance: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(val: string) {
  if (!val) return '';
  const d = new Date(val);
  return [
    d.getUTCDate().toString().padStart(2, '0'),
    (d.getUTCMonth() + 1).toString().padStart(2, '0'),
    d.getUTCFullYear(),
  ].join('/');
}

function fmtRM(val: number) {
  return `RM ${val.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── PDF Generator ───────────────────────────────────────────────────────────

export function generateSOAPdf(data: StatementData) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // ── Header ──
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Statement of Account', 14, 20);

  doc.setFontSize(14);
  doc.text(data.supplier.name, 14, 28);

  // ── Supplier info line ──
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  const infoItems: string[] = [];
  if (data.supplier.contact_email) infoItems.push(`Email: ${data.supplier.contact_email}`);
  if (data.supplier.contact_phone) infoItems.push(`Phone: ${data.supplier.contact_phone}`);
  infoItems.push(`Period: ${fmtDate(data.period.from)} — ${fmtDate(data.period.to)}`);
  doc.text(infoItems.join('    |    '), 14, 34);

  // ── Summary boxes ──
  doc.setTextColor(0);
  const summaryY = 42;
  const boxW = (pageWidth - 28 - 9) / 4; // 14mm margin each side, 3mm gap × 3
  const summaryItems = [
    { label: 'Opening Balance', value: fmtRM(data.opening_balance) },
    { label: 'Total Debit', value: fmtRM(data.totals.total_debit) },
    { label: 'Total Credit', value: fmtRM(data.totals.total_credit) },
    { label: 'Closing Balance', value: fmtRM(data.closing_balance) },
  ];

  summaryItems.forEach((item, i) => {
    const x = 14 + i * (boxW + 3);
    doc.setDrawColor(200);
    doc.setFillColor(248, 249, 251);
    doc.roundedRect(x, summaryY, boxW, 16, 2, 2, 'FD');

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(130);
    doc.text(item.label.toUpperCase(), x + 3, summaryY + 5.5);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text(item.value, x + 3, summaryY + 12);
  });

  // ── Table ──
  const tableStartY = summaryY + 22;

  // Build body rows
  const body: (string | { content: string; styles: object })[][] = [];

  // Opening balance row
  body.push([
    fmtDate(data.period.from),
    { content: 'Opening Balance', styles: { fontStyle: 'italic' as const } },
    '',
    '—',
    '—',
    fmtRM(data.opening_balance),
  ]);

  // Entry rows
  data.entries.forEach((entry) => {
    body.push([
      fmtDate(entry.date),
      entry.reference,
      entry.description,
      entry.debit > 0 ? fmtRM(entry.debit) : '—',
      entry.credit > 0 ? fmtRM(entry.credit) : '—',
      fmtRM(entry.balance),
    ]);
  });

  // Closing balance row
  body.push([
    { content: fmtDate(data.period.to), styles: { fontStyle: 'bold' as const } },
    { content: 'Closing Balance', styles: { fontStyle: 'bold' as const } },
    '',
    { content: fmtRM(data.totals.total_debit), styles: { fontStyle: 'bold' as const, textColor: [220, 38, 38] as [number, number, number] } },
    { content: fmtRM(data.totals.total_credit), styles: { fontStyle: 'bold' as const, textColor: [22, 163, 74] as [number, number, number] } },
    { content: fmtRM(data.closing_balance), styles: { fontStyle: 'bold' as const, textColor: (data.closing_balance > 0 ? [220, 38, 38] : data.closing_balance < 0 ? [22, 163, 74] : [107, 114, 128]) as [number, number, number] } },
  ]);

  autoTable(doc, {
    startY: tableStartY,
    head: [['Date', 'Reference', 'Description', 'Debit', 'Credit', 'Balance']],
    body,
    theme: 'grid',
    headStyles: {
      fillColor: [21, 34, 55],   // #152237
      textColor: 255,
      fontSize: 8,
      fontStyle: 'bold',
    },
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
    },
    columnStyles: {
      0: { cellWidth: 22 },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
    // Style rows: gray for opening/closing, green tint for receivable entries
    didParseCell(hookData) {
      if (hookData.section === 'body') {
        if (hookData.row.index === 0 || hookData.row.index === body.length - 1) {
          hookData.cell.styles.fillColor = [245, 245, 248];
        }
        // Green tint for sales invoices and incoming payments (offset by 1 for opening balance row)
        const entryIndex = hookData.row.index - 1;
        if (entryIndex >= 0 && entryIndex < data.entries.length) {
          const entry = data.entries[entryIndex];
          if (entry.type === 'sales_invoice' || entry.type === 'incoming_payment') {
            hookData.cell.styles.fillColor = [240, 253, 244]; // light green
          }
          // Color debit column (col 3) red
          if (hookData.column.index === 3 && entry.debit > 0) {
            hookData.cell.styles.textColor = [220, 38, 38]; // red
          }
          // Color credit column (col 4) green
          if (hookData.column.index === 4 && entry.credit > 0) {
            hookData.cell.styles.textColor = [22, 163, 74]; // green
          }
          // Color balance column (col 5)
          if (hookData.column.index === 5) {
            if (entry.balance > 0) hookData.cell.styles.textColor = [220, 38, 38];
            else if (entry.balance < 0) hookData.cell.styles.textColor = [22, 163, 74];
            else hookData.cell.styles.textColor = [107, 114, 128];
          }
        }
      }
    },
  });

  // ── Save ──
  const safeName = data.supplier.name.replace(/[^a-zA-Z0-9]/g, '_');
  const from = data.period.from.slice(0, 10).replace(/-/g, '');
  const to = data.period.to.slice(0, 10).replace(/-/g, '');
  doc.save(`SOA_${safeName}_${from}_${to}.pdf`);
}
