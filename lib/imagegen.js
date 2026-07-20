// Image generation is intentionally isolated behind this one function so
// swapping providers (Gemini/Nano Banana vs. an alternative) only touches
// this file. Per the scope doc, exact endpoint details were still TBD —
// fill in IMAGEGEN_API_URL / the request shape once confirmed.

const IMAGEGEN_API_URL = process.env.IMAGEGEN_API_URL ||
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent";

async function generateImage(prompt) {
  const apiKey = process.env.IMAGEGEN_API_KEY;
  if (!apiKey) {
    throw new Error("IMAGEGEN_API_KEY is not set");
  }

  const aspectRatio = process.env.IMAGEGEN_ASPECT_RATIO || "16:9";

  const res = await fetch(`${IMAGEGEN_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["IMAGE"],
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
  if (!part) throw new Error("No image data in response");
  return Buffer.from(part.inlineData.data, "base64");
}

module.exports = { generateImage };
