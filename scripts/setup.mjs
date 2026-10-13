import { existsSync, mkdirSync, writeFileSync, openSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { Client } from 'pg';

const require = createRequire(import.meta.url);

mkdirSync('.data', { recursive: true, mode: 0o700 });
if (!existsSync('.env')) {
  writeFileSync(
    '.env',
    `DATABASE_URL="postgresql://consulease:${randomBytes(24).toString('hex')}@127.0.0.1:54329/consulease"\nAPP_ORIGIN="http://127.0.0.1:3000"\n`,
    { mode: 0o600, flag: 'wx' },
  );
  console.log('Created private local development configuration.');
}
process.loadEnvFile('.env');
async function ready() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 1200,
  });
  try {
    await client.connect();
    await client.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}
const url = new URL(process.env.DATABASE_URL);
if (!(await ready())) {
  if (!['localhost', '127.0.0.1'].includes(url.hostname))
    throw new Error(
      'Configured PostgreSQL is unreachable. Check its access and credentials.',
    );
  const log = openSync('.data/database.log', 'a', 0o600);
  const child = spawn(
    process.execPath,
    ['--env-file=.env', 'scripts/database.mjs'],
    { detached: true, stdio: ['ignore', log, log] },
  );
  child.unref();
  let isReady = false;
  for (let n = 0; n < 40; n++) {
    if (await ready()) {
      isReady = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!isReady)
    throw new Error(
      'Local database did not start. Inspect .data/database.log.',
    );
}
// Invoke each package's JavaScript entry point with Node. Launching npx.cmd
// directly fails on Windows, and using a shell would add quoting hazards.
for (const [packageName, binName, args] of [
  ['prisma', 'prisma', ['generate']],
  ['prisma', 'prisma', ['migrate', 'deploy']],
  ['tsx', 'tsx', ['prisma/seed.ts']],
]) {
  const manifestPath = require.resolve(`${packageName}/package.json`);
  const manifest = require(manifestPath);
  const entry =
    typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[binName];
  if (!entry)
    throw new Error(`Cannot find the ${binName} command. Run npm ci first.`);
  const result = spawnSync(
    process.execPath,
    [resolve(dirname(manifestPath), entry), ...args],
    { stdio: 'inherit', env: process.env },
  );
  if (result.error) {
    console.error(`Unable to start ${binName}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(
      `${binName} ${args.join(' ')} failed${result.signal ? ` (${result.signal})` : ''}.`,
    );
    process.exit(result.status ?? 1);
  }
}
console.log(
  'Database is ready; migrations applied and demo data available. Start the app with npm run dev.',
);
