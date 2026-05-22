import { NextResponse } from "next/server";
import { sql } from "../db";

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

function mapProposal(row) {
  return {
    id: String(row.id),
    category: row.category ?? "논문",
    status: row.status ?? "검토중",
    title: row.title ?? "",
    paperTitle: row.paper_title ?? "",
    paperUrl: row.paper_url ?? "",
    algorithm: row.algorithm ?? "",
    discussion: row.discussion ?? "",
    author: row.author ?? "Team",
    createdAt: row.created_at?.toISOString?.() ?? row.created_at ?? "",
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at ?? "",
  };
}

function getErrorMessage(error, fallback) {
  return error instanceof Error ? error.message : fallback;
}

async function ensureProposalsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS research_proposals (
      id UUID PRIMARY KEY,
      category TEXT NOT NULL DEFAULT '논문',
      status TEXT NOT NULL DEFAULT '검토중',
      title TEXT NOT NULL DEFAULT '',
      paper_title TEXT NOT NULL DEFAULT '',
      paper_url TEXT NOT NULL DEFAULT '',
      algorithm TEXT NOT NULL DEFAULT '',
      discussion TEXT NOT NULL DEFAULT '',
      author TEXT NOT NULL DEFAULT 'Team',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`ALTER TABLE research_proposals ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT '논문'`;
  await sql`ALTER TABLE research_proposals ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT '검토중'`;
  await sql`ALTER TABLE research_proposals ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE research_proposals ADD COLUMN IF NOT EXISTS paper_title TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE research_proposals ADD COLUMN IF NOT EXISTS paper_url TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE research_proposals ADD COLUMN IF NOT EXISTS algorithm TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE research_proposals ADD COLUMN IF NOT EXISTS discussion TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE research_proposals ADD COLUMN IF NOT EXISTS author TEXT NOT NULL DEFAULT 'Team'`;
  await sql`ALTER TABLE research_proposals ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`;
  await sql`ALTER TABLE research_proposals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`;
  await sql`CREATE INDEX IF NOT EXISTS research_proposals_updated_at_idx ON research_proposals (updated_at DESC)`;
}

async function fetchProposals() {
  const { rows } = await sql`
    SELECT
      id,
      category,
      status,
      title,
      paper_title,
      paper_url,
      algorithm,
      discussion,
      author,
      created_at,
      updated_at
    FROM research_proposals
    ORDER BY updated_at DESC, created_at DESC
  `;

  return rows.map(mapProposal);
}

export async function GET() {
  try {
    await ensureProposalsTable();
    return NextResponse.json({ proposals: await fetchProposals(), persisted: true });
  } catch (error) {
    console.error("/api/proposals GET failed", error);
    return NextResponse.json(
      {
        proposals: [],
        persisted: false,
        error: getErrorMessage(error, "Failed to load research proposals"),
      },
      { status: 200 },
    );
  }
}

async function upsertProposal(request) {
  let body;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = body.id ?? createId();
  const title = String(body.title ?? "").trim();
  const discussion = String(body.discussion ?? "").trim();

  if (!title && !discussion) {
    return NextResponse.json({ error: "title or discussion is required" }, { status: 400 });
  }

  try {
    await ensureProposalsTable();

    const { rows } = await sql`
      INSERT INTO research_proposals (
        id,
        category,
        status,
        title,
        paper_title,
        paper_url,
        algorithm,
        discussion,
        author,
        updated_at
      )
      VALUES (
        ${id},
        ${body.category ?? "논문"},
        ${body.status ?? "검토중"},
        ${title},
        ${body.paperTitle ?? ""},
        ${body.paperUrl ?? ""},
        ${body.algorithm ?? ""},
        ${discussion},
        ${body.author ?? "Team"},
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        category = EXCLUDED.category,
        status = EXCLUDED.status,
        title = EXCLUDED.title,
        paper_title = EXCLUDED.paper_title,
        paper_url = EXCLUDED.paper_url,
        algorithm = EXCLUDED.algorithm,
        discussion = EXCLUDED.discussion,
        author = EXCLUDED.author,
        updated_at = NOW()
      RETURNING
        id,
        category,
        status,
        title,
        paper_title,
        paper_url,
        algorithm,
        discussion,
        author,
        created_at,
        updated_at
    `;

    return NextResponse.json({ proposal: mapProposal(rows[0]), persisted: true });
  } catch (error) {
    console.error("/api/proposals write failed", error);
    return NextResponse.json(
      {
        proposal: {
          id,
          category: body.category ?? "논문",
          status: body.status ?? "검토중",
          title,
          paperTitle: body.paperTitle ?? "",
          paperUrl: body.paperUrl ?? "",
          algorithm: body.algorithm ?? "",
          discussion,
          author: body.author ?? "Team",
          createdAt: body.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        persisted: false,
        error: getErrorMessage(error, "Failed to save research proposal"),
      },
      { status: 200 },
    );
  }
}

export async function POST(request) {
  return upsertProposal(request);
}

export async function PUT(request) {
  return upsertProposal(request);
}
