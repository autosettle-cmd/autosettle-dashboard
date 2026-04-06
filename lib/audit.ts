import { prisma } from './prisma';
import { AuditAction, Prisma } from '../generated/prisma';

interface AuditLogParams {
  firmId: string;
  tableName: string;
  recordId: string;
  action: AuditAction;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  userId?: string | null;
  userName?: string | null;
}

/**
 * Logs an audit event. Call this selectively in API routes after key actions.
 * Computes changed_fields automatically by diffing oldValues and newValues.
 * Fire-and-forget — does not throw on failure to avoid blocking the main operation.
 */
export async function auditLog(params: AuditLogParams) {
  try {
    const { firmId, tableName, recordId, action, oldValues, newValues, userId, userName } = params;

    // Compute changed fields by diffing old and new values
    let changedFields: string[] | null = null;
    if (oldValues && newValues) {
      changedFields = Object.keys(newValues).filter(
        (key) => JSON.stringify(oldValues[key]) !== JSON.stringify(newValues[key])
      );
      // Skip logging if nothing actually changed
      if (action === 'update' && changedFields.length === 0) return;
    }

    await prisma.auditLog.create({
      data: {
        firm_id: firmId,
        table_name: tableName,
        record_id: recordId,
        action,
        changed_fields: changedFields ? (changedFields as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        old_values: oldValues ? (filterChanged(oldValues, changedFields) as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        new_values: newValues ? (filterChanged(newValues, changedFields) as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        user_id: userId ?? null,
        user_name: userName ?? null,
      },
    });
  } catch (err) {
    // Log but don't throw — audit should never block the main operation
    console.error('[audit] Failed to write audit log:', err);
  }
}

/** Only keep the fields that actually changed (for cleaner diffs) */
function filterChanged(
  values: Record<string, unknown>,
  changedFields: string[] | null
): Record<string, unknown> {
  if (!changedFields) return values;
  const filtered: Record<string, unknown> = {};
  for (const key of changedFields) {
    if (key in values) filtered[key] = values[key];
  }
  return Object.keys(filtered).length > 0 ? filtered : values;
}
