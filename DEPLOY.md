# Premium Screener — Railway Deployment Guide

## Prerequisites

- GitHub repo: `diamondbuild/premium-screener`
- Domain: `premiumscreener.com` (Cloudflare)
- Railway account: [railway.app](https://railway.app)

---

## Step 1: Create Railway Project

1. Go to [railway.app/new](https://railway.app/new)
2. Click **"Deploy from GitHub Repo"**
3. Select `diamondbuild/premium-screener`
4. Railway will auto-detect the `railway.toml` config and start building

---

## Step 2: Add a Volume (for SQLite persistence)

SQLite data must survive redeploys. Without a volume, the database resets on every deploy.

1. In your Railway project, click **"+ New"** → **"Volume"**
2. Set the mount path to: `/data`
3. Attach it to your service
4. The `DATABASE_PATH` env var (Step 3) tells the app to use this volume

---

## Step 3: Set Environment Variables

In Railway, go to your service → **Variables** tab. Add these:

| Variable | Value | Notes |
|----------|-------|-------|
| `PORT` | `5000` | Railway sets this automatically, but explicit is safer |
| `NODE_ENV` | `production` | Required for production mode |
| `DATABASE_PATH` | `/data/screener.db` | Points to the mounted volume |
| `LIVE_SCAN` | `1` | Enables live scanning with real market data |
| `POLYGON_API_KEY` | `ySa69UMk92kM1oE7j227SiIK6WfoMh21` | Your Polygon.io/Massive API key |
| `STRIPE_SECRET_KEY` | *(your Stripe secret key)* | From Stripe Dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | *(your Stripe webhook signing secret)* | From Stripe Dashboard → Webhooks |

> **Note:** Railway auto-assigns `PORT` — the app reads it. If Railway provides its own PORT, that takes precedence.

---

## Step 4: Configure Custom Domain on Railway

1. In Railway, go to your service → **Settings** tab
2. Under **Networking** → **Public Networking**, click **"Generate Domain"** first (to verify the service is accessible)
3. Then click **"+ Custom Domain"**
4. Enter: `premiumscreener.com`
5. Railway will show you the CNAME target (something like `your-service.up.railway.app`)

---

## Step 5: Configure Cloudflare DNS

1. Log into [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select `premiumscreener.com`
3. Go to **DNS** → **Records**
4. Add a **CNAME** record:
   - **Name:** `@` (or `premiumscreener.com`)
   - **Target:** The Railway CNAME target from Step 4
   - **Proxy status:** **DNS only** (gray cloud) — Railway handles SSL
5. Optionally add `www`:
   - **Name:** `www`
   - **Target:** Same Railway CNAME target
   - **Proxy status:** DNS only

> **Important:** Set Cloudflare proxy to **DNS only** (gray cloud icon). If you use Cloudflare's proxy (orange cloud), it can interfere with Railway's SSL certificate provisioning.

---

## Step 6: Configure Cloudflare SSL

1. In Cloudflare, go to **SSL/TLS** → **Overview**
2. Set mode to **Full (strict)** — Railway provides valid SSL certs
3. Under **Edge Certificates**, ensure **Always Use HTTPS** is ON

---

## Step 7: Set Up Stripe Webhook for Production

1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. Click **"Add endpoint"**
3. Set URL to: `https://premiumscreener.com/api/stripe/webhook`
4. Select events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copy the **Signing secret** and add it as `STRIPE_WEBHOOK_SECRET` in Railway env vars

---

## Step 8: Set Up Daily Auto-Scan (Railway Cron)

Railway supports cron jobs. To run the daily 9:30 AM ET scan:

1. In your Railway project, add a **new service** (or use the existing one with a cron trigger)
2. The simplest approach: use Railway's **cron** feature or an external cron service (e.g., cron-job.org) to hit:
   ```
   POST https://premiumscreener.com/api/scan
   ```
   at `30 13 * * 1-5` (9:30 AM ET = 13:30 UTC, weekdays only)

Alternatively, you can add a lightweight cron to the app itself by adding a startup check in `server/index.ts` using `node-cron`.

---

## Verify Deployment

After deploying, check these endpoints:

- `https://premiumscreener.com` — Should load the app
- `https://premiumscreener.com/api/scan-status` — Should return `{"status":"idle",...}`
- `https://premiumscreener.com/api/all-results` — Should return scan data

---

## Troubleshooting

### Build fails
- Check Railway build logs for npm install errors
- Ensure `better-sqlite3` compiles (Nixpacks handles native deps automatically)

### Database errors
- Verify the volume is mounted at `/data`
- Check that `DATABASE_PATH` is set to `/data/screener.db`
- SSH into the Railway container and check if `/data` exists

### SSL/Domain issues
- Cloudflare proxy must be **DNS only** (gray cloud)
- Wait 5-10 minutes for Railway to provision the SSL cert
- Check Railway's **Settings → Custom Domain** for certificate status

### Auto-deploy
- Railway auto-deploys on every push to `main`
- To disable: Settings → Deploy → turn off auto-deploy

---

## Architecture Overview

```
┌─────────────────┐     CNAME      ┌──────────────────┐
│  Cloudflare DNS │ ──────────────→│  Railway Service  │
│ premiumscreener │   (DNS only)   │                   │
│    .com         │                │  Express + React  │
└─────────────────┘                │  SQLite on /data  │
                                   │  Port 5000        │
                                   └──────────────────┘
```
