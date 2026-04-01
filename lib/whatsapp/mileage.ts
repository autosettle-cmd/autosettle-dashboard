import { prisma } from "@/lib/prisma";
import { sendTextMessage, sendInteractiveButtons, sendMileageConfirmationMessage } from "./send";
import { getSession, updateSession, deleteSession } from "./session";
import { logMessage } from "./claims";
import { getFirmMileageRate, calculateMileageAmount } from "@/lib/mileage";
import type { EmployeeInfo } from "./employees";
import type { Prisma } from "@/generated/prisma";

/**
 * Start a mileage claim session for the given phone.
 * Creates a new session (or updates existing) with MILEAGE_FROM step.
 */
export async function startMileageFlow(phone: string, employee: EmployeeInfo): Promise<void> {
  const existing = await getSession(phone);

  if (existing) {
    // If they have pending receipts, don't overwrite — ask them to resolve first
    const receiptMap = (existing.pending_receipt as Record<string, unknown>) || {};
    if (Object.keys(receiptMap).length > 0) {
      await sendTextMessage(phone, "You have pending receipts to confirm first. Please use the Yes/No buttons above, then try again.");
      return;
    }
    // Update existing empty session
    await updateSession(existing.id, {
      step: "MILEAGE_FROM",
      pending_receipt: {
        mileage: { employeeId: employee.id, firmId: employee.firmId }
      } as Prisma.InputJsonValue,
    });
  } else {
    await prisma.session.create({
      data: {
        phone,
        state: "COLLECTING",
        step: "MILEAGE_FROM",
        pending_receipt: {
          mileage: { employeeId: employee.id, firmId: employee.firmId }
        },
      },
    });
  }

  await sendTextMessage(phone, "Let's log your mileage claim. Where did you start from?");
}

/**
 * Handle each step of the mileage collection flow.
 * Deterministic state machine — no LLM needed.
 */
export async function handleMileageStep(
  phone: string,
  employee: EmployeeInfo,
  textBody: string
): Promise<void> {
  const session = await getSession(phone);
  if (!session) return;

  const step = session.step || "";
  const receiptMap = (session.pending_receipt as Record<string, Record<string, unknown>>) || {};
  const mileageData = receiptMap.mileage || {};

  switch (step) {
    case "MILEAGE_FROM": {
      mileageData.from_location = textBody.trim();
      receiptMap.mileage = mileageData;
      await updateSession(session.id, {
        step: "MILEAGE_TO",
        pending_receipt: receiptMap as Prisma.InputJsonValue,
      });
      await sendTextMessage(phone, "Got it. Where did you travel to?");
      break;
    }

    case "MILEAGE_TO": {
      mileageData.to_location = textBody.trim();
      receiptMap.mileage = mileageData;
      await updateSession(session.id, {
        step: "MILEAGE_DISTANCE",
        pending_receipt: receiptMap as Prisma.InputJsonValue,
      });
      await sendTextMessage(phone, "How far was the trip in km?");
      break;
    }

    case "MILEAGE_DISTANCE": {
      const km = parseFloat(textBody.replace(/[^\d.]/g, ""));
      if (isNaN(km) || km <= 0) {
        await sendTextMessage(phone, "Please enter a valid distance in km (e.g. 25 or 12.5).");
        return;
      }
      mileageData.distance_km = km;
      receiptMap.mileage = mileageData;
      await updateSession(session.id, {
        step: "MILEAGE_PURPOSE",
        pending_receipt: receiptMap as Prisma.InputJsonValue,
      });
      await sendTextMessage(phone, "What was the purpose of this trip?");
      break;
    }

    case "MILEAGE_PURPOSE": {
      mileageData.trip_purpose = textBody.trim();
      receiptMap.mileage = mileageData;

      // Calculate amount
      const firmId = mileageData.firmId as string;
      const rate = await getFirmMileageRate(firmId);
      const distanceKm = mileageData.distance_km as number;
      const amount = calculateMileageAmount(distanceKm, rate);

      mileageData.rate = rate;
      mileageData.amount = amount;
      receiptMap.mileage = mileageData;

      await updateSession(session.id, {
        step: "MILEAGE_CONFIRM",
        pending_receipt: receiptMap as Prisma.InputJsonValue,
      });

      const fmtAmount = amount.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const fmtRate = rate.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      const bodyText = [
        "Please confirm your mileage claim:",
        "",
        `From: ${mileageData.from_location}`,
        `To: ${mileageData.to_location}`,
        `Distance: ${distanceKm} km`,
        `Purpose: ${mileageData.trip_purpose}`,
        `Amount: RM ${fmtAmount} (${distanceKm} km x RM ${fmtRate}/km)`,
        "",
        "Is this correct?",
      ].join("\n");

      await sendInteractiveButtons(phone, bodyText, [
        { id: "mileage_yes", title: "Yes" },
        { id: "mileage_no", title: "No" },
      ]);
      break;
    }

    default:
      break;
  }
}

