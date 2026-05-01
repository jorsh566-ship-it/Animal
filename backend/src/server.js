import "dotenv/config";
import cors from "cors";
import express from "express";
import { createClient } from "@supabase/supabase-js";

const port = Number(process.env.PORT || 8080);
const appOrigin = process.env.APP_ORIGIN || "http://localhost:5173";
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openRouterApiKey = process.env.OPENROUTER_API_KEY;
const openRouterModel = process.env.OPENROUTER_MODEL || "google/gemini-3.1-flash-image-preview";
const openRouterUrl = "https://openrouter.ai/api/v1/chat/completions";

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.warn("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for production.");
}

const supabase = createClient(supabaseUrl || "http://localhost", supabaseServiceRoleKey || "missing", {
  auth: { persistSession: false },
});

const app = express();
app.use(cors({ origin: appOrigin.split(",").map((origin) => origin.trim()), credentials: true }));
app.use(express.json({ limit: "16mb" }));

function jsonError(res, status, message, detail) {
  res.status(status).json({ error: message, detail });
}

function decodeDataUrl(dataUrl) {
  const match = String(dataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid image data URL");
  const extension = match[1].includes("png") ? "png" : "jpg";
  return {
    buffer: Buffer.from(match[2], "base64"),
    contentType: match[1],
    extension,
  };
}

function fileName(prefix, extension = "jpg") {
  return `${prefix}/${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`;
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
  ].join(" ");
}

async function requireUser(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return jsonError(res, 401, "Нужно войти в аккаунт.");

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return jsonError(res, 401, "Сессия истекла. Войдите снова.");

  req.user = data.user;
  req.token = token;
  next();
}

async function getSignedUrl(bucket, path, expiresIn = 60 * 60 * 24) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

async function uploadDataUrl(bucket, path, dataUrl) {
  const file = decodeDataUrl(dataUrl);
  const { error } = await supabase.storage.from(bucket).upload(path, file.buffer, {
    contentType: file.contentType,
    upsert: true,
  });
  if (error) throw error;
  return path;
}

async function uploadGeneratedImage(userId, orderId, variant, imageUrl) {
  let file;
  if (imageUrl.startsWith("data:image/")) {
    file = decodeDataUrl(imageUrl);
  } else {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`Could not download generated image: ${response.statusText}`);
    const contentType = response.headers.get("content-type") || "image/png";
    file = {
      buffer: Buffer.from(await response.arrayBuffer()),
      contentType,
      extension: contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg" : "png",
    };
  }

  const path = `${userId}/${orderId}/avatar-${variant}.${file.extension}`;
  const { error } = await supabase.storage.from("generated-avatars").upload(path, file.buffer, {
    contentType: file.contentType,
    upsert: true,
  });
  if (error) throw error;
  return path;
}

async function generateSingleAvatar(imageDataUrl, variant) {
  const response = await fetch(openRouterUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openRouterApiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": appOrigin.split(",")[0],
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
            { type: "text", text: buildAvatarPrompt(variant) },
            { type: "image_url", image_url: { url: imageDataUrl } },
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
    throw new Error(data?.error?.message || data?.message || response.statusText);
  }

  const images = extractImages(data);
  if (!images.length) throw new Error("OpenRouter response did not include an image");
  return images[0];
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, model: openRouterModel });
});

app.post("/api/profile", requireUser, async (req, res) => {
  const fullName = req.body.fullName || req.user.user_metadata?.full_name || req.user.email || "Пользователь";
  const { data, error } = await supabase
    .from("profiles")
    .upsert({ id: req.user.id, email: req.user.email, full_name: fullName }, { onConflict: "id" })
    .select()
    .single();

  if (error) return jsonError(res, 500, "Не удалось сохранить профиль.", error.message);
  res.json({ profile: data });
});

app.post("/api/upload", requireUser, async (req, res) => {
  try {
    const { imageDataUrl } = req.body;
    if (!imageDataUrl) return jsonError(res, 400, "Загрузите фото.");
    const decoded = decodeDataUrl(imageDataUrl);
    const path = fileName(`${req.user.id}/source`, decoded.extension);
    await uploadDataUrl("source-photos", path, imageDataUrl);
    res.json({ path, signedUrl: await getSignedUrl("source-photos", path) });
  } catch (error) {
    jsonError(res, 500, "Не удалось загрузить фото.", error.message);
  }
});

