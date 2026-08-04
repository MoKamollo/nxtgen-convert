import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";

type Database = NodePgDatabase<typeof schema>;
type TenantStore = { tenantId: string; database: Database };

const globalForDb = globalThis as typeof globalThis & {
  __nxtgenConvertPostgresqlPool?: Pool;
  __nxtgenConvertRootDatabase?: Database;
};

function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for database operations");
  }
  return databaseUrl;
}

export function getPool(): Pool {
  if (!globalForDb.__nxtgenConvertPostgresqlPool) {
    globalForDb.__nxtgenConvertPostgresqlPool = new Pool({
      connectionString: requireDatabaseUrl(),
      ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: true } : undefined,
    });
  }
  return globalForDb.__nxtgenConvertPostgresqlPool;
}

function getRootDatabase(): Database {
  if (!globalForDb.__nxtgenConvertRootDatabase) {
    globalForDb.__nxtgenConvertRootDatabase = drizzle(getPool(), { schema });
  }
  return globalForDb.__nxtgenConvertRootDatabase;
}

/**
 * Lazy pool proxy. Importing server modules during `next build` must not open a
 * database connection or require runtime credentials. The real Pool is created
 * only when a database method is first used.
 */
export const pool = new Proxy({} as Pool, {
  get(_target, property) {
    const active = getPool();
    const value = Reflect.get(active, property, active);
    return typeof value === "function" ? value.bind(active) : value;
  },
});

const tenantStorage = new AsyncLocalStorage<TenantStore>();

/**
 * Tenant-aware lazy Drizzle proxy. Route modules can be compiled and bundled
 * without `DATABASE_URL`; runtime database access still fails closed with a
 * clear configuration error.
 */
export const db = new Proxy({} as Database, {
  get(_target, property) {
    const active = tenantStorage.getStore()?.database ?? getRootDatabase();
    const value = Reflect.get(active, property, active);
    return typeof value === "function" ? value.bind(active) : value;
  },
});

export async function withTenantDatabase<T>(tenantId: string, callback: () => Promise<T>): Promise<T> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)) {
    throw new Error("Invalid tenant context");
  }

  const current = tenantStorage.getStore();
  if (current) {
    if (current.tenantId !== tenantId) throw new Error("Cross tenant database context switch rejected");
    return callback();
  }

  const client = await getPool().connect();
  try {
    await client.query("SELECT set_config('app.tenant_id', $1, false)", [tenantId]);
    const tenantDb: Database = drizzle(client, { schema });
    return await tenantStorage.run({ tenantId, database: tenantDb }, callback);
  } finally {
    try {
      await client.query("RESET app.tenant_id");
    } finally {
      client.release();
    }
  }
}
