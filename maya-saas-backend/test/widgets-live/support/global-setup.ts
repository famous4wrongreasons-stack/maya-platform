// Runs once, in the parent process, before any suite is loaded: a refused or missing DATABASE_URL
// stops the whole run here, before a single module that could connect has been imported.

import { assertProofDatabase } from './proof-db-guard';

export default function globalSetup(): void {
  const database = assertProofDatabase(process.env);
  process.stdout.write(
    `widgets-live: proof database ${database.database} on ${database.host}:${database.port} (${database.mode})\n`,
  );
}
