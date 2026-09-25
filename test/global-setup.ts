/**
 * Jest global setup: applies Prisma migrations against the test DB so the suite
 * has a clean, fresh schema. Idempotent: `prisma migrate deploy` is safe to re-run.
 *
 * Pre-requisite (caller must have done):
 *   - Created the database (`createdb booking_test` or equivalent)
 *   - Set DATABASE_URL pointing at it via .env.test
 *
 * We load .env.test explicitly because Prisma's CLI is invoked via `execSync`
 * without inheriting the NODE_ENV=test auto-load that some configurations expect.
 */
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export default async function globalSetup(): Promise<void> {
  // Load .env.test into process.env so prisma cli sees DATABASE_URL.
  const envFile = path.join(process.cwd(), '.env.test');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx < 0) continue;
      const k = trimmed.slice(0, idx).trim();
      let v = trimmed.slice(idx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[k] = v;
    }
  }

  // Apply pending migrations. We don't run `migrate dev` (which would create
  // a new migration file); we run `migrate deploy` which applies existing ones.
  execSync('npx prisma migrate deploy --schema prisma/schema.prisma', {
    stdio: 'inherit',
    env: process.env,
  });

  // Generate the prisma client at the latest schema (in case it hasn't been built yet).
  execSync('npx prisma generate --schema prisma/schema.prisma', {
    stdio: 'inherit',
    env: process.env,
  });
}
