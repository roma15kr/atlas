/**
 * A Postgres port for this test worker. Vitest gives each concurrently running worker a distinct
 * VITEST_POOL_ID, and files within one worker run one after another (each harness stops before the
 * next starts), so ports can't collide the way random ones occasionally did.
 */
export function testDatabasePort(): number {
  const worker = Number(process.env.VITEST_POOL_ID) || 0;
  return 41000 + worker * 10;
}
