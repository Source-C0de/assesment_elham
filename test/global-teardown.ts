/**
 * Jest global teardown. Disconnect the Prisma client by clearing its module cache;
 * a real cleanup of the DB rows happens at the start of each test file to keep
 * the suite isolated. Database itself is left in place for debugging.
 */
export default async function globalTeardown(): Promise<void> {
  // Nothing to do; each test app instance handles its own PrismaService lifecycle
  // via Nest's onModuleDestroy hook.
}
