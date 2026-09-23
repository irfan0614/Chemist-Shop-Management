# Chemist Shop Manager

A pharmacy inventory & billing system: React frontend, Node.js/Express API, PostgreSQL database (works with Supabase).

```
chemist-shop/
├── client/     React + Vite + Tailwind frontend
└── server/     Express API + PostgreSQL (Supabase-ready)
```

## 1. Set up the database (Supabase)

1. Create a project at https://supabase.com
2. Go to **Project Settings → Database → Connection string → URI** and copy it
3. Go to the **SQL Editor** in your Supabase dashboard, paste the contents of `server/db/schema.sql`, and run it — this creates the `medicines`, `bills`, `bill_items`, and `settings` tables

## 2. Set up the backend

```bash
cd server
npm install
cp .env.example .env
```
Open `.env` and paste your Supabase connection string into `DATABASE_URL`. Then:
```bash
npm start
```
The API runs at `http://localhost:4000`. Confirm it's alive: `curl http://localhost:4000/api/health`

## 3. Set up the frontend

```bash
cd client
npm install
cp .env.example .env
npm run dev
```
Open the URL Vite prints (usually `http://localhost:5173`). It's already pointed at `http://localhost:4000/api` by default — change `VITE_API_BASE` in `client/.env` if your backend lives elsewhere.

## 4. Push to GitHub

From the `chemist-shop` folder:
```bash
git init
git add .
git commit -m "Chemist shop manager: React frontend + Node/Postgres backend"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO-NAME.git
git push -u origin main
```
(Create an empty repo first at github.com/new — no README/gitignore, so the push isn't rejected for unrelated histories.)

Both `.env` files are git-ignored, so your Supabase password and connection strings won't be committed. Each teammate/deployment just needs their own `.env` from the `.env.example` templates.

## Deploying for real use
- **Backend**: Render, Railway, or Fly.io all have free/cheap tiers that work well with an Express + Supabase setup.
- **Frontend**: `npm run build` in `client/` produces a `dist/` folder you can deploy to Vercel, Netlify, or Cloudflare Pages — just set `VITE_API_BASE` to your deployed backend's URL in that platform's environment variable settings.
