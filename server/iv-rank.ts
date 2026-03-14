import https from "https";
import db from "./db";

// ── Polygon API key ──
const POLYGON_API_KEY = process.env.POLYGON_API_KEY || "ySa69UMk92kM1oE7j227SiIK6WfoMh21";

// ── Types ──
export interface IVRankData {
  ticker: string;
  currentIV: number;       // Latest ATM IV
  ivRank: number;          // 0–100: where current IV sits in 52-week range
  ivPercentile: number;    // 0–100: % of days in past year IV was lower
  high52w: number;         // 52-week high IV
  low52w: number;          // 52-week low IV
  dataPoints: number;      // How many daily readings we have
  lastUpdated: string;     // ISO date of latest reading
}

// ── Prepared statements ──
const insertIV = db.prepare(`
  INSERT OR REPLACE INTO iv_history (ticker, date, atm_iv, source)
  VALUES (?, ?, ?, ?)
`);

const getIVHistory = db.prepare(`
  SELECT atm_iv, date FROM iv_history
  WHERE ticker = ? AND date >= ?
  ORDER BY date ASC
`);

const getLatestIV = db.prepare(`
  SELECT atm_iv, date FROM iv_history
  WHERE ticker = ?
  ORDER BY date DESC
  LIMIT 1
`);

const getBackfillStatus = db.prepare(`
  SELECT COUNT(*) as cnt FROM iv_history
  WHERE ticker = ? AND source = 'backfill'
`);

const getTickerCount = db.prepare(`
  SELECT COUNT(DISTINCT date) as cnt FROM iv_history
  WHERE ticker = ?
`);

// ── Fetch from Polygon API directly via HTTPS ──
function callPolygonDirect(pathname: string, params: Record<string, string> = {}): Promise<any> {
  const qs = new URLSearchParams({ ...params, apiKey: POLYGON_API_KEY }).toString();
  const url = `https://api.polygon.io${pathname}?${qs}`;
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: 25000 }, (res) => {
      let body = "";
      res.on("data", (chunk: string) => { body += chunk; });
      res.on("end", () => {
        try { resolve(JSON.parse(body)); } catch { resolve(null); }
      });
    });
    req.on("error", (err: Error) => {
      console.error(`Polygon IV API [${pathname.split("/").pop()}]: ${err.message}`);
      resolve(null);
    });
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

// ── Compute 30-day realized volatility from OHLCV ──
function computeRealizedVol(prices: { date: string; close: number }[]): { date: string; rv: number }[] {
  const window = 30; // 30 trading days ≈ 6 weeks
  const results: { date: string; rv: number }[] = [];

  if (prices.length < window + 1) return results;

  // Compute daily log returns
  const returns: { date: string; logReturn: number }[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i].close > 0 && prices[i - 1].close > 0) {
      returns.push({
        date: prices[i].date,
        logReturn: Math.log(prices[i].close / prices[i - 1].close),
      });
    }
  }

  // Rolling 30-day standard deviation, annualized
  for (let i = window - 1; i < returns.length; i++) {
    const slice = returns.slice(i - window + 1, i + 1);
    const mean = slice.reduce((s, r) => s + r.logReturn, 0) / slice.length;
    const variance = slice.reduce((s, r) => s + (r.logReturn - mean) ** 2, 0) / (slice.length - 1);
    const dailyStd = Math.sqrt(variance);
    const annualizedVol = dailyStd * Math.sqrt(252); // Annualize
    results.push({ date: returns[i].date, rv: +annualizedVol.toFixed(4) });
  }

  return results;
}

// ── Backfill a single ticker with historical realized vol ──
export async function backfillTicker(ticker: string): Promise<number> {
  // Check if already backfilled
  const existing = getBackfillStatus.get(ticker) as { cnt: number } | undefined;
  if (existing && existing.cnt > 100) return existing.cnt; // Already have enough data

  // Fetch 14 months of OHLCV (to get 12 months of 30-day RV)
  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - 420 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const data = await callPolygonDirect(`/v2/aggs/ticker/${ticker}/range/1/day/${startDate}/${endDate}`, {
    adjusted: "true",
    sort: "asc",
    limit: "400",
  });

  if (!data?.results?.length) return 0;

  const prices = data.results.map((bar: any) => ({
    date: new Date(bar.t).toISOString().split("T")[0],
    close: bar.c,
  }));

  const rvSeries = computeRealizedVol(prices);
  if (rvSeries.length === 0) return 0;

  // Store in batch
  const insertMany = db.transaction((entries: { date: string; rv: number }[]) => {
    for (const entry of entries) {
      insertIV.run(ticker, entry.date, entry.rv, "backfill");
    }
  });

  insertMany(rvSeries);
  return rvSeries.length;
}

