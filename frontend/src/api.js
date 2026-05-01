const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8080";

async function parseResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.detail || "Ошибка запроса");
  }
  return data;
}

export async function apiRequest(path, token, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  return parseResponse(response);
}

export function uploadPhoto(token, imageDataUrl) {
  return apiRequest("/api/upload", token, {
    method: "POST",
    body: JSON.stringify({ imageDataUrl }),
  });
}

export function createOrder(token, payload) {
  return apiRequest("/api/orders", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateOrder(token, orderId, payload) {
  return apiRequest(`/api/orders/${orderId}`, token, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function fetchOrders(token) {
  return apiRequest("/api/orders", token);
}

export function generateAvatars(token, payload) {
  return apiRequest("/api/avatars/generate", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function syncProfile(token, payload = {}) {
  return apiRequest("/api/profile", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
