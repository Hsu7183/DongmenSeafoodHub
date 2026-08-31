import { existsSync } from 'node:fs';
import path from 'node:path';
import { dataDir, binaries, run, connect, verifyOwner } from './config.mjs';

if (!existsSync(path.join(dataDir, 'postmaster.pid'))) {
  console.log('Dongmen local PostgreSQL is already stopped. Data remains unchanged.');
} else {
  await verifyOwner();
  const client = await connect();
  await client.end();
  await run(binaries.pg_ctl, ['stop', '-D', dataDir, '-m', 'fast', '-w', '-t', '30']);
  console.log('Dongmen local PostgreSQL stopped cleanly. Data remains in .runtime/postgres.');
}
