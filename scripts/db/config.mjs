import { existsSync } from 'node:fs';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import pg from 'pg';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
if (existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));
if (process.env.NODE_ENV === 'production') throw new Error('Bundled PostgreSQL is for local development only. Configure a managed production database.');

const databaseUrl = new URL(process.env.DATABASE_URL ?? 'postgresql://dongmen:DongmenLocal2026%21@127.0.0.1:54329/dongmen');
if (!['127.0.0.1', 'localhost'].includes(databaseUrl.hostname) || databaseUrl.port !== '54329') {
  throw new Error('Local database scripts only manage loopback port 54329. They never manage external databases.');
}
export const config = {
  host: '127.0.0.1',
  port: 54329,
  user: decodeURIComponent(databaseUrl.username),
  password: decodeURIComponent(databaseUrl.password),
  database: databaseUrl.pathname.slice(1),
  connectionTimeoutMillis: 1500,
};
if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(config.database) || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(config.user)) {
  throw new Error('Local database and user names must be simple PostgreSQL identifiers.');
}
export const runtime = path.join(root, '.runtime');
export const dataDir = path.join(runtime, 'postgres');
export const markerPath = path.join(runtime, 'db-owner.json');
export const logPath = path.join(runtime, 'postgres.log');
export const binaries = await import(`@embedded-postgres/${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`);

export async function run(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.once('error', reject);
    child.once('exit', (code) => {
      // pg_ctl can leave inherited pipe handles open in its detached server.
      // The launcher must still exit once the control command has finished.
      child.stdout.destroy();
      child.stderr.destroy();
      if (code === 0) resolve(output);
      else reject(new Error(`${path.basename(executable)} failed (${code}): ${output}`));
    });
  });
}

export async function verifyOwner() {
  const marker = JSON.parse(await readFile(markerPath, 'utf8'));
  if (marker.application !== 'DongmenSeafoodHub' || path.resolve(marker.dataDir) !== dataDir || marker.port !== config.port) {
    throw new Error('Database ownership marker does not match this workspace; refusing to manage it.');
  }
}

export async function connect(database = 'postgres') {
  const client = new pg.Client({ ...config, database });
  try {
    await client.connect();
    const result = await client.query('SHOW data_directory');
    if (path.resolve(result.rows[0].data_directory).toLowerCase() !== dataDir.toLowerCase()) {
      throw new Error('The listening PostgreSQL server belongs to another workspace; refusing to manage it.');
    }
    return client;
  } catch (error) {
    await client.end().catch(() => {});
    throw error;
  }
}

export async function prepareRuntime() { await mkdir(runtime, { recursive: true }); }
