import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workflows } from "@/db/schema";
import Groq from "groq-sdk";

function extractJson(value: string) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? value;
  const start = fenced.indexOf("{"); const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object returned");
  return JSON.parse(fenced.slice(start, end + 1)) as Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  const orgId = request.headers.get("x-tenant-id");
  const userId = request.headers.get("x-user-id");
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const { description } = await request.json();
    if (!String(description ?? "").trim()) return NextResponse.json({ error: "Describe the workflow you want" }, { status: 400 });
    if (!process.env.GROQ_API_KEY) return NextResponse.json({ error: "GROQ_API_KEY is not configured" }, { status: 503 });
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0.2,
      messages: [
        { role: "system", content: "Return only valid JSON with this exact shape: {\"name\":string,\"description\":string,\"trigger\":{\"event\":string},\"steps\":[{\"type\":string,\"action\":string,\"config\":object}]}. Use only business automation actions such as send_email, wait, create_task, update_contact, create_deal, notify_owner." },
        { role: "user", content: String(description) },
      ],
    });
    const generated = extractJson(completion.choices[0]?.message?.content ?? "");
    if (!generated.name || !generated.trigger || !Array.isArray(generated.steps)) throw new Error("Invalid workflow structure");
    const [created] = await db.insert(workflows).values({ organizationId: orgId, name: String(generated.name).slice(0, 120), description: String(generated.description ?? description), status: "draft", trigger: generated.trigger, steps: generated.steps, createdById: userId || null }).returning();
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to generate workflow" }, { status: 500 });
  }
}
