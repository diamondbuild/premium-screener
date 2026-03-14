import db from "./db";

// ── Types ──
export interface EarningsDate {
  ticker: string;
  earningsDate: string;   // YYYY-MM-DD
  earningsTime: string;   // "17:00 ET" etc
  fiscalPeriod: string;   // "Q1 2026" etc
  status: string;         // "Upcoming" | "Reported"
}

// ── DB setup ──
db.exec(`
  CREATE TABLE IF NOT EXISTS earnings_cache (
    ticker TEXT NOT NULL,
    earnings_date TEXT NOT NULL,
    earnings_time TEXT,
    fiscal_period TEXT,
    status TEXT,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (ticker, earnings_date)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS earnings_fetch_meta (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    last_fetched TEXT NOT NULL,
    date_range_start TEXT NOT NULL,
    date_range_end TEXT NOT NULL
  )
`);

const upsertEarnings = db.prepare(`
  INSERT OR REPLACE INTO earnings_cache (ticker, earnings_date, earnings_time, fiscal_period, status, fetched_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const upsertMeta = db.prepare(`
  INSERT OR REPLACE INTO earnings_fetch_meta (id, last_fetched, date_range_start, date_range_end)
  VALUES (1, ?, ?, ?)
`);

const getMeta = db.prepare(`SELECT * FROM earnings_fetch_meta WHERE id = 1`);

const getUpcomingForTicker = db.prepare(`
  SELECT * FROM earnings_cache 
  WHERE ticker = ? AND earnings_date >= ? AND status = 'Upcoming'
  ORDER BY earnings_date ASC LIMIT 1
`);

const getAllUpcoming = db.prepare(`
  SELECT * FROM earnings_cache
  WHERE earnings_date >= ? AND status = 'Upcoming'
  ORDER BY earnings_date ASC
`);

// ── Fetch earnings for a single date from Nasdaq API ──
async function fetchEarningsForDate(dateStr: string): Promise<EarningsDate[]> {
  try {
    const resp = await fetch(
      `https://api.nasdaq.com/api/calendar/earnings?date=${dateStr}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; PremiumScreener/1.0)",
          Accept: "application/json",
        },
      }
    );
    if (!resp.ok) return [];
    const data = await resp.json();
    const rows = data?.data?.rows || [];
    return rows.map((r: any) => {
      const timeStr =
        r.time === "time-pre-market"
          ? "Before Market Open"
          : r.time === "time-after-hours"
          ? "After Market Close"
          : r.time === "time-not-supplied"
          ? "TBD"
          : r.time || "TBD";
      return {
        ticker: r.symbol,
        earningsDate: dateStr,
        earningsTime: timeStr,
        fiscalPeriod: r.fiscalQuarterEnding || "",
        status: "Upcoming",
      };
    });
  } catch {
    return [];
  }
}

