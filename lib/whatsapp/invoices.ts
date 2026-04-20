import { prisma } from "@/lib/prisma";
import { resolveSupplier } from "@/lib/supplier-resolver";

interface SaveInvoiceInput {
  employeeId: string;
  firmId: string;
  vendor: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  paymentTerms: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  category: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  driveFileId: string;
  thumbnailUrl: string;
}

/**
 * Save an invoice with automatic supplier matching.
 *
 * 1. Normalize vendor name
 * 2. Search SupplierAlias for match in this firm
 * 3. If found + confirmed → link, status = confirmed
 * 4. If found + unconfirmed → link, status = auto_matched
 * 5. If not found → create Supplier + alias, status = unmatched
 */
export async function saveInvoice(input: SaveInvoiceInput) {
  // Look up category
  const category = await prisma.category.findFirst({
    where: {
      name: { equals: input.category, mode: "insensitive" },
      OR: [{ firm_id: input.firmId }, { firm_id: null }],
    },
  });

  if (!category) {
    throw new Error(`Category not found: ${input.category}`);
  }

  // Resolve supplier with fuzzy matching
  const { supplierId, linkStatus } = await resolveSupplier(input.vendor, input.firmId);

  // Parse dates — fallback to today if invalid
  const today = new Date().toISOString().split("T")[0];
  const issueDate = input.issueDate || today;

  // Calculate due date from payment terms if not provided
  let dueDate = input.dueDate || null;
  if (!dueDate && input.paymentTerms && issueDate) {
    const daysMatch = input.paymentTerms.match(/(\d+)\s*(?:days?|d)/i)
      ?? input.paymentTerms.match(/net\s*(\d+)/i);
    if (daysMatch) {
      const days = parseInt(daysMatch[1], 10);
      const d = new Date(issueDate);
      d.setDate(d.getDate() + days);
      dueDate = d.toISOString().split("T")[0];
    }
  }

  const invoice = await prisma.invoice.create({
    data: {
      firm_id: input.firmId,
      uploaded_by: input.employeeId,
      supplier_id: supplierId,
      supplier_link_status: linkStatus,
      vendor_name_raw: input.vendor,
      invoice_number: input.invoiceNumber || null,
      issue_date: new Date(issueDate),
      due_date: dueDate ? new Date(dueDate) : null,
      payment_terms: input.paymentTerms || null,
      subtotal: input.subtotal || null,
      tax_amount: input.taxAmount || null,
      total_amount: input.totalAmount,
      category_id: category.id,
      confidence: input.confidence,
      status: "pending_review",
      payment_status: "unpaid",
      amount_paid: 0,
      file_url: `https://drive.google.com/file/d/${input.driveFileId}/view`,
      thumbnail_url: input.thumbnailUrl,
      submitted_via: "whatsapp",
    },
  });

  return invoice;
}
