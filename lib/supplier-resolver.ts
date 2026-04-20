import { prisma } from '@/lib/prisma';

/**
 * Normalize a company name for fuzzy matching.
 * Strips common Malaysian business suffixes and punctuation.
 */
function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    // Strip common suffixes (order matters — longest first)
    .replace(/\b(sdn\.?\s*bhd\.?|bhd\.?|sdn\.?|plt\.?|llp|inc\.?|ltd\.?|co\.?|corp\.?|enterprise|trading|services?|industries|holdings?)\b/gi, '')
    // Strip punctuation and extra whitespace
    .replace(/[.,()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface ResolveResult {
  supplierId: string;
  linkStatus: 'auto_matched' | 'unmatched' | 'confirmed';
}

/**
 * Resolve a vendor name to a supplier, with fuzzy matching.
 *
 * 1. Exact alias match (lowercased) → use it
 * 2. Fuzzy match: normalize company name (strip SDN BHD, etc.) and compare
 *    against all supplier names in the firm → if single match, use it + save alias
 * 3. No match → create new supplier + alias
 */
export async function resolveSupplier(
  vendorName: string,
  firmId: string,
): Promise<ResolveResult> {
  const normalizedVendor = vendorName.toLowerCase().trim();

  // Step 1: Exact alias match
  const existingAlias = await prisma.supplierAlias.findFirst({
    where: {
      alias: normalizedVendor,
      supplier: { firm_id: firmId },
    },
    include: { supplier: true },
  });

  if (existingAlias) {
    return {
      supplierId: existingAlias.supplier_id,
      linkStatus: existingAlias.is_confirmed ? 'confirmed' : 'auto_matched',
    };
  }

  // Step 2: Fuzzy match — normalize and compare against existing suppliers
  const fuzzyKey = normalizeCompanyName(vendorName);
  if (fuzzyKey.length >= 3) {
    const firmSuppliers = await prisma.supplier.findMany({
      where: { firm_id: firmId, is_active: true },
      select: { id: true, name: true },
    });

    const matches = firmSuppliers.filter(s => normalizeCompanyName(s.name) === fuzzyKey);

    if (matches.length === 1) {
      // Single fuzzy match — link to it and save alias for future exact matches
      const match = matches[0];
      await prisma.supplierAlias.create({
        data: { supplier_id: match.id, alias: normalizedVendor, is_confirmed: false },
      }).catch(() => {}); // ignore if alias already exists
      return { supplierId: match.id, linkStatus: 'auto_matched' };
    }
  }

  // Step 3: No match — create new supplier + alias
  const newSupplier = await prisma.supplier.create({
    data: {
      firm_id: firmId,
      name: vendorName,
      aliases: {
        create: { alias: normalizedVendor, is_confirmed: false },
      },
    },
  });

  return { supplierId: newSupplier.id, linkStatus: 'unmatched' };
}
