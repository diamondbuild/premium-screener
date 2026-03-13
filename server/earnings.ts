import { execFileSync } from "child_process";
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

// ── Parse earnings text from finance API ──
function parseEarningsText(text: string): EarningsDate[] {
  const results: EarningsDate[] = [];
  const blocks = text.split(/\*\*/).filter(Boolean);

  let currentTicker = "";
  let currentDate = "";
  let currentTime = "";
  let currentFiscal = "";
  let currentStatus = "";

  for (const block of blocks) {
    // Ticker line: "Apple Inc. (AAPL)" or just ticker pattern
    const tickerMatch = block.match(/\(([A-Z.]{1,10})\)/);
    if (tickerMatch) {
      // If we had a previous entry, save it
      if (currentTicker && currentDate) {
        results.push({
          ticker: currentTicker,
          earningsDate: currentDate,
          earningsTime: currentTime,
          fiscalPeriod: currentFiscal,
          status: currentStatus,
        });
      }
      currentTicker = tickerMatch[1];
      currentDate = "";
      currentTime = "";
      currentFiscal = "";
      currentStatus = "";
    }

    // Parse the data lines
    const dateMatch = block.match(/Earnings Date:\s*(\d{4}-\d{2}-\d{2})\s+at\s+([^\n]+)/);
    if (dateMatch) {
      currentDate = dateMatch[1];
      currentTime = dateMatch[2].trim();
    }

    const fiscalMatch = block.match(/Fiscal Period:\s*([^\n]+)/);
    if (fiscalMatch) {
      currentFiscal = fiscalMatch[1].trim();
    }

    const statusMatch = block.match(/Status:\s*(\w+)/);
    if (statusMatch) {
      currentStatus = statusMatch[1].trim();
    }
  }

  // Don't forget the last entry
  if (currentTicker && currentDate) {
    results.push({
      ticker: currentTicker,
      earningsDate: currentDate,
      earningsTime: currentTime,
      fiscalPeriod: currentFiscal,
      status: currentStatus,
    });
  }

  return results;
}

// ── Call finance API via external-tool CLI ──
function callFinanceTool(toolName: string, args: Record<string, any>): any {
  const params = JSON.stringify({
    source_id: "finance",
    tool_name: toolName,
    arguments: args,
  });
  const result = execFileSync("external-tool", ["call", params], {
    encoding: "utf-8",
    timeout: 60_000,
  });
  return JSON.parse(result);
}

// ── Fetch earnings calendar for a date range ──
function fetchEarningsCalendar(startDate: string, endDate: string): EarningsDate[] {
  try {
    console.log(`Fetching earnings calendar: ${startDate} to ${endDate}`);
    const response = callFinanceTool("finance_earnings_schedule", {
      ticker_symbols: [],
      start_date: startDate,
      end_date: endDate,
    });

    // Response is { content: "[{...}]" } or similar
    let contentStr = response?.content || response?.result?.content || "";
    if (typeof contentStr !== "string") {
      contentStr = JSON.stringify(contentStr);
    }

    // Parse the JSON array if it's wrapped
    let textContent = contentStr;
    try {
      const parsed = JSON.parse(contentStr);
      if (Array.isArray(parsed)) {
        textContent = parsed.map((p: any) => p.content || "").join("\n");
      } else if (parsed.content) {
        textContent = parsed.content;
      }
    } catch {
      // Already a string, use as-is
    }

    const entries = parseEarningsText(textContent);
    console.log(`Parsed ${entries.length} earnings entries from calendar`);
    return entries;
  } catch (err: any) {
    console.error("Failed to fetch earnings calendar:", err?.message);
    return [];
  }
}

// ── Main: refresh earnings data ──
// Fetches earnings calendar for the next 75 days (covers max DTE of 60 + buffer)
// Caches in SQLite with 12hr TTL to avoid redundant API calls
export function refreshEarningsData(): number {
  const now = new Date();
  const meta = getMeta.get() as any;

  // Check if cache is fresh (12hr TTL)
  if (meta?.last_fetched) {
    const lastFetched = new Date(meta.last_fetched);
    const hoursSince = (now.getTime() - lastFetched.getTime()) / (1000 * 60 * 60);
    if (hoursSince < 12) {
      console.log(`Earnings cache is fresh (${hoursSince.toFixed(1)}h old), skipping refresh`);
      return 0;
    }
  }

  const startDate = now.toISOString().split("T")[0];
  const endDate = new Date(now.getTime() + 75 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const entries = fetchEarningsCalendar(startDate, endDate);

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
