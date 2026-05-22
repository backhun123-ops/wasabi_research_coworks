import { createPool } from "@vercel/postgres";

let pool;

function getConnectionString() {
  return (
    process.env.POSTGRES_URL ??
    process.env.DATABASE_POSTGRES_URL ??
    process.env.DATABASE_URL ??
    process.env.DATABASE_POSTGRES_PRISMA_URL
  );
}

function getPool() {
  if (!pool) {
    const connectionString = getConnectionString();
    pool = connectionString
      ? createPool({ connectionString })
      : createPool();
  }
  return pool;
}

export function sql(strings, ...values) {
  return getPool().sql(strings, ...values);
}
