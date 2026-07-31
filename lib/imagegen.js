// Image generation is intentionally isolated behind this one function so
// swapping providers only touches this file.

const { logImageCost } = require("./costTracker");

const IMAGEGEN_API_URL = process.env.IMAGEGEN_API_URL ||
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent";

async function generateImage(prompt, { imageSize } = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const aspectRatio = process.env.IMAGEGEN_ASPECT_RATIO || "16:9";
  // imageSize is OPT-IN, not a new default -- this function is shared by
  // every image call in the app (NPC/enemy/item portraits, faction
  // banners, the world mood board, the map backdrop). Bumping resolution
  // for all of them by default would silently increase real Gemini cost
  // and latency everywhere, not just fix the one thing actually being
  // asked for (the map backdrop looking soft when zoomed). Only
  // routes/map.js's backdrop generation currently passes this.
  //
  // "2K" for a 16:9 image is documented at 2752x1536 (see Google's
  // Gemini/Firebase AI Logic image-generation docs) vs. the ~1024x1024/
  // 928x1152 default. HONEST CAVEAT: there's a confirmed, open bug
  // (googleapis/js-genai#1461) where this exact model, called through
  // Vertex AI, silently ignores imageConfig.imageSize and always returns
  // ~1K regardless of what's requested -- unclear whether that same bug
  // affects this direct generativelanguage.googleapis.com endpoint (not
  // Vertex). Worth checking actual output dimensions after this lands;
  // if the map backdrop is still soft, that's this known upstream issue,
  // not a bug in this code.
  const imageConfig = imageSize ? { aspectRatio, imageSize } : { aspectRatio };

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
        imageConfig
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
  logImageCost();
  return Buffer.from(part.inlineData.data, "base64");
}

module.exports = { generateImage };
