# Деплой проекта Animal Movies

Проект состоит из трех частей:

- `frontend` — React/Vite интерфейс кабинета;
- `backend` — Railway API, где лежат секреты и вызов OpenRouter;
- Supabase — Auth, база данных и Storage.

OpenRouter-ключ нельзя класть во frontend. Он должен быть только в Railway backend.

## 1. Supabase

Создай проект на https://supabase.com/ и открой:

```text
Project Settings → API
```

Скопируй:

- `Project URL`;
- `anon public key`;
- `service_role key`.

`anon public key` идет во frontend.  
`service_role key` идет только в backend.

## 2. SQL-схема

Открой в Supabase:

```text
SQL Editor
```

Скопируй целиком файл:

```text
supabase/schema.sql
```

Важно: вставляй и запускай весь файл сразу, а не отдельный кусок. Иначе можно получить ошибку около `new.updated_at`.

Файл создает:

- таблицы `profiles`, `orders`, `avatars`;
- buckets `source-photos`, `generated-avatars`;
- RLS-политики для доступа только к своим данным.

## 3. Подтверждение email по коду

Включи email provider:

```text
Authentication → Providers → Email
```

Чтобы пользователь вводил код в интерфейсе, а не переходил по magic link, нужно поменять шаблон письма:

```text
Authentication → Email Templates → Confirm signup
```

В текст письма добавь токен:

```text
Ваш код подтверждения: {{ .Token }}
```

Можно оставить ссылку как запасной вариант, но код должен быть в письме обязательно:

```text
{{ .ConfirmationURL }}
```

Если `{{ .Token }}` не добавить, пользователь не увидит код и не сможет подтвердить почту через поле в кабинете.

## 4. Redirect URLs

Открой:

```text
Authentication → URL Configuration
```

Добавь frontend-домены:

```text
http://localhost:5173
https://ТВОЙ-FRONTEND-ДОМЕН
```

После подключения продуктового домена добавь и его:

```text
https://ТВОЙ-ПРОДУКТОВЫЙ-ДОМЕН
```

## 5. Яндекс ID и VK

Яндекс и VK нужно подключать в Supabase как custom OAuth/OIDC providers.

Имена провайдеров, которые ожидает frontend:

```env
VITE_YANDEX_PROVIDER=custom:yandex
VITE_VK_PROVIDER=custom:vk
```

В Supabase нужно создать custom providers с такими же именами и вставить туда client id / client secret из кабинетов Яндекса и VK.

## 6. Railway backend

Backend service должен смотреть на папку:

```text
backend
```

Переменные Railway для backend:

```env
PORT=8080
APP_ORIGIN=https://ТВОЙ-FRONTEND-ДОМЕН,http://localhost:5173
SUPABASE_URL=https://ТВОЙ-ПРОЕКТ.supabase.co
SUPABASE_SERVICE_ROLE_KEY=ТВОЙ_SUPABASE_SERVICE_ROLE_KEY
OPENROUTER_API_KEY=ТВОЙ_OPENROUTER_KEY
OPENROUTER_MODEL=google/gemini-3.1-flash-image-preview
```

Проверка backend:

```text
https://ТВОЙ-RAILWAY-BACKEND-ДОМЕН/health
```

Должен вернуться JSON с `ok: true`.

## 7. Railway или Vercel frontend

Frontend service должен смотреть на папку:

```text
frontend
```

Переменные для frontend:

```env
VITE_SUPABASE_URL=https://ТВОЙ-ПРОЕКТ.supabase.co
VITE_SUPABASE_ANON_KEY=ТВОЙ_SUPABASE_ANON_KEY
VITE_API_URL=https://ТВОЙ-RAILWAY-BACKEND-ДОМЕН
VITE_YANDEX_PROVIDER=custom:yandex
VITE_VK_PROVIDER=custom:vk
```

После изменения env всегда делай redeploy frontend.

## 8. Локальный запуск

Установить зависимости:

```bash
npm install
```

Запустить backend:

```bash
npm run dev:backend
```

Запустить frontend:

```bash
npm run dev:frontend
```

Локальные адреса:

```text
frontend: http://localhost:5173
backend: http://localhost:8080
```

## 9. Текущая модель генерации

Сейчас используется:

```text
google/gemini-3.1-flash-image-preview
```

Она задается переменной `OPENROUTER_MODEL` в Railway backend.
