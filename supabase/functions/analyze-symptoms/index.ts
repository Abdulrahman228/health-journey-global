const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type AnalyzeSymptomsRequest = {
  symptoms?: string[];
  specialty?: string;
};

type AiAnalysis = {
  diagnoses: string[];
  tests: string[];
  treatment: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  try {
    const body = (await req.json()) as AnalyzeSymptomsRequest;
    const symptoms = sanitizeSymptoms(body.symptoms);
    const specialty = sanitizeText(body.specialty ?? "general medicine", 80);

    if (symptoms.length === 0) {
      return jsonResponse({ error: "symptoms_required" }, 400);
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return jsonResponse({ error: "OPENAI_API_KEY is not configured" }, 500);
    }

    const model = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini";
    const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content:
              "You are a clinical decision support assistant for licensed physicians. Return concise Arabic medical decision support only. Do not make a final diagnosis, do not replace clinical judgment, and include urgent red flags when appropriate.",
          },
          {
            role: "user",
            content: [
              `Specialty: ${specialty}`,
              `Symptoms: ${symptoms.join(", ")}`,
              "Return likely differential diagnoses, suggested tests/imaging, and an initial treatment/management plan for physician review.",
            ].join("\n"),
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "tabibi_symptom_analysis",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                diagnoses: {
                  type: "array",
                  items: { type: "string" },
                  minItems: 1,
                  maxItems: 6,
                },
                tests: {
                  type: "array",
                  items: { type: "string" },
                  minItems: 1,
                  maxItems: 8,
                },
                treatment: {
                  type: "string",
                  minLength: 1,
                },
              },
              required: ["diagnoses", "tests", "treatment"],
            },
          },
        },
      }),
    });

    const payload = await openAiResponse.json();
    if (!openAiResponse.ok) {
      return jsonResponse(
        {
          error: "ai_provider_error",
          details: payload?.error?.message ?? "OpenAI request failed",
        },
        openAiResponse.status,
      );
    }

    const text = extractOutputText(payload);
    const analysis = JSON.parse(text) as AiAnalysis;
    return jsonResponse(normalizeAnalysis(analysis), 200);
  } catch (error) {
    return jsonResponse(
      {
        error: "analysis_failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

function sanitizeSymptoms(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => sanitizeText(String(item), 140))
    .filter(Boolean)
    .slice(0, 20);
}

function sanitizeText(value: string, maxLength: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function extractOutputText(payload: any): string {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  const output = Array.isArray(payload?.output) ? payload.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === "string" && part.text.trim()) {
        return part.text;
      }
    }
  }

  throw new Error("No structured response text returned from AI provider.");
}

function normalizeAnalysis(value: AiAnalysis): AiAnalysis {
  return {
    diagnoses: normalizeList(value.diagnoses),
    tests: normalizeList(value.tests),
    treatment: sanitizeText(value.treatment ?? "", 4_000),
  };
}

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => sanitizeText(String(item), 240)).filter(Boolean);
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
