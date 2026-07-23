// Image generation is intentionally isolated behind this one function so
// swapping providers only touches this file.

const IMAGEGEN_API_URL = process.env.IMAGEGEN_API_URL ||
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent";

async function generateImage(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const aspectRatio = process.env.IMAGEGEN_ASPECT_RATIO || "16:9";

  const res = await fetch(IMAGEGEN_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: { aspectRatio }
      }
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Image gen API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const part = data?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) {
    console.error("Image gen: no inlineData part found. Full response:", JSON.stringify(data, null, 2));
    const candidate = data?.candidates?.[0];
    const textPart = candidate?.content?.parts?.find((p) => p.text)?.text;
    const finishReason = candidate?.finishReason;
    const details = [
      finishReason ? `finishReason: ${finishReason}` : null,
      textPart ? `model said: "${textPart}"` : null
    ].filter(Boolean).join(" | ");
    throw new Error(`No image data in response${details ? " (" + details + ")" : ""}`);
  }
  return Buffer.from(part.inlineData.data, "base64");
}

module.exports = { generateImage };
