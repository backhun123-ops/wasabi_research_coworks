import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) =>
    (
      Number(char) ^
      ((Math.random() * 16) >> (Number(char) / 4))
    ).toString(16),
  );
}

function mapMessage(row) {
  return {
    id: String(row.id),
    author: row.author ?? "System",
    message: row.message ?? "",
    createdAt: row.created_at?.toISOString?.() ?? row.created_at ?? "",
  };
}

function fallbackMessage() {
  return {
    id: createId(),
    author: "System",
    message: "Lab log board is ready.",
    createdAt: new Date().toISOString(),
  };
}

function getErrorMessage(error, fallback) {
  return error instanceof Error ? error.message : fallback;
}

async function ensureMessagesTable() {
  try {
    await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
  } catch (error) {
    console.warn("pgcrypto extension could not be ensured", error);
  }

  await sql`
    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY,
      author TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS author TEXT`;
  await sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS message TEXT`;
  await sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`;
  await sql`CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages (created_at DESC)`;
}

export async function GET() {
  try {
    await ensureMessagesTable();

    const { rows } = await sql`
      SELECT id, author, message, created_at
      FROM messages
      ORDER BY created_at DESC
      LIMIT 100
    `;

    return NextResponse.json({
      messages: rows.length > 0 ? rows.map(mapMessage) : [fallbackMessage()],
      persisted: true,
    });
  } catch (error) {
    console.error("/api/chat GET failed", error);

    return NextResponse.json(
      {
        messages: [fallbackMessage()],
        persisted: false,
        error: getErrorMessage(error, "Failed to load chat messages"),
      },
      { status: 200 },
    );
  }
}

export async function POST(request) {
  let body;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = body.id ?? createId();
  const author = String(body.author ?? "Team").trim() || "Team";
  const message = String(body.message ?? "").trim();

  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  try {
    await ensureMessagesTable();

    const { rows } = await sql`
      INSERT INTO messages (id, author, message)
      VALUES (${id}, ${author}, ${message})
      ON CONFLICT (id) DO UPDATE SET
        author = EXCLUDED.author,
        message = EXCLUDED.message
      RETURNING id, author, message, created_at
    `;

    return NextResponse.json(
      { message: mapMessage(rows[0]), persisted: true },
      { status: 201 },
    );
  } catch (error) {
    console.error("/api/chat POST failed", error);

    return NextResponse.json(
      {
        message: {
          id,
          author,
          message,
          createdAt: body.createdAt ?? new Date().toISOString(),
        },
        persisted: false,
        error: getErrorMessage(error, "Failed to save chat message"),
      },
      { status: 200 },
    );
  }
}