// ── Store ATM IV from a scan (called per-ticker during scanning) ──
export function storeAtmIV(ticker: string, atmIV: number, date?: string): void {
  const d = date || new Date().toISOString().split("T")[0];
  if (atmIV > 0 && atmIV < 5) { // Sanity check (0 < IV < 500%)
    insertIV.run(ticker, d, +atmIV.toFixed(4), "scan");
  }
}

// ── Compute IV Rank and Percentile for a ticker ──
export function getIVRank(ticker: string): IVRankData | null {
  // Get latest reading
  const latest = getLatestIV.get(ticker) as { atm_iv: number; date: string } | undefined;
  if (!latest) return null;

  // Get 52 weeks (1 year) of history
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const history = getIVHistory.all(ticker, oneYearAgo) as { atm_iv: number; date: string }[];

  if (history.length < 10) return null; // Need minimum data

  const currentIV = latest.atm_iv;
  const ivValues = history.map((h) => h.atm_iv);
  const high52w = Math.max(...ivValues);
  const low52w = Math.min(...ivValues);

  // IV Rank: where current IV sits in the 52-week range
  const ivRank = high52w !== low52w
    ? +((currentIV - low52w) / (high52w - low52w) * 100).toFixed(1)
    : 50;

  // IV Percentile: % of days in past year where IV was lower than today
  const daysBelow = ivValues.filter((v) => v < currentIV).length;
  const ivPercentile = +(daysBelow / ivValues.length * 100).toFixed(1);

  return {
    ticker,
    currentIV: +currentIV.toFixed(4),
    ivRank: Math.max(0, Math.min(100, ivRank)),
    ivPercentile: Math.max(0, Math.min(100, ivPercentile)),
    high52w: +high52w.toFixed(4),
    low52w: +low52w.toFixed(4),
    dataPoints: history.length,
    lastUpdated: latest.date,
  };
}

// ── Batch: get IV rank for multiple tickers ──
export function getIVRankBatch(tickers: string[]): Map<string, IVRankData> {
  const result = new Map<string, IVRankData>();
  for (const ticker of tickers) {
    const data = getIVRank(ticker);
    if (data) result.set(ticker, data);
  }
  return result;
}

// ── Backfill multiple tickers (called on startup or manually) ──
export async function backfillTickers(tickers: string[], maxConcurrent: number = 5): Promise<{
  success: number;
  failed: number;
  skipped: number;
  total: number;
}> {
  let success = 0, failed = 0, skipped = 0;

  // Process in batches to respect rate limits
  for (let i = 0; i < tickers.length; i += maxConcurrent) {
    const batch = tickers.slice(i, i + maxConcurrent);
    const results = await Promise.allSettled(
      batch.map(async (ticker) => {
        const count = getTickerCount.get(ticker) as { cnt: number } | undefined;
        if (count && count.cnt > 200) {
          skipped++;
          return;
        }
        const stored = await backfillTicker(ticker);
        if (stored > 0) success++;
        else failed++;
      })
    );
    // Small delay between batches to avoid rate limiting
    if (i + maxConcurrent < tickers.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  return { success, failed, skipped, total: tickers.length };
}

// ── Get all tickers that have IV data ──
export function getTickersWithIVData(): string[] {
  const rows = db.prepare(`SELECT DISTINCT ticker FROM iv_history`).all() as { ticker: string }[];
  return rows.map((r) => r.ticker);
}

// ── Enrich trades with IV rank data ──
export function enrichTradesWithIVRank(trades: any[]): any[] {
  // Collect unique tickers
  const tickers = [...new Set(trades.map((t) => t.underlyingTicker).filter(Boolean))];
  const ivData = getIVRankBatch(tickers);

  return trades.map((trade) => {
    const iv = ivData.get(trade.underlyingTicker);
    return {
      ...trade,
      ivRank: iv?.ivRank ?? null,
      ivPercentile: iv?.ivPercentile ?? null,
      iv52wHigh: iv?.high52w ?? null,
      iv52wLow: iv?.low52w ?? null,
      currentIV: iv?.currentIV ?? null,
    };
  });
}
