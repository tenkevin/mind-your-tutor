import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileObjectStore } from '@ideamap/connectors';
import { createDb, migrateUp } from '@ideamap/db';
import { createBoss, orgScope, registerWorkers } from '@ideamap/worker';
import { loadConfig } from '../config.js';
import { buildServer, startImports } from '../index.js';
import { startMockIdp } from './mock-idp.js';
import { mockProviders, SAMPLE_PROVIDERS, seedSample } from './sample.js';

// `pnpm dev:auth`: one command for local sign-in (F5-U4). Migrates the local database,
// seeds the sample orgs and users once, starts the mock identity provider and starts
// the API wired to it, with curriculum imports and an import worker in this process (so
// an upload goes all the way to a draft). Then run the apps
// (`pnpm --filter @ideamap/teacher dev`).
// Local only: secrets are random per run, and the database is the compose one.

const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/ideamap';
const idpPort = Number(process.env.MOCK_IDP_PORT ?? 4010);
const apiPort = Number(process.env.PORT ?? 3000);

const db = createDb(databaseUrl);
await migrateUp(db);
const seeded = await db
  .selectFrom('organization')
  .select('id')
  .where('name', '=', 'Example District A')
  .executeTakeFirst();
if (!seeded) await seedSample(db);

const clientId = 'ideamap-local';
const clientSecret = randomBytes(24).toString('base64url');
const idp = await startMockIdp({
  providers: mockProviders(),
  clientId,
  clientSecret,
  port: idpPort,
  host: 'localhost',
});

const env: Record<string, string | undefined> = {
  IDEAMAP_APP_ORIGINS: 'http://localhost:5173,http://localhost:5174',
  IDEAMAP_SSO_PROVIDERS: Object.keys(SAMPLE_PROVIDERS).join(','),
  ...process.env,
  IDEAMAP_SESSION_SECRET: randomBytes(32).toString('base64url'),
  IDEAMAP_SSO_ALLOW_HTTP: '1',
};
for (const id of Object.keys(SAMPLE_PROVIDERS)) {
  const key = `IDEAMAP_SSO_${id.toUpperCase()}_`;
  env[`${key}ISSUER`] = idp.issuer(id);
  env[`${key}CLIENT_ID`] = clientId;
  env[`${key}CLIENT_SECRET`] = clientSecret;
}
const config = loadConfig(env);
const uploadDir = process.env.UPLOAD_DIR ?? mkdtempSync(join(tmpdir(), 'ideamap-uploads-'));
const { imports, stop: stopImports } = await startImports(db, databaseUrl, uploadDir);
const workerBoss = createBoss(databaseUrl);
workerBoss.on('error', (error) => console.error(error));
await workerBoss.start();
await registerWorkers({
  boss: workerBoss,
  scope: orgScope(db),
  store: new FileObjectStore(uploadDir),
  pollingIntervalSeconds: 1,
});
const app = buildServer({
  db,
  config,
  logger: false,
  imports,
  publish: { deps: { scope: orgScope(db) } },
});
await app.listen({ port: apiPort, host: 'localhost' });

const users = Object.entries(mockProviders())
  .flatMap(([provider, p]) =>
    p.users.map((u) => `  ${provider.padEnd(9)} ${u.key.padEnd(20)} ${u.name}`),
  )
  .join('\n');
console.log(`Mock identity provider: ${idp.url}  (one issuer per provider: /google, /clever, /classlink)
API: http://localhost:${apiPort}  (uploads in ${uploadDir})
Apps: http://localhost:5173 (teacher), http://localhost:5174 (student); start them with
  pnpm --filter @ideamap/teacher dev   and   pnpm --filter @ideamap/student dev

Sample users (pick one on the mock sign-in page):
${users}

Ctrl-C to stop.`);

const stop = async () => {
  await app.close();
  await stopImports();
  await workerBoss.stop({ graceful: true });
  await idp.close();
  await db.destroy();
  process.exit(0);
};
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