// ── Fetch earnings calendar for a date range ──
async function fetchEarningsCalendar(
  startDate: string,
  endDate: string
): Promise<EarningsDate[]> {
  console.log(`Fetching earnings calendar: ${startDate} to ${endDate}`);
  const all: EarningsDate[] = [];
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");

  // Iterate weekdays only (earnings never report on weekends)
  const cursor = new Date(start);
  const datesToFetch: string[] = [];
  while (cursor <= end) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) {
      datesToFetch.push(cursor.toISOString().split("T")[0]);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  // Fetch in parallel batches of 5 to be polite
  const BATCH = 5;
  for (let i = 0; i < datesToFetch.length; i += BATCH) {
    const batch = datesToFetch.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(fetchEarningsForDate));
    for (const r of results) all.push(...r);
    // Small delay between batches
    if (i + BATCH < datesToFetch.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  console.log(
    `Fetched ${all.length} earnings entries across ${datesToFetch.length} trading days`
  );
  return all;
}

// ── Main: refresh earnings data ──
// Fetches earnings calendar for the next 75 days (covers max DTE of 60 + buffer)
// Caches in SQLite with 12hr TTL to avoid redundant API calls
export async function refreshEarningsData(force = false): Promise<number> {
  const now = new Date();
  const meta = getMeta.get() as any;

  // Check if cache is fresh (12hr TTL) — skip if force=true
  if (!force && meta?.last_fetched) {
    const lastFetched = new Date(meta.last_fetched);
    const hoursSince = (now.getTime() - lastFetched.getTime()) / (1000 * 60 * 60);
    if (hoursSince < 12) {
      console.log(`Earnings cache is fresh (${hoursSince.toFixed(1)}h old), skipping refresh`);
      return 0;
    }
  }

  const startDate = now.toISOString().split("T")[0];
  const endDate = new Date(now.getTime() + 75 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const entries = await fetchEarningsCalendar(startDate, endDate);

  if (entries.length === 0) {
    console.warn("No earnings data fetched — keeping existing cache");
    return 0;
  }

  // Bulk upsert
  const insertMany = db.transaction((items: EarningsDate[]) => {
    const fetchedAt = now.toISOString();
    for (const e of items) {
      upsertEarnings.run(e.ticker, e.earningsDate, e.earningsTime, e.fiscalPeriod, e.status, fetchedAt);
    }
  });

  insertMany(entries);

  // Update meta
  upsertMeta.run(now.toISOString(), startDate, endDate);

  console.log(`Cached ${entries.length} earnings entries (${startDate} to ${endDate})`);
  return entries.length;
}

// ── Bulk import earnings data (from external source) ──
export function importEarningsData(entries: EarningsDate[]): number {
  if (entries.length === 0) return 0;
  const now = new Date();
  const insertMany = db.transaction((items: EarningsDate[]) => {
    const fetchedAt = now.toISOString();
    for (const e of items) {
      upsertEarnings.run(e.ticker, e.earningsDate, e.earningsTime, e.fiscalPeriod, e.status, fetchedAt);
    }
  });
  insertMany(entries);
  // Update meta so cache TTL starts fresh
  const dates = entries.map(e => e.earningsDate).sort();
  upsertMeta.run(now.toISOString(), dates[0], dates[dates.length - 1]);
  console.log(`Imported ${entries.length} earnings entries`);
  return entries.length;
}

// ── Lookup: get next earnings date for a ticker ──
export function getNextEarnings(ticker: string): EarningsDate | null {
  const today = new Date().toISOString().split("T")[0];
  const row = getUpcomingForTicker.get(ticker, today) as any;
  if (!row) return null;
  return {
    ticker: row.ticker,
    earningsDate: row.earnings_date,
    earningsTime: row.earnings_time,
    fiscalPeriod: row.fiscal_period,
    status: row.status,
  };
}

// ── Lookup: get all upcoming earnings (for the earnings calendar view) ──
export function getAllUpcomingEarnings(): EarningsDate[] {
  const today = new Date().toISOString().split("T")[0];
  const rows = getAllUpcoming.all(today) as any[];
  return rows.map(row => ({
    ticker: row.ticker,
    earningsDate: row.earnings_date,
    earningsTime: row.earnings_time,
    fiscalPeriod: row.fiscal_period,
    status: row.status,
  }));
}

// ── Enrich trades with earnings data ──
export function enrichTradesWithEarnings(trades: any[]): any[] {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  return trades.map(trade => {
    const earnings = getNextEarnings(trade.underlyingTicker);
    if (!earnings) {
      return {
        ...trade,
        earningsDate: null,
        daysToEarnings: null,
        hasEarningsBeforeExpiry: false,
      };
    }

    const earningsDateObj = new Date(earnings.earningsDate + "T00:00:00");
    const expirationDateObj = new Date(trade.expirationDate + "T00:00:00");
    const daysToEarnings = Math.ceil((earningsDateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const hasEarningsBeforeExpiry = earningsDateObj <= expirationDateObj;

    return {
      ...trade,
      earningsDate: earnings.earningsDate,
      daysToEarnings: Math.max(0, daysToEarnings),
      hasEarningsBeforeExpiry,
      earningsFiscalPeriod: earnings.fiscalPeriod,
    };
  });
}
