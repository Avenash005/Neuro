# Start and Deploy Neuron

This guide covers the two common flows:

- Run Neuron locally on your laptop.
- Deploy the frontend to Vercel while keeping Supabase as the backend.

## 1. Start Locally

### Requirements

- Node.js 20 or newer
- npm
- A Supabase project
- The SQL migrations applied in Supabase

### Install

```powershell
Set-Location "C:\Users\avenash.v\new-project"
npm install
```

### Local environment

Create `.env.local` from `.env.example`, then add your real values.

```powershell
Copy-Item .env.example .env.local
```

Minimum local frontend values:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
VITE_AUTH_REDIRECT_URL=http://127.0.0.1:5173
```

Keep these server-only values out of frontend code:

```env
SUPABASE_SECRET_KEY=your_supabase_secret_key
WORKER_SECRET=generate_a_long_random_value
NVIDIA_API_KEY=your_nvidia_api_key
```

### Supabase local auth settings

In Supabase Dashboard, open **Authentication -> URL Configuration**.

Set:

```text
Site URL:
http://127.0.0.1:5173
```

Add:

```text
Redirect URL:
http://127.0.0.1:5173/**
```

Then open **Authentication -> Sign In / Providers** and confirm:

- Anonymous sign-ins are enabled.
- Email provider is enabled.
- Confirm email can stay enabled.

### Start the dev server

```powershell
npm run dev -- --host 127.0.0.1
```

Open:

```text
http://127.0.0.1:5173/
```

If login links fail, make sure the browser URL, `VITE_AUTH_REDIRECT_URL`, and Supabase redirect URL all use the same host. Prefer `127.0.0.1` during local testing.

## 2. Check Before Deploying

Run these before pushing or deploying:

```powershell
npm run typecheck
npm run test
npm run build
```

For Edge Function code:

```powershell
npm run check:worker
```

## 3. Deploy Supabase Backend

For a fresh Supabase project, run `supabase/schema.sql` once in the SQL Editor.

For an existing project, run only new migration files in order from:

```text
supabase/migrations/
```

Deploy Edge Functions when their migrations and secrets are ready:

```powershell
npx --yes supabase@latest functions deploy process-memory --project-ref your_project_ref --no-verify-jwt
npx --yes supabase@latest functions deploy search-memories --project-ref your_project_ref --no-verify-jwt
npx --yes supabase@latest functions deploy ask-neuron --project-ref your_project_ref --no-verify-jwt
npx --yes supabase@latest functions deploy live-assist --project-ref your_project_ref --no-verify-jwt
```

Set Supabase Edge Function secrets in Supabase, not in Vercel:

```powershell
npx --yes supabase@latest secrets set NVIDIA_API_KEY=your_nvidia_key --project-ref your_project_ref
npx --yes supabase@latest secrets set WORKER_SECRET=your_worker_secret --project-ref your_project_ref
```

## 4. Deploy Frontend to Vercel

### Option A: Vercel Dashboard

1. Push the repo to GitHub.
2. Open Vercel and import the GitHub repository.
3. Choose the Vite framework preset.
4. Use these project settings:

```text
Build Command:
npm run build

Output Directory:
dist

Install Command:
npm install
```

5. Add these Vercel environment variables for Production and Preview:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
VITE_AUTH_REDIRECT_URL=https://your-vercel-domain.vercel.app
```

Do not add `SUPABASE_SECRET_KEY`, `WORKER_SECRET`, or `NVIDIA_API_KEY` to frontend code. Only add server secrets to Vercel if you later create Vercel serverless functions that need them.

6. Deploy.

### Option B: Vercel CLI

Install or run the CLI:

```powershell
npx vercel
```

Link the local folder:

```powershell
npx vercel link
```

Add environment variables:

```powershell
npx vercel env add VITE_SUPABASE_URL
npx vercel env add VITE_SUPABASE_PUBLISHABLE_KEY
npx vercel env add VITE_AUTH_REDIRECT_URL
```

Deploy preview:

```powershell
npx vercel deploy
```

Deploy production:

```powershell
npx vercel deploy --prod
```

## 5. Update Supabase for Vercel Auth

After Vercel gives you a production URL, return to Supabase Dashboard.

Open **Authentication -> URL Configuration**.

Set production Site URL:

```text
https://your-vercel-domain.vercel.app
```

Add redirect URLs:

```text
https://your-vercel-domain.vercel.app/**
http://127.0.0.1:5173/**
```

Keep the local redirect while developing. Add your custom domain later when you buy/connect one.

## 6. Production Smoke Test

After deployment:

1. Open the Vercel production URL.
2. Confirm the header says Supabase synced.
3. Capture a test note.
4. Refresh the browser and confirm the note remains.
5. Try email login and confirm the magic link returns to the Vercel URL.
6. Open Library and confirm saved memories load.
7. Open Sidekick and confirm saved sessions/notes load after refresh.

## 7. Common Fixes

### Email link opens a dead page

Check:

- `VITE_AUTH_REDIRECT_URL` in Vercel matches your deployed URL.
- Supabase Site URL matches your deployed URL.
- Supabase redirect URLs include `https://your-domain/**`.
- You redeployed after changing Vercel environment variables.

### App says Supabase is local or disconnected

Check:

- `VITE_SUPABASE_URL` exists in Vercel.
- `VITE_SUPABASE_PUBLISHABLE_KEY` exists in Vercel.
- The values are available for the environment you deployed: Preview or Production.
- You created a new deployment after editing env variables.

### Build fails on Vercel

Run locally:

```powershell
npm run build
```

This project uses:

```text
vite build --configLoader runner
```

That setting avoids the Windows config-loader issue we hit locally and is safe for normal Vite builds.

## References

- Vercel Vite framework docs: https://vercel.com/docs/frameworks/frontend/vite
- Vercel CLI deploy docs: https://vercel.com/docs/cli/deploy
- Vercel CLI project deployment guide: https://vercel.com/docs/projects/deploy-from-cli
- Vite environment variables docs: https://vite.dev/guide/env-and-mode
