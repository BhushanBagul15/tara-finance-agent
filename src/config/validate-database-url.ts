/**
 * Fail fast when DATABASE_URL was never updated from .env.example.
 */
export function validateDatabaseUrl(): void {
  const url = process.env.DATABASE_URL?.trim();

  if (!url) {
    throw new Error(
      'DATABASE_URL is missing. Copy .env.example to .env and set your Neon or local Postgres URL.',
    );
  }

  const isPlaceholder =
    url.includes('@host/') ||
    url.includes('user:password@host') ||
    url === 'postgresql://user:password@host/db?sslmode=require';

  if (isPlaceholder) {
    throw new Error(
      [
        'DATABASE_URL is still the .env.example placeholder (hostname "host").',
        '',
        'Fix:',
        '  1. Open https://console.neon.tech → your project → Connection string',
        '  2. Copy the pooled URI',
        '  3. In .env set: DATABASE_URL="postgresql://...@ep-xxx.neon.tech/neondb?sslmode=require"',
        '  4. Save .env (Ctrl+S)',
        '  5. Verify: npx tsx -e "import {config} from \'dotenv\'; config(); console.log(process.env.DATABASE_URL?.includes(\'neon.tech\')?\'OK\':\'FAIL\')"',
        '',
        'Then run: npx prisma migrate deploy',
        '         and: npm run ingest',
      ].join('\n'),
    );
  }
}
