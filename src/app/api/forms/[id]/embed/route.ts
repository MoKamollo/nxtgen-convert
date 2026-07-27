import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { marketingForms } from "@/db/schema";
import { normalizeFormFields, type MarketingFormField } from "@/lib/form-fields";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

type EmbedConfiguration = {
  id: string;
  name: string;
  description: string;
  fields: MarketingFormField[];
  endpoint: string;
};

const EMBED_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.nxg-wrap { font-family: Inter, ui-sans-serif, system-ui, sans-serif; max-width: 640px; color: #e8edf7; background: #0b1120; border: 1px solid #263247; border-radius: 14px; padding: 24px; }
.nxg-title { margin: 0; color: #fff; font-size: 22px; line-height: 1.25; }
.nxg-description { margin: 8px 0 20px; color: #94a3b8; font-size: 14px; line-height: 1.6; }
.nxg-field { display: block; margin-top: 14px; }
.nxg-label { display: block; margin-bottom: 6px; color: #cbd5e1; font-size: 12px; font-weight: 600; }
.nxg-input, .nxg-select, .nxg-textarea { width: 100%; border: 1px solid #334155; border-radius: 8px; background: #111827; color: #f8fafc; padding: 10px 12px; font: inherit; font-size: 14px; outline: none; }
.nxg-input:focus, .nxg-select:focus, .nxg-textarea:focus { border-color: #6c63ff; box-shadow: 0 0 0 3px rgba(108, 99, 255, .16); }
.nxg-textarea { min-height: 110px; resize: vertical; }
.nxg-check { display: flex; align-items: center; gap: 8px; color: #cbd5e1; font-size: 13px; }
.nxg-button { width: 100%; margin-top: 18px; border: 0; border-radius: 8px; padding: 11px 16px; color: white; background: linear-gradient(135deg, #6c63ff, #009fe7); font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
.nxg-button:disabled { cursor: wait; opacity: .65; }
.nxg-message { min-height: 18px; margin-top: 12px; font-size: 12px; }
.nxg-success { color: #34d399; }
.nxg-error { color: #f87171; }
.nxg-hp { position: absolute !important; left: -10000px !important; width: 1px !important; height: 1px !important; overflow: hidden !important; }
`;

function renderEmbeddedForm(config: EmbedConfiguration, css: string) {
  const script = document.currentScript;
  if (!script?.parentNode) return;

  const host = document.createElement("div");
  host.setAttribute("data-nxtgen-form", config.id);
  script.parentNode.insertBefore(host, script.nextSibling);
  const root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
  const style = document.createElement("style");
  style.textContent = css;
  root.appendChild(style);

  const wrapper = document.createElement("div");
  wrapper.className = "nxg-wrap";
  const title = document.createElement("h2");
  title.className = "nxg-title";
  title.textContent = config.name;
  wrapper.appendChild(title);
  if (config.description) {
    const description = document.createElement("p");
    description.className = "nxg-description";
    description.textContent = config.description;
    wrapper.appendChild(description);
  }

  const form = document.createElement("form");
  form.noValidate = true;
  const honeypot = document.createElement("input");
  honeypot.name = "_nxg_website";
  honeypot.tabIndex = -1;
  honeypot.autocomplete = "off";
  honeypot.className = "nxg-hp";
  form.appendChild(honeypot);

  for (const field of config.fields) {
    const label = document.createElement("label");
    label.className = "nxg-field";
    if (field.type === "checkbox") {
      label.className += " nxg-check";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = field.id;
      input.required = field.required;
      label.appendChild(input);
      label.appendChild(document.createTextNode(`${field.label}${field.required ? " *" : ""}`));
    } else {
      const labelText = document.createElement("span");
      labelText.className = "nxg-label";
      labelText.textContent = `${field.label}${field.required ? " *" : ""}`;
      label.appendChild(labelText);
      let input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      if (field.type === "textarea") {
        input = document.createElement("textarea");
        input.className = "nxg-textarea";
      } else if (field.type === "select") {
        input = document.createElement("select");
        input.className = "nxg-select";
        const empty = document.createElement("option");
        empty.value = "";
        empty.textContent = "Select an option";
        input.appendChild(empty);
        for (const option of field.options ?? []) {
          const optionElement = document.createElement("option");
          optionElement.value = option;
          optionElement.textContent = option;
          input.appendChild(optionElement);
        }
      } else {
        input = document.createElement("input");
        input.type = field.type === "phone" ? "tel" : field.type;
        input.className = "nxg-input";
      }
      input.name = field.id;
      input.required = field.required;
      label.appendChild(input);
    }
    form.appendChild(label);
  }

  const button = document.createElement("button");
  button.className = "nxg-button";
  button.type = "submit";
  button.textContent = "Submit";
  form.appendChild(button);
  const message = document.createElement("div");
  message.className = "nxg-message";
  form.appendChild(message);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    button.disabled = true;
    message.className = "nxg-message";
    message.textContent = "Submitting...";
    const payload: Record<string, string | boolean> = { _nxg_website: honeypot.value };
    for (const field of config.fields) {
      const element = form.elements.namedItem(field.id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
      payload[field.id] = field.type === "checkbox" ? Boolean(element && "checked" in element && element.checked) : String(element?.value ?? "");
    }
    try {
      const response = await fetch(config.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Submission failed");
      form.reset();
      message.className = "nxg-message nxg-success";
      message.textContent = "Thank you. Your response was submitted.";
    } catch (error) {
      message.className = "nxg-message nxg-error";
      message.textContent = error instanceof Error ? error.message : "Submission failed";
    } finally {
      button.disabled = false;
    }
  });

  wrapper.appendChild(form);
  root.appendChild(wrapper);
}

function javascriptResponse(source: string, status = 200) {
  return new NextResponse(source, {
    status,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const [form] = await db
      .select({
        id: marketingForms.id,
        name: marketingForms.name,
        description: marketingForms.description,
        fields: marketingForms.fields,
        status: marketingForms.status,
      })
      .from(marketingForms)
      .where(eq(marketingForms.id, id))
      .limit(1);
    if (!form || form.status !== "active") {
      return javascriptResponse('console.warn("NxtGen form is unavailable");', 404);
    }

    const configuration: EmbedConfiguration = {
      id: form.id,
      name: form.name,
      description: form.description ?? "",
      fields: normalizeFormFields(form.fields),
      endpoint: new URL(`/api/forms/${form.id}/submit`, request.url).toString(),
    };
    const safeConfiguration = JSON.stringify(configuration).replace(/</g, "\\u003c");
    const source = `(${renderEmbeddedForm.toString()})(${safeConfiguration}, ${JSON.stringify(EMBED_CSS)});`;
    return javascriptResponse(source);
  } catch (error) {
    console.error("[form-embed]", error);
    return javascriptResponse('console.error("NxtGen form failed to load");', 500);
  }
}
