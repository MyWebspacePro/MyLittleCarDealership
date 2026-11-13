import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

/**
 * Audit-Eintrag schreiben. Fehler werden bewusst geschluckt: ein fehlgeschlagenes
 * Logging darf den eigentlichen Geschäftsfall (Login, Änderung …) nicht kippen.
 */
export async function audit(
  userId: string | null,
  action: string,
  entity?: string,
  entityId?: string,
  meta?: Record<string, unknown>,
  ip?: string,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entity: entity ?? null,
        entityId: entityId ?? null,
        meta: (meta ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: ip ?? null,
      },
    });
  } catch (err) {
    console.error("audit failed", action, err);
  }
}