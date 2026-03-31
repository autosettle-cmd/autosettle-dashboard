import { prisma } from "@/lib/prisma";

function fmtRM(n: number): string {
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface SaveClaimInput {
  employeeId: string;
  firmId: string;
  claimDate: string;
  merchant: string;
  amount: number;
  receiptNumber: string;
  category: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  driveFileId: string;
  thumbnailUrl: string;
}

export async function saveClaim(input: SaveClaimInput) {
  // Look up category by name for this firm (or global)
  const category = await prisma.category.findFirst({
    where: {
      name: input.category,
      OR: [{ firm_id: input.firmId }, { firm_id: null }],
      is_active: true,
    },
  });

  if (!category) {
    throw new Error(`Category not found: ${input.category}`);
  }

  const claim = await prisma.claim.create({
    data: {
      firm_id: input.firmId,
      employee_id: input.employeeId,
      claim_date: isNaN(new Date(input.claimDate).getTime()) ? new Date() : new Date(input.claimDate),
      merchant: input.merchant,
      amount: input.amount,
      receipt_number: input.receiptNumber || null,
      category_id: category.id,
      confidence: input.confidence,
      status: "pending_review",
      approval: "pending_approval",
      payment_status: "unpaid",
      file_url: `https://drive.google.com/file/d/${input.driveFileId}/view`,
      thumbnail_url: input.thumbnailUrl,
      submitted_via: "whatsapp",
    },
  });

  return claim;
}


export async function getClaimsForPhone(
  phone: string,
  filter: "pending" | "approved" | "rejected" | "all"
): Promise<string> {
  // Find employee by phone
  const employee = await prisma.employee.findUnique({
    where: { phone },
    select: { id: true, name: true },
  });

  if (!employee) return "No employee found for this phone number.";

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  if (filter === "all") {
    // Monthly summary + year-to-date breakdown by category
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const monthClaims = await prisma.claim.findMany({
      where: {
        employee_id: employee.id,
        created_at: { gte: startOfMonth },
      },
      include: { category: { select: { name: true } } },
    });

    const ytdClaims = await prisma.claim.findMany({
      where: {
        employee_id: employee.id,
        created_at: { gte: startOfYear },
      },
      include: { category: { select: { name: true } } },
    });

    const monthTotal = monthClaims.reduce((sum, c) => sum + Number(c.amount), 0);
    const ytdTotal = ytdClaims.reduce((sum, c) => sum + Number(c.amount), 0);

    // Group YTD by category
    const byCategory: Record<string, number> = {};
    for (const c of ytdClaims) {
      const cat = c.category.name;
      byCategory[cat] = (byCategory[cat] || 0) + Number(c.amount);
    }

    const monthName = now.toLocaleString("en-MY", { month: "long" });
    let msg = `Summary for ${employee.name}\n\n`;
    msg += `${monthName}: ${fmtRM(monthTotal)} (${monthClaims.length} claims)\n\n`;
    msg += `Year-to-date: ${fmtRM(ytdTotal)} (${ytdClaims.length} claims)\n`;

    if (Object.keys(byCategory).length > 0) {
      msg += "\nBy category:\n";
      for (const [cat, total] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
        msg += `- ${cat}: ${fmtRM(total)}\n`;
      }
    }

    return msg.trim();
  }

  // Filter-specific queries
  const approvalMap = {
    pending: "pending_approval" as const,
    approved: "approved" as const,
    rejected: "not_approved" as const,
  };

  const where: Record<string, unknown> = {
    employee_id: employee.id,
    approval: approvalMap[filter],
  };

  // For rejected, only last 30 days
  if (filter === "rejected") {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    where.created_at = { gte: thirtyDaysAgo };
  }

  const claims = await prisma.claim.findMany({
    where,
    include: { category: { select: { name: true } } },
    orderBy: { created_at: "desc" },
    take: filter === "rejected" ? 10 : 50,
  });

  if (claims.length === 0) {
    const labels = { pending: "pending", approved: "approved", rejected: "rejected" };
    return `No ${labels[filter]} claims found.`;
  }

  const total = claims.reduce((sum, c) => sum + Number(c.amount), 0);

  if (filter === "rejected") {
    // Show individual lines for rejected
    let msg = `Rejected claims (last 30 days):\n\n`;
    for (const c of claims) {
      const date = c.claim_date.toISOString().split("T")[0];
      msg += `- ${c.merchant} ${fmtRM(Number(c.amount))} (${date})${c.rejection_reason ? ` - ${c.rejection_reason}` : ""}\n`;
    }
    msg += `\nTotal: ${fmtRM(total)}`;
    return msg;
  }

  // Group by category for pending/approved
  const byCategory: Record<string, { count: number; total: number }> = {};
  for (const c of claims) {
    const cat = c.category.name;
    if (!byCategory[cat]) byCategory[cat] = { count: 0, total: 0 };
    byCategory[cat].count++;
    byCategory[cat].total += Number(c.amount);
  }

  const label = filter === "pending" ? "Pending" : "Approved";
  let msg = `${label} claims: ${claims.length} total (${fmtRM(total)})\n\n`;
  for (const [cat, data] of Object.entries(byCategory).sort((a, b) => b[1].total - a[1].total)) {
    msg += `- ${cat}: ${data.count} claims, ${fmtRM(data.total)}\n`;
  }

  return msg.trim();
}

export async function logMessage(params: {
  phone: string;
  employeeId?: string;
  messageType: string;
  ocrConfidence?: string;
  processingMs?: number;
  error?: string;
}) {
  await prisma.messageLog.create({
    data: {
      phone: params.phone,
      employee_id: params.employeeId || null,
      message_type: params.messageType,
      ocr_confidence: params.ocrConfidence || null,
      processing_ms: params.processingMs || null,
      error: params.error || null,
    },
  });
}
