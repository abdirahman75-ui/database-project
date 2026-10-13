import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const url = new URL(process.env.DATABASE_URL || '');
if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
  throw new Error(
    'db:start starts the local development database only. Use your managed PostgreSQL service directly.',
  );
}
const databaseDir = path.resolve('.data/postgres');
mkdirSync(databaseDir, { recursive: true, mode: 0o700 });
const database = new EmbeddedPostgres({
  databaseDir,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  port: Number(url.port || 5432),
  persistent: true,
  authMethod: 'scram-sha-256',
  postgresFlags: ['-c', 'listen_addresses=127.0.0.1'],
  onLog: () => {},
  onError: (message) => {
    if (!String(message).includes('LOG:')) console.error(String(message));
  },
});
if (!existsSync(path.join(databaseDir, 'PG_VERSION')))
  await database.initialise();
await database.start();
const client = database.getPgClient();
await client.connect();
const name = decodeURIComponent(url.pathname.slice(1));
if (!/^[a-zA-Z0-9_]+$/.test(name))
  throw new Error(
    'Local database name must use letters, numbers, and underscores.',
  );
const found = await client.query(
  'SELECT 1 FROM pg_database WHERE datname = $1',
  [name],
);
await client.end();
if (!found.rowCount) await database.createDatabase(name);
console.log('Local PostgreSQL ready on loopback port ' + url.port);
async function stop() {
  await database.stop();
  process.exit(0);
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
setInterval(() => {}, 60_000);
