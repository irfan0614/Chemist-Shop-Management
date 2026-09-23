# Chemist Shop Manager — Backend (Node.js + PostgreSQL)

You can run this against **Supabase** (free, hosted, zero server maintenance) or a **local PostgreSQL** install. Pick one.

## Option A: Supabase (recommended — easiest, free)

### 1. Create a project
- Go to https://supabase.com, sign up, click "New project"
- Choose a name, database password (save it!), and region closest to your shop
- Wait ~2 minutes for it to provision

### 2. Get your connection string
- In your project: **Settings → Database → Connection string → URI**
- Copy it — it looks like `postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxxxxxx.supabase.co:5432/postgres`
- Replace `[YOUR-PASSWORD]` with the database password you set in step 1

### 3. Configure the app
```bash
cd server
npm install
cp .env.example .env
```
Paste your connection string into `.env` as `DATABASE_URL`, and leave the `PGHOST`/`PGPORT`/etc. lines as they are (they're ignored when `DATABASE_URL` is set).

### 4. Create the tables
Two ways to do this — either works:
- **Easiest:** open your Supabase project → **SQL Editor** → paste the contents of `db/schema.sql` → click Run.
- **From your machine:** `npm run migrate` (this runs the same file against `DATABASE_URL`).

### 5. Start the API server
```bash
npm start
```
Your API now runs locally on `http://localhost:4000` but stores everything in your Supabase cloud database — accessible from anywhere once you deploy the API itself (e.g. to Render, Railway, or a small VPS).

**Good to know about the free tier:** plenty of room for a single shop (500 MB storage, unlimited API requests), but the project auto-pauses after 7 days with no activity — if you come back after a long gap, just open the Supabase dashboard once to un-pause it. There are also no automatic backups on the free plan, so it's worth exporting your data occasionally once you have real sales history (`pg_dump` works fine against Supabase).

## Option B: Local PostgreSQL

### 1. Install PostgreSQL
- **Windows/Mac:** download from https://www.postgresql.org/download/
- **Ubuntu/Debian:** `sudo apt install postgresql`

Then create a database:
```bash
psql -U postgres
CREATE DATABASE chemist_shop;
\q
```

### 2. Configure the app
```bash
cd server
npm install
cp .env.example .env
```
Edit `.env` with your PostgreSQL username/password (leave `DATABASE_URL` blank/commented out).

### 3. Create the tables
```bash
npm run migrate
```
This runs `db/schema.sql`, which creates the `medicines`, `bills`, `bill_items`, and `settings` tables (safe to re-run).

### 4. Start the API server
```bash
npm start
```

## Verify it's running
The API runs at `http://localhost:4000` regardless of which option you chose above. Check it's alive:
```bash
curl http://localhost:4000/api/health
```

## API endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | /api/settings | Get shop settings |
| PUT | /api/settings | Update shop settings |
| GET | /api/medicines | List all medicines |
| POST | /api/medicines | Add a medicine |
| PUT | /api/medicines/:id | Update a medicine |
| DELETE | /api/medicines/:id | Delete a medicine |
| GET | /api/bills | List all bills (summary) |
| GET | /api/bills/:id | Get one bill with line items |
| POST | /api/bills | Create a bill — deducts stock and bumps the bill counter in one transaction |

## Point the web app at this API
Open the `chemist-shop-db.html` file, find the line near the top of the `<script>` block:
```js
const API_BASE = 'http://localhost:4000/api';
```
Make sure it matches where your server is running, then open the HTML file in a browser. All data now reads/writes through PostgreSQL (Supabase or local) instead of browser storage.

## Notes
- Bill creation is wrapped in a SQL transaction — if any item is out of stock, nothing is saved (no half-completed bills).
- To run this on a different machine (e.g., a shop counter PC hitting a server elsewhere), just change `API_BASE` to that server's address and make sure port 4000 is reachable on your network.
- For real deployment, put this behind HTTPS and add authentication before exposing it beyond your local network.