app.get("/api/orders", requireUser, async (req, res) => {
  const { data: orders, error } = await supabase
    .from("orders")
    .select("*, avatars(*)")
    .eq("user_id", req.user.id)
    .order("created_at", { ascending: false });

  if (error) return jsonError(res, 500, "Не удалось загрузить заказы.", error.message);

  const signedOrders = await Promise.all(
    orders.map(async (order) => ({
      ...order,
      source_photo_url: order.source_photo_path ? await getSignedUrl("source-photos", order.source_photo_path) : null,
      avatars: await Promise.all(
        (order.avatars || []).map(async (avatar) => ({
          ...avatar,
          signed_url: await getSignedUrl("generated-avatars", avatar.storage_path),
        }))
      ),
    }))
  );

  res.json({ orders: signedOrders });
});

app.post("/api/orders", requireUser, async (req, res) => {
  const { heroName, age, occasion, story, price, sourcePhotoPath } = req.body;
  const { data, error } = await supabase
    .from("orders")
    .insert({
      user_id: req.user.id,
      hero_name: heroName || "Герой",
      age: age || null,
      occasion: occasion || "Для ребенка",
      story: story || "Волшебное приключение",
      price: Number(price || 1490),
      source_photo_path: sourcePhotoPath || null,
      status: "draft",
    })
    .select()
    .single();

  if (error) return jsonError(res, 500, "Не удалось создать заказ.", error.message);
  res.status(201).json({ order: data });
});

app.patch("/api/orders/:id", requireUser, async (req, res) => {
  const allowed = ["status", "selected_avatar_id", "hero_name", "age", "occasion", "story", "price"];
  const update = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));
  const { data, error } = await supabase
    .from("orders")
    .update(update)
    .eq("id", req.params.id)
    .eq("user_id", req.user.id)
    .select()
    .single();

  if (error) return jsonError(res, 500, "Не удалось обновить заказ.", error.message);
  res.json({ order: data });
});

app.post("/api/avatars/generate", requireUser, async (req, res) => {
  if (!openRouterApiKey) return jsonError(res, 500, "OPENROUTER_API_KEY is not set on Railway.");

  const { orderId, imageDataUrl } = req.body;
  if (!orderId || !imageDataUrl) return jsonError(res, 400, "Нужны orderId и фото.");

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .eq("user_id", req.user.id)
    .single();

  if (orderError || !order) return jsonError(res, 404, "Заказ не найден.");

  try {
    await supabase.from("orders").update({ status: "generating_avatars" }).eq("id", orderId).eq("user_id", req.user.id);
    const results = await Promise.allSettled([1, 2, 3].map((variant) => generateSingleAvatar(imageDataUrl, variant)));
    const images = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
    const errors = results
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason?.message || "Avatar generation failed");

    if (!images.length) throw new Error(errors[0] || "OpenRouter response did not include an image");

    await supabase.from("avatars").delete().eq("order_id", orderId).eq("user_id", req.user.id);
    const avatarRows = [];
    for (const [index, image] of images.entries()) {
      const variant = index + 1;
      const storagePath = await uploadGeneratedImage(req.user.id, orderId, variant, image);
      avatarRows.push({
        order_id: orderId,
        user_id: req.user.id,
        variant,
        title: `Мульт-образ ${variant}`,
        storage_path: storagePath,
      });
    }

    const { data: avatars, error: avatarError } = await supabase.from("avatars").insert(avatarRows).select();
    if (avatarError) throw avatarError;

    await supabase.from("orders").update({ status: "avatars_ready" }).eq("id", orderId).eq("user_id", req.user.id);

    const signedAvatars = await Promise.all(
      avatars.map(async (avatar) => ({
        ...avatar,
        signed_url: await getSignedUrl("generated-avatars", avatar.storage_path),
      }))
    );

    res.json({ avatars: signedAvatars, errors, model: openRouterModel });
  } catch (error) {
    await supabase.from("orders").update({ status: "draft" }).eq("id", orderId).eq("user_id", req.user.id);
    jsonError(res, 502, "Модель не смогла создать образы. Попробуйте еще раз или загрузите другое фото.", error.message);
  }
});

app.listen(port, () => {
  console.log(`Animal Movies API is running on port ${port}`);
});
