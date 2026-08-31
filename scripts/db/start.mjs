import { existsSync } from 'node:fs';
import { writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import { config, runtime, dataDir, markerPath, logPath, binaries, run, connect, verifyOwner, prepareRuntime } from './config.mjs';

await prepareRuntime();
const occupied = await new Promise((resolve) => {
  const socket = net.connect({ host: config.host, port: config.port });
  socket.once('connect', () => { socket.destroy(); resolve(true); });
  socket.once('error', () => resolve(false));
  socket.setTimeout(1500, () => { socket.destroy(); resolve(false); });
});

if (occupied) {
  await verifyOwner();
  const client = await connect();
  await client.end();
  console.log(`Dongmen PostgreSQL is already running on ${config.host}:${config.port}.`);
} else {
  if (!existsSync(path.join(dataDir, 'PG_VERSION'))) {
    const passwordFile = path.join(runtime, `db-password-${randomUUID()}.tmp`);
    await writeFile(passwordFile, `${config.password}\n`, { mode: 0o600 });
    try {
      await run(binaries.initdb, ['-D', dataDir, '--username', config.user, '--pwfile', passwordFile, '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C']);
    } finally {
      await unlink(passwordFile).catch(() => {});
    }
    await writeFile(markerPath, JSON.stringify({ application: 'DongmenSeafoodHub', dataDir, port: config.port }, null, 2));
  }
  await verifyOwner();
  await run(binaries.pg_ctl, ['start', '-D', dataDir, '-l', logPath, '-o', `-h 127.0.0.1 -p ${config.port}`, '-w', '-t', '30']);
  const client = await connect();
  try {
    const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [config.database]);
    if (!result.rowCount) await client.query(`CREATE DATABASE "${config.database}"`);
    const version = await client.query('SHOW server_version');
    console.log(`PostgreSQL ${version.rows[0].server_version} ready: ${config.host}:${config.port}/${config.database}`);
    console.log('Persistent local data: .runtime/postgres. No schema or seed changes were made.');
  } finally { await client.end(); }
}
