import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function mapMessage(row) {
  return {
    id: row.id,
    author: row.author,
    message: row.message,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
  };
}

export async function GET() {
  const { rows } = await sql`
    SELECT id, author, message, created_at
    FROM messages
    ORDER BY created_at DESC
    LIMIT 100
  `;
  return NextResponse.json({ messages: rows.map(mapMessage) });
}

export async function POST(request) {
  const body = await request.json();
  const author = String(body.author ?? "팀원").trim() || "팀원";
  const message = String(body.message ?? "").trim();

  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const { rows } = await sql`
    INSERT INTO messages (author, message)
    VALUES (${author}, ${message})
    RETURNING id, author, message, created_at
  `;

  return NextResponse.json({ message: mapMessage(rows[0]) }, { status: 201 });
}
