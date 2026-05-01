# Деплой проекта Animal Movies

Это инструкция для запуска новой версии с полноценным личным кабинетом:

- frontend: Vercel;
- backend API: Railway;
- авторизация, база и файлы: Supabase;
- генерация образов: OpenRouter через Railway backend.

Важно: Supabase сейчас не настроен автоматически. В проекте подготовлен файл `supabase/schema.sql`, который нужно будет вручную запустить в SQL Editor после создания Supabase-проекта.

## 1. Создать проект Supabase

1. Зайди на https://supabase.com/.
2. Создай новый проект.
3. После создания открой:
   - Project Settings → API;
   - скопируй `Project URL`;
   - скопируй `anon public key`;
   - скопируй `service_role key`.

`anon public key` пойдет во frontend на Vercel.  
`service_role key` пойдет только в backend на Railway. Его нельзя класть во frontend.

## 2. Запустить SQL в Supabase

1. В Supabase открой SQL Editor.
2. Открой локальный файл:

```text
supabase/schema.sql
```

3. Скопируй весь SQL из файла.
4. Вставь в SQL Editor.
5. Нажми Run.

Этот SQL создаст:

- таблицу `profiles`;
- таблицу `orders`;
- таблицу `avatars`;
- приватный bucket `source-photos`;
- приватный bucket `generated-avatars`;
- RLS-политики, чтобы пользователь видел только свои заказы и файлы.

## 3. Настроить email-регистрацию

В Supabase открой:

```text
Authentication → Providers → Email
```

Включи email provider.

Подтверждение почты работает не как “код ввести в поле”, а как письмо со ссылкой. Пользователь нажимает ссылку из письма и возвращается в кабинет.

Если нужен именно код из письма, это отдельная логика, ее можно добавить позже.

## 4. Настроить Redirect URLs в Supabase

Открой:

```text
Authentication → URL Configuration
```

Добавь:

```text
http://localhost:5173/cabinet
https://ТВОЙ-ДОМЕН-НА-VERCEL/cabinet
```

Когда подключишь свой домен, добавишь еще:

```text
https://ТВОЙ-ПРОДУКТОВЫЙ-ДОМЕН/cabinet
```

## 5. Настроить Яндекс ID и VK

В Supabase Яндекс и VK не идут как обычные встроенные кнопки. Их нужно подключить как custom OAuth/OIDC providers.

В Supabase нужно создать два custom provider:

```text
custom:yandex
custom:vk
```

Потом в них вставить client id и client secret из кабинетов Яндекса и VK.

Во frontend уже заложены такие имена:

```env
VITE_YANDEX_PROVIDER=custom:yandex
VITE_VK_PROVIDER=custom:vk
```

## 6. Деплой backend на Railway

На Railway нужно деплоить папку:

```text
backend
```

Переменные окружения Railway:

```env
PORT=8080
APP_ORIGIN=https://ТВОЙ-ДОМЕН-НА-VERCEL,http://localhost:5173
SUPABASE_URL=https://ТВОЙ-ПРОЕКТ.supabase.co
SUPABASE_SERVICE_ROLE_KEY=ТВОЙ_SUPABASE_SERVICE_ROLE_KEY
OPENROUTER_API_KEY=ТВОЙ_OPENROUTER_KEY
OPENROUTER_MODEL=google/gemini-3.1-flash-image-preview
```

Проверка backend:

```text
https://ТВОЙ-RAILWAY-ДОМЕН/health
```

Должен вернуться JSON с `ok: true`.

## 7. Деплой frontend на Vercel

На Vercel нужно деплоить папку:

```text
frontend
```

Переменные окружения Vercel:

```env
VITE_SUPABASE_URL=https://ТВОЙ-ПРОЕКТ.supabase.co
VITE_SUPABASE_ANON_KEY=ТВОЙ_SUPABASE_ANON_KEY
VITE_API_URL=https://ТВОЙ-RAILWAY-ДОМЕН
VITE_YANDEX_PROVIDER=custom:yandex
VITE_VK_PROVIDER=custom:vk
```

После изменения env на Vercel нужно сделать redeploy.

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

## 9. GitHub

Если GitHub CLI не установлен, проще так:

1. Создай новый репозиторий на https://github.com/.
2. Не добавляй README, `.gitignore` и license, потому что они уже есть локально.
3. GitHub покажет команды. Нужно выполнить примерно:

```bash
git remote add origin https://github.com/ТВОЙ-ЛОГИН/ТВОЙ-РЕПОЗИТОРИЙ.git
git branch -M main
git push -u origin main
```

Если Git попросит логин и пароль, обычный пароль GitHub уже не принимает. Нужен Personal Access Token.

Альтернатива проще: установить GitHub Desktop и залогиниться через браузер.

## 10. Что уже сделано в коде

- Подготовлен React frontend.
- Подготовлен Railway backend.
- Подготовлена Supabase SQL-схема.
- OpenRouter key больше не должен быть во frontend.
- Генерация 3 образов идет через backend.
- Модель оставлена:

```text
google/gemini-3.1-flash-image-preview
```

## 11. Что еще не подключено

- Реальный Supabase-проект еще нужно создать вручную.
- SQL еще нужно выполнить в Supabase SQL Editor.
- Яндекс ID и VK еще нужно создать в кабинетах Яндекса/VK и подключить в Supabase.
- CloudPayments пока не подключен.
- GitHub remote еще не добавлен, потому что репозиторий на GitHub нужно создать или дать мне ссылку.
