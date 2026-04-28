import { PrismaClient } from "@/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const SOFT_DELETE_MODELS = new Set(['Invoice', 'SalesInvoice', 'Claim', 'Payment']);
const READ_OPS = new Set(['findFirst', 'findMany', 'count', 'aggregate', 'groupBy']);

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createExtendedClient> | undefined;
  prismaUnfiltered: PrismaClient | undefined;
  pgPool: Pool | undefined;
};

function createBaseClient() {
  // Reuse pg Pool across hot reloads and serverless invocations
  const pool = globalForPrisma.pgPool ?? new Pool({
    connectionString: process.env.DATABASE_URL!,
    max: 5, // Limit connections per serverless instance
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  globalForPrisma.pgPool = pool;

  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log: ["error"],
  });
}

function createExtendedClient(base: PrismaClient) {
  return base.$extends({
    query: {
      $allOperations({ model, operation, args, query }) {
        if (!model || !SOFT_DELETE_MODELS.has(model)) return query(args);

        // findUnique can't accept non-unique fields in where — convert to findFirst
        if (operation === 'findUnique') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (base as any)[lowerFirst(model)].findFirst({
            ...args,
            where: { ...args.where, deleted_at: null },
          });
        }
        if (operation === 'findUniqueOrThrow') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (base as any)[lowerFirst(model)].findFirstOrThrow({
            ...args,
            where: { ...args.where, deleted_at: null },
          });
        }

        if (READ_OPS.has(operation)) {
          args.where = { ...args.where, deleted_at: null };
        }
        return query(args);
      },
    },
  });
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// Base client without soft-delete filter — only for restore API + hard-delete cron
const baseClient = globalForPrisma.prismaUnfiltered ?? createBaseClient();
globalForPrisma.prismaUnfiltered = baseClient;

// Extended client with auto-filter: all reads exclude deleted_at IS NOT NULL
export const prisma = globalForPrisma.prisma ?? createExtendedClient(baseClient);
globalForPrisma.prisma = prisma;

// Unfiltered client — use ONLY in restore API and hard-delete cron
export const prismaUnfiltered = baseClient;
