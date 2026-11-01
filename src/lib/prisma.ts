import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

// IMPORTANT: PrismaClient is constructed lazily, on first actual use —
// not here at module load time. Next.js's "Collecting page data" build
// step imports every API route module just to inspect its exports, which
// would otherwise construct PrismaClient (and start its native query
// engine's internal thread pool) during the build itself. That crashed on
// Hostinger's build container, which enforces a very low OS thread/process
// limit ("OS can't spawn worker thread: Resource temporarily unavailable").
//
// Deferring construction to first property access means the build never
// touches the real engine, so we can safely use Prisma's default "library"
// engine (the officially recommended, best-supported option) instead of
// the "binary" engine — which runs as a separate long-lived background
// process, something Hostinger's managed Web App hosting does not support
// (confirmed via support: no persistent background workers of any kind).
//
// Every existing call site (`prisma.user.findMany(...)` etc.) keeps
// working unchanged — the Proxy forwards property access to the real
// client once it exists.
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, _receiver) {
    if (!globalForPrisma.prisma) {
      globalForPrisma.prisma = createPrismaClient();
    }
    const client = globalForPrisma.prisma as unknown as Record<string | symbol, unknown>;
    const value = client[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
});
