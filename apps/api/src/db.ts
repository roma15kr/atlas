import { Pool, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from "pg";
import { config } from "./config";

const connection: PoolConfig = config.DATABASE_URL ? {
  connectionString: config.DATABASE_URL,
  ssl: shouldUseSsl(config.DATABASE_URL) ? { rejectUnauthorized: true } : undefined
} : {
  host: config.POSTGRES_HOST,
  port: config.POSTGRES_PORT,
  database: config.POSTGRES_DB,
  user: config.POSTGRES_USER,
  password: config.POSTGRES_PASSWORD ?? (config.NODE_ENV === "production" ? undefined : "atlas")
};

export const pool = new Pool({
  ...connection,
  max: 12,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: "atlas-api"
});

function shouldUseSsl(connectionString: string): boolean {
  if (config.NODE_ENV !== "production") return false;
  const host = new URL(connectionString).hostname;
  return !["postgres", "localhost", "127.0.0.1", "::1"].includes(host);
}

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error", error);
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: readonly unknown[] = []
): Promise<QueryResult<T>> {
  return pool.query<T>(text, [...values]);
}

export async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
