# Neuron

Neuron is a responsive AI second-brain product prototype built with React, TypeScript, Tailwind CSS and Framer Motion.

## Run locally

```bash
npm install
npm run dev
```

Create a production build with `npm run build`.

## Connect Supabase

1. Copy `.env.example` to `.env.local`.
2. Add the publishable key from **Supabase Dashboard → Settings → API Keys**. Never use a service-role key in this frontend.
3. In the Supabase SQL Editor, run [`supabase/schema.sql`](supabase/schema.sql).
4. In **Authentication → Providers → Anonymous**, enable anonymous sign-ins.
5. Restart the development server with `npm run dev`.

When connected, the header displays **Supabase synced**. Captured memories are stored in `public.memories` and protected by owner-only Row Level Security policies.