/**
 * Handle mileage confirmation (Yes button).
 * Saves the mileage claim and cleans up the session.
 */
export async function confirmMileageClaim(phone: string): Promise<void> {
  const session = await getSession(phone);
  if (!session) {
    await sendTextMessage(phone, "No pending mileage claim found. Type 'mileage' to start a new one.");
    return;
  }

  const receiptMap = (session.pending_receipt as Record<string, Record<string, unknown>>) || {};
  const mileageData = receiptMap.mileage;
  if (!mileageData) {
    await sendTextMessage(phone, "No pending mileage claim found. Type 'mileage' to start a new one.");
    return;
  }

  const firmId = mileageData.firmId as string;
  const employeeId = mileageData.employeeId as string;
  const amount = mileageData.amount as number;
  const distanceKm = mileageData.distance_km as number;
  const rate = mileageData.rate as number;

  // Resolve "Travel & Transport" category
  const category = await prisma.category.findFirst({
    where: {
      name: "Travel & Transport",
      OR: [{ firm_id: firmId }, { firm_id: null }],
      is_active: true,
    },
  });

  if (!category) {
    await sendTextMessage(phone, "Sorry, could not find the Travel & Transport category. Please contact your admin.");
    return;
  }

  await prisma.claim.create({
    data: {
      firm_id: firmId,
      employee_id: employeeId,
      claim_date: new Date(),
      merchant: "Mileage Claim",
      amount,
      category_id: category.id,
      confidence: "HIGH",
      status: "pending_review",
      approval: "pending_approval",
      payment_status: "unpaid",
      submitted_via: "whatsapp",
      type: "mileage",
      from_location: mileageData.from_location as string,
      to_location: mileageData.to_location as string,
      distance_km: distanceKm,
      trip_purpose: mileageData.trip_purpose as string,
    },
  });

  // Clean up session
  await deleteSession(session.id);

  await sendMileageConfirmationMessage(phone, {
    from: mileageData.from_location as string,
    to: mileageData.to_location as string,
    distanceKm,
    amount,
    rate,
  });

  logMessage({
    phone,
    employeeId,
    messageType: "mileage",
  }).catch((err) => console.error("Log write failed silently:", err));
}

/**
 * Handle mileage rejection (No button).
 * Resets to MILEAGE_FROM to restart the flow.
 */
export async function rejectMileageClaim(phone: string): Promise<void> {
  const session = await getSession(phone);
  if (!session) return;

  // Reset to start of flow, keeping employee data
  const receiptMap = (session.pending_receipt as Record<string, Record<string, unknown>>) || {};
  const mileageData = receiptMap.mileage || {};
  const employeeId = mileageData.employeeId;
  const firmId = mileageData.firmId;

  receiptMap.mileage = { employeeId, firmId };
  await updateSession(session.id, {
    step: "MILEAGE_FROM",
    pending_receipt: receiptMap as Prisma.InputJsonValue,
  });

  await sendTextMessage(phone, "No problem, let's start over. Where did you start from?");
}
