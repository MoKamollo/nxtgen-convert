import { withApiGuard } from "@/lib/api-guard";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { workflows } from "@/db/schema";
import { eq } from "drizzle-orm";
import Groq from "groq-sdk";
import { validateWorkflowDefinition } from "@/lib/workflow-validation";
import { createDraftWorkflowVersion } from "@/lib/workflow-versions";

function extractJson(value: string) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? value;
  const start = fenced.indexOf("{"); const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object returned");
  return JSON.parse(fenced.slice(start, end + 1)) as Record<string, unknown>;
}

async function POSTHandler(request: NextRequest) {
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
        { role: "system", content: "Return only valid JSON with this exact shape: {\"name\":string,\"description\":string,\"trigger\":{\"event\":string},\"steps\":[{\"type\":string,\"action\":string,\"config\":object}]}. Use only these implemented triggers: contact.created, deal.stage_changed, manual. Use only these implemented step types: send_email, wait, create_activity, update_contact. Each step must have {type,config}." },
        { role: "user", content: String(description) },
      ],
    });
    const generated = extractJson(completion.choices[0]?.message?.content ?? "");
    if (!generated.name || !generated.trigger || !Array.isArray(generated.steps)) throw new Error("Invalid workflow structure");
    const definition = validateWorkflowDefinition({ trigger: generated.trigger, steps: generated.steps });
    const [created] = await db.insert(workflows).values({ organizationId: orgId, name: String(generated.name).slice(0, 120), description: String(generated.description ?? description).slice(0, 2000), status: "draft", trigger: definition.trigger, steps: definition.steps, createdById: userId || null }).returning();
    try {
      const version = await createDraftWorkflowVersion({ organizationId: orgId, workflowId: created.id, definition, createdById: userId || null });
      return NextResponse.json({ data: created, draftVersion: version.version }, { status: 201 });
    } catch (versionError) {
      await db.delete(workflows).where(eq(workflows.id, created.id));
      throw versionError;
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to generate workflow" }, { status: 500 });
  }
}

export const POST = withApiGuard(POSTHandler);
