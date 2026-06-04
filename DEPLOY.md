# Deploy Tara on Render + Neon

## Prerequisites

- GitHub repo: [tara-finance-agent](https://github.com/BhushanBagul15/tara-finance-agent)
- [Neon](https://neon.tech) database with data ingested (same `DATABASE_URL` you use locally)
- [OpenAI API key](https://platform.openai.com/api-keys)
- [Render](https://render.com) account

---

## Step 1 — Push latest code (if you changed anything locally)

```powershell
cd c:\Users\bhush\OneDrive\Desktop\Projects\tara-agent
git add .
git commit -m "Render deployment config"
git push
```

---

## Step 2 — Create the Web Service on Render

1. Go to [dashboard.render.com](https://dashboard.render.com)
2. **New +** → **Web Service**
3. Connect **GitHub** → select **`BhushanBagul15/tara-finance-agent`**
4. Settings:

| Field | Value |
|-------|--------|
| **Name** | `tara-finance-agent` |
| **Region** | Singapore (near your Neon `ap-southeast-1` DB) |
| **Branch** | `main` |
| **Runtime** | Node |
| **Build Command** | `npm install --include=dev && npm run render-build` |
| **Start Command** | `npm start` |
| **Plan** | Free (or Starter for always-on) |

5. **Advanced** → **Health Check Path**: `/health`

---

## Step 3 — Environment variables

In Render → your service → **Environment**:

| Key | Value |
|-----|--------|
| `DATABASE_URL` | Your Neon **pooled** connection string (same as local `.env`, in quotes if pasted with `&`) |
| `OPENAI_API_KEY` | Your OpenAI key |
| `NODE_ENV` | `production` |
| `LOG_LEVEL` | `info` |

Do **not** set `PORT` — Render sets it automatically.

Click **Save Changes**.

---

## Step 4 — Deploy

Render will build and deploy. Watch **Logs**:

- Build should compile TypeScript successfully
- On start, Prisma runs `migrate deploy` automatically
- Start should show `Tara API listening`

Open: `https://tara-finance-agent.onrender.com/health`  
Expected: `{"status":"ok","database":"connected"}`

---

## Step 5 — Load data on production (one-time)

Your Neon DB may already have data from local ingest. If `/ready` shows `transactionCount: 0`, load data via **Render Shell**:

1. Service → **Shell**
2. Run:

```bash
DATA_DIR=./data/sample_x npm run ingest:prod
```

Or if `tsx` is available:

```bash
DATA_DIR=./data/sample_x npx tsx scripts/ingest.ts
```

3. Verify:

```bash
curl https://YOUR-SERVICE.onrender.com/ready
```

---

## Step 6 — Test the live API

```bash
curl -X POST https://tara-finance-agent.onrender.com/ask \
  -H "Content-Type: application/json" \
  -d "{\"question\":\"What was my biggest expense?\"}"
```

PowerShell:

```powershell
$body = @{ question = "What was my biggest expense?" } | ConvertTo-Json
Invoke-RestMethod -Method POST -Uri "https://tara-finance-agent.onrender.com/ask" -Body $body -ContentType "application/json"
```

---

## Optional — Deploy with Blueprint (`render.yaml`)

1. **New +** → **Blueprint**
2. Connect repo `tara-finance-agent`
3. Render reads `render.yaml` and creates the web service
4. You still must enter `DATABASE_URL` and `OPENAI_API_KEY` manually when prompted

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Build fails on `prisma migrate` | Check `DATABASE_URL` is set in Render env **before** build, or run migrate from Shell |
| `Can't reach database` | Use Neon **pooled** URL; wake DB in Neon console |
| `/health` 503 | Wrong `DATABASE_URL` or Neon paused |
| `/ask` 503 | Missing `OPENAI_API_KEY` |
| Empty answers / no data | Run ingest (Step 5) or use same Neon DB you ingested locally |
| Free tier cold start | First request after idle may take 30–60s |

---

## Security

- Never commit `.env` to GitHub
- Set secrets only in Render **Environment**, not in code
- Prefer a **private** GitHub repo if the assignment allows it
