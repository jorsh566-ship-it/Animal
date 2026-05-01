const openRouterUrl = "https://openrouter.ai/api/v1/chat/completions";
const openRouterModel = "google/gemini-3.1-flash-image-preview";

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function extractImages(data) {
  const message = data?.choices?.[0]?.message;
  const images = [];

  for (const image of message?.images || []) {
    const url = image?.image_url?.url || image?.imageUrl?.url || image?.url;
    if (url) images.push(url);
  }

  const content = Array.isArray(message?.content) ? message.content : [];
  for (const part of content) {
    const url = part?.image_url?.url || part?.imageUrl?.url || part?.url;
    if (url) images.push(url);
  }

  return images;
}

function buildAvatarPrompt(variant) {
  const variantMoods = [
    "Variant 1: front-facing portrait, gentle friendly smile, calm premium character look.",
    "Variant 2: slight three-quarter portrait, soft curious expression, polished character look.",
    "Variant 3: front-facing portrait, warm confident expression, cinematic character look.",
  ];

  return [
    "Create one single premium family-friendly 3D animated character portrait from the reference photo.",
    "The goal is only to show how this person will look as an animated movie character, not to create a story scene.",
    "Style: high-end 3D animated feature-film character, cute, warm, polished 3D render, expressive and premium.",
    "Preserve the person's recognizable facial features, age, hair, skin tone, and warm expression.",
    "Use a very neutral warm studio background: soft ivory, cream, beige or light peach backdrop with subtle depth and gentle light.",
    "Background must be minimal and secondary, with no nature, no forest, no garden, no flowers, no party, no room, no recognizable location.",
    "Centered portrait or half-body portrait, face clearly visible, soft natural lighting, friendly eyes.",
    "Return one image only. Do not create a collage, grid, contact sheet, split image, before-after comparison, or multiple panels.",
    "No text, no letters, no names, no logo, no watermark, no cake, no candles, no balloons, no gifts, no extra people, no props, no distorted face, no scary look.",
    "Do not add the person's name or any occasion details into the image.",
    variantMoods[(variant - 1) % variantMoods.length],
  ]
    .filter(Boolean)
    .join(" ");
}

async function generateSingleAvatar(apiKey, payload, variant) {
  const response = await fetch(openRouterUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://reliable-sprite-a4bac4.netlify.app",
      "X-Title": "Animal Movies Cabinet",
    },
    body: JSON.stringify({
      model: openRouterModel,
      modalities: ["image", "text"],
      image_config: {
        aspect_ratio: "1:1",
        image_size: "1K",
      },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: buildAvatarPrompt(variant),
            },
            {
              type: "image_url",
              image_url: {
                url: payload.imageDataUrl,
              },
            },
          ],
        },
      ],
    }),
  });

  const text = await response.text();
  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`OpenRouter returned non-JSON response: ${text.slice(0, 160)}`);
  }

  if (!response.ok) {
    const message = data?.error?.message || data?.message || response.statusText;
    throw new Error(message);
  }

  const images = extractImages(data);
  if (!images.length) {
    throw new Error("OpenRouter response did not include an image");
  }

  return images;
}

async function generateAvatarSet(apiKey, payload) {
  const results = await Promise.allSettled(
    [1, 2, 3].map((variant) => generateSingleAvatar(apiKey, payload, variant))
  );
  const images = results.flatMap((result) => (result.status === "fulfilled" ? result.value.slice(0, 1) : []));
  const errors = results
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason?.message || "Avatar generation failed");

  if (!images.length) {
    throw new Error(errors[0] || "OpenRouter response did not include an image");
  }

  return { images, errors };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return json(500, { error: "OPENROUTER_API_KEY is not set in Netlify" });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  if (!payload.imageDataUrl || !String(payload.imageDataUrl).startsWith("data:image/")) {
    return json(400, { error: "Upload a photo before generating avatars" });
  }

  try {
    const { images, errors } = await generateAvatarSet(apiKey, payload);

    return json(200, { images: images.slice(0, 3), errors, model: openRouterModel });
  } catch (error) {
    console.error("Avatar generation failed:", error);
    return json(502, {
      error: "Модель не смогла создать образы. Попробуйте еще раз или загрузите другое фото.",
      detail: error.message || "OpenRouter generation failed",
    });
  }
};
