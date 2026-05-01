# Deploy: Animal Movies

## 1. Supabase

1. Create a Supabase project.
2. Run `supabase/schema.sql` in SQL Editor.
3. Enable email confirmations in Auth settings.
4. Add Site URL and Redirect URLs:
   - local: `http://localhost:5173/cabinet`
   - Vercel: `https://YOUR_FRONTEND_DOMAIN/cabinet`
5. Add custom OAuth/OIDC providers for Yandex and VK in Supabase Auth settings.
   - Use provider ids expected by the frontend: `custom:yandex` and `custom:vk`.
   - Add each provider's client id/secret from Yandex/VK apps.

## 2. Railway API

Deploy the `backend` folder.

Environment variables:

```env
PORT=8080
APP_ORIGIN=https://YOUR_FRONTEND_DOMAIN,http://localhost:5173
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
OPENROUTER_API_KEY=YOUR_OPENROUTER_KEY
OPENROUTER_MODEL=google/gemini-3.1-flash-image-preview
```

Healthcheck: `/health`.

## 3. Vercel Frontend

Deploy the `frontend` folder.

Environment variables:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
VITE_API_URL=https://YOUR_RAILWAY_API_DOMAIN
VITE_YANDEX_PROVIDER=custom:yandex
VITE_VK_PROVIDER=custom:vk
```

## 4. Local Development

```bash
npm install
npm run dev:backend
npm run dev:frontend
```

Frontend: `http://localhost:5173`.
Backend: `http://localhost:8080`.
