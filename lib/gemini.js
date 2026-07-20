const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const TEXT_MODEL = "gemini-3.5-flash";

async function callGemini({ systemPrompt, userMessage, jsonOutput = false, maxTokens = 2000 }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userMessage }] }],
    generationConfig: {
      maxOutputTokens: maxTokens,
      thinkingConfig: { thinkingLevel: "minimal" }
    }
  };
  if (jsonOutput) {
    body.generationConfig.responseMimeType = "application/json";
  }

  const res = await fetch(`${GEMINI_API_URL}/${TEXT_MODEL}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${text}`);
  }

  const data = await res.json();

  if (data.usageMetadata) {
    console.log(
      "Gemini token usage:",
      `prompt=${data.usageMetadata.promptTokenCount ?? "?"}`,
      `thoughts=${data.usageMetadata.thoughtsTokenCount ?? 0}`,
      `output=${data.usageMetadata.candidatesTokenCount ?? "?"}`,
      `total=${data.usageMetadata.totalTokenCount ?? "?"}`
    );
  }
  const finishReason = data?.candidates?.[0]?.finishReason;
  if (finishReason && finishReason !== "STOP") {
    console.warn("Gemini finishReason was not STOP:", finishReason);
  }

  const part = data?.candidates?.[0]?.content?.parts?.find((p) => p.text);
  if (!part) throw new Error("No text content in Gemini response");
  return part.text;
}

// Strips accidental markdown code fences before JSON.parse, as a fallback
// even though responseMimeType: "application/json" should prevent them.
function parseJsonResponse(text) {
  const cleaned = text.replace(/^```json\s*|^```\s*|```\s*$/gm, "").trim();
  return JSON.parse(cleaned);
}

module.exports = { callGemini, parseJsonResponse };
