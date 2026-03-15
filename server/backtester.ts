import https from "https";
import db from "./db";

// ── Types ──
export interface BacktestRequest {
  ticker: string;
  strategyType: "cash_secured_put" | "put_credit_spread" | "call_credit_spread" | "strangle" | "iron_condor";
  // Trade parameters (from the current screener pick)
  strikePrice: number;       // Sell strike (CSP/PCS) or put sell strike (Strangle/IC)
  strikePrice2?: number;     // Buy strike (PCS) or call sell strike (Strangle/IC)
  strikePrice3?: number;     // Put buy strike (IC)
  strikePrice4?: number;     // Call buy strike (IC)
  underlyingPrice: number;   // Current underlying price (for calculating strike distance %)
  daysToExpiration: number;  // Target DTE for each simulated entry
  netCredit: number;         // Credit per contract in current trade
  spreadWidth?: number;      // Width for PCS / IC wings
  lookbackMonths?: number;   // Default 6
}

export interface BacktestTrade {
  entryDate: string;
  exitDate: string;
  entryPrice: number;       // Underlying price at entry
  exitPrice: number;        // Underlying price at expiration
  strikeUsed: number;       // Sell strike for this iteration
  strike2Used?: number;     // Second strike
  strike3Used?: number;     // Third strike (IC)
  strike4Used?: number;     // Fourth strike (IC)
  creditReceived: number;   // Estimated credit scaled to underlying price
  pnlPerContract: number;   // Actual P&L (positive = profit)
  outcome: "profit" | "loss" | "partial";
  maxAdverseMove: number;   // Worst intra-period move against position (%)
}

export interface BacktestResult {
  ticker: string;
  strategyType: string;
  lookbackMonths: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnL: number;         // Sum of all trade P&L (per contract, in $)
  avgPnL: number;
  maxWin: number;
  maxLoss: number;
  maxDrawdown: number;       // Largest peak-to-trough drawdown
  sharpeRatio: number;       // Risk-adjusted return
  avgDTE: number;
  profitFactor: number;      // Gross profit / gross loss
  trades: BacktestTrade[];
  equityCurve: { date: string; equity: number }[];
  monthlyReturns: { month: string; pnl: number; trades: number }[];
  computedAt: string;
}

// ── Polygon API key ──
const POLYGON_API_KEY = process.env.POLYGON_API_KEY || "ySa69UMk92kM1oE7j227SiIK6WfoMh21";

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
      console.error(`Polygon API [${pathname.split("/").pop()}]: ${err.message}`);
      resolve(null);
    });
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

interface OHLCVBar {
  o: number;  // open
  h: number;  // high
  l: number;  // low
  c: number;  // close
  v: number;  // volume
  t: number;  // timestamp (ms)
}

// Simple rate limiter: track last call time and enforce min gap
let lastPolygonCall = 0;
const POLYGON_MIN_GAP_MS = 12500; // 5 calls/min = 12s gap to stay safe

async function rateLimitedPolygonCall(pathname: string, params: Record<string, string> = {}): Promise<any> {
  const now = Date.now();
  const elapsed = now - lastPolygonCall;
  if (elapsed < POLYGON_MIN_GAP_MS) {
    await new Promise(resolve => setTimeout(resolve, POLYGON_MIN_GAP_MS - elapsed));
  }
  lastPolygonCall = Date.now();

  for (let attempt = 0; attempt < 3; attempt++) {
    const data = await callPolygonDirect(pathname, params);
    if (data?.status === "ERROR" && data?.error?.includes("exceeded")) {
      console.log(`Polygon rate limit hit, waiting 15s (attempt ${attempt + 1}/3)...`);
      await new Promise(resolve => setTimeout(resolve, 15000));
      lastPolygonCall = Date.now();
      continue;
    }
    return data;
  }
  return null;
}

async function fetchHistoricalOHLCV(ticker: string, months: number): Promise<OHLCVBar[]> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);

  const from = startDate.toISOString().split("T")[0];
  const to = endDate.toISOString().split("T")[0];

  const data = await rateLimitedPolygonCall(`/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}`, {
    adjusted: "true",
    sort: "asc",
    limit: "5000",
  });

  return data?.results || [];
}

// ── Simulation helpers ──

/**
 * Scale PUT strike prices proportionally to the entry underlying price.
 * If the current trade is for AAPL at $178 with a 175 put strike (1.69% OTM),
 * and 3 months ago AAPL was at $165, the simulated strike would be ~$162.
 * Puts are OTM below the underlying.
 */
function scaleStrike(currentStrike: number, currentUnderlying: number, historicalUnderlying: number): number {
  const otmPct = (currentUnderlying - currentStrike) / currentUnderlying;
  return +(historicalUnderlying * (1 - otmPct)).toFixed(2);
}

/**
 * Scale CALL strike prices proportionally to the entry underlying price.
 * Calls are OTM above the underlying, so we need the inverse formula.
 * If current underlying is $100 and call sell strike is $105 (5% OTM above),
 * and historically the stock was $80, the simulated strike would be $84.
 */
function scaleCallStrike(currentStrike: number, currentUnderlying: number, historicalUnderlying: number): number {
  const otmPct = (currentStrike - currentUnderlying) / currentUnderlying;
  return +(historicalUnderlying * (1 + otmPct)).toFixed(2);
}

/**
 * Scale credit proportionally to the underlying price.
 * Premium is roughly proportional to stock price (higher priced stocks = higher absolute premium).
 */
function scaleCredit(currentCredit: number, currentUnderlying: number, historicalUnderlying: number): number {
  return +(currentCredit * (historicalUnderlying / currentUnderlying)).toFixed(2);
}

/**
 * Simulate a CSP trade: sell put at strike, collect credit.
 * Profitable if underlying >= strike at expiration.
 * Loss = (strike - exitPrice - credit) * 100 if assigned.
 */
function simulateCSP(
  entryPrice: number, exitPrice: number, minPrice: number,
  strike: number, credit: number
): { pnl: number; outcome: "profit" | "loss"; maxAdverse: number } {
  const maxAdverse = ((entryPrice - minPrice) / entryPrice) * 100;

  if (exitPrice >= strike) {
    // Option expires OTM — keep full credit
    return { pnl: credit * 100, outcome: "profit", maxAdverse };
  } else {
    // Assigned — loss is intrinsic value minus credit
    const intrinsic = strike - exitPrice;
    const pnl = (credit - intrinsic) * 100;
    return { pnl, outcome: pnl >= 0 ? "profit" : "loss", maxAdverse };
  }
}

/**
 * Simulate a PCS trade: sell higher put, buy lower put.
 * Max profit = net credit * 100; Max loss = (width - credit) * 100.
 */
function simulatePCS(
  entryPrice: number, exitPrice: number, minPrice: number,
  sellStrike: number, buyStrike: number, credit: number
): { pnl: number; outcome: "profit" | "loss" | "partial"; maxAdverse: number } {
  const width = sellStrike - buyStrike;
  const maxAdverse = ((entryPrice - minPrice) / entryPrice) * 100;

  if (exitPrice >= sellStrike) {
    // Both expire OTM
    return { pnl: credit * 100, outcome: "profit", maxAdverse };
  } else if (exitPrice <= buyStrike) {
    // Max loss
    return { pnl: -(width - credit) * 100, outcome: "loss", maxAdverse };
  } else {
    // Between strikes — partial loss
    const intrinsic = sellStrike - exitPrice;
    const pnl = (credit - intrinsic) * 100;
    return { pnl, outcome: pnl >= 0 ? "profit" : "loss", maxAdverse };
  }
}

/**
 * Simulate a CCS trade: sell lower call, buy higher call.
 * Max profit = net credit * 100; Max loss = (width - credit) * 100.
 * Profitable if underlying stays below sell strike at expiration.
 */
function simulateCCS(
  entryPrice: number, exitPrice: number, maxPrice: number,
  sellStrike: number, buyStrike: number, credit: number
): { pnl: number; outcome: "profit" | "loss" | "partial"; maxAdverse: number } {
  const width = buyStrike - sellStrike;
  const maxAdverse = ((maxPrice - entryPrice) / entryPrice) * 100;

  if (exitPrice <= sellStrike) {
    // Both expire OTM
    return { pnl: credit * 100, outcome: "profit", maxAdverse };
  } else if (exitPrice >= buyStrike) {
    // Max loss
    return { pnl: -(width - credit) * 100, outcome: "loss", maxAdverse };
  } else {
    // Between strikes — partial loss
    const intrinsic = exitPrice - sellStrike;
    const pnl = (credit - intrinsic) * 100;
    return { pnl, outcome: pnl >= 0 ? "profit" : "loss", maxAdverse };
  }
}

/**
 * Simulate a Strangle: sell OTM put + sell OTM call.
 * Profitable if price stays between put strike and call strike.
 */
function simulateStrangle(
  entryPrice: number, exitPrice: number, minPrice: number, maxPrice: number,
  putStrike: number, callStrike: number, credit: number
): { pnl: number; outcome: "profit" | "loss"; maxAdverse: number } {
  const downMove = ((entryPrice - minPrice) / entryPrice) * 100;
  const upMove = ((maxPrice - entryPrice) / entryPrice) * 100;
  const maxAdverse = Math.max(downMove, upMove);

  let intrinsicLoss = 0;
  if (exitPrice < putStrike) {
    intrinsicLoss += putStrike - exitPrice;
  }
  if (exitPrice > callStrike) {
    intrinsicLoss += exitPrice - callStrike;
  }

  const pnl = (credit - intrinsicLoss) * 100;
  return { pnl, outcome: pnl >= 0 ? "profit" : "loss", maxAdverse };
}

/**
 * Simulate an Iron Condor: PCS + CCS (bear call spread).
 * Max profit = total credit. Max loss = wider wing width - credit.
 */
function simulateIronCondor(
  entryPrice: number, exitPrice: number, minPrice: number, maxPrice: number,
  putSellStrike: number, putBuyStrike: number,
  callSellStrike: number, callBuyStrike: number,
  credit: number
): { pnl: number; outcome: "profit" | "loss" | "partial"; maxAdverse: number } {
  const downMove = ((entryPrice - minPrice) / entryPrice) * 100;
  const upMove = ((maxPrice - entryPrice) / entryPrice) * 100;
  const maxAdverse = Math.max(downMove, upMove);

  let intrinsicLoss = 0;

  // Put side
  if (exitPrice < putSellStrike) {
    const putLoss = Math.min(putSellStrike - exitPrice, putSellStrike - putBuyStrike);
    intrinsicLoss += putLoss;
  }

  // Call side
  if (exitPrice > callSellStrike) {
    const callLoss = Math.min(exitPrice - callSellStrike, callBuyStrike - callSellStrike);
    intrinsicLoss += callLoss;
  }

  const pnl = (credit - intrinsicLoss) * 100;
  const outcome = intrinsicLoss === 0 ? "profit" : pnl >= 0 ? "partial" : "loss";
  return { pnl, outcome, maxAdverse };
}

// ── Main backtest runner ──
export async function runBacktest(req: BacktestRequest): Promise<BacktestResult> {
  const months = req.lookbackMonths || 6;
  const bars = await fetchHistoricalOHLCV(req.ticker, months);

  if (bars.length < 20) {
    throw new Error(`Insufficient historical data for ${req.ticker}: only ${bars.length} bars`);
  }

  const trades: BacktestTrade[] = [];
  const dte = req.daysToExpiration;

  // Simulate entering a trade every week (every 5 trading days)
  // Each trade has a fixed DTE, so we look ahead `dte` bars for the exit price
  const entryInterval = 5; // Weekly entries

  for (let i = 0; i <= bars.length - dte - 1; i += entryInterval) {
    const entryBar = bars[i];
    const exitIdx = Math.min(i + dte, bars.length - 1);
    const exitBar = bars[exitIdx];
    const entryPrice = entryBar.c;
    const exitPrice = exitBar.c;

    // Find min/max price during the holding period
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    for (let j = i; j <= exitIdx; j++) {
      minPrice = Math.min(minPrice, bars[j].l);
      maxPrice = Math.max(maxPrice, bars[j].h);
    }

    const entryDate = new Date(entryBar.t).toISOString().split("T")[0];
    const exitDate = new Date(exitBar.t).toISOString().split("T")[0];

    // Scale strikes and credit to the historical price
    const currentUnderlying = req.underlyingPrice;

    let result: { pnl: number; outcome: "profit" | "loss" | "partial"; maxAdverse: number };
    let strikeUsed: number;
    let strike2Used: number | undefined;
    let strike3Used: number | undefined;
    let strike4Used: number | undefined;
    let creditUsed: number;

    switch (req.strategyType) {
      case "cash_secured_put": {
        strikeUsed = scaleStrike(req.strikePrice, currentUnderlying, entryPrice);
        creditUsed = scaleCredit(req.netCredit, currentUnderlying, entryPrice);
        result = simulateCSP(entryPrice, exitPrice, minPrice, strikeUsed, creditUsed);
        break;
      }
      case "put_credit_spread": {
        strikeUsed = scaleStrike(req.strikePrice, currentUnderlying, entryPrice);
        strike2Used = scaleStrike(req.strikePrice2!, currentUnderlying, entryPrice);
        creditUsed = scaleCredit(req.netCredit, currentUnderlying, entryPrice);
        result = simulatePCS(entryPrice, exitPrice, minPrice, strikeUsed, strike2Used, creditUsed);
        break;
      }
      case "call_credit_spread": {
        strikeUsed = scaleCallStrike(req.strikePrice, currentUnderlying, entryPrice);
        strike2Used = scaleCallStrike(req.strikePrice2!, currentUnderlying, entryPrice);
        creditUsed = scaleCredit(req.netCredit, currentUnderlying, entryPrice);
        result = simulateCCS(entryPrice, exitPrice, maxPrice, strikeUsed, strike2Used, creditUsed);
        break;
      }
      case "strangle": {
        strikeUsed = scaleStrike(req.strikePrice, currentUnderlying, entryPrice);
        strike2Used = scaleStrike(req.strikePrice2!, currentUnderlying, entryPrice);
        creditUsed = scaleCredit(req.netCredit, currentUnderlying, entryPrice);
        result = simulateStrangle(entryPrice, exitPrice, minPrice, maxPrice, strikeUsed, strike2Used, creditUsed);
        break;
      }
      case "iron_condor": {
        strikeUsed = scaleStrike(req.strikePrice, currentUnderlying, entryPrice);
        strike2Used = scaleStrike(req.strikePrice2!, currentUnderlying, entryPrice);
        strike3Used = scaleStrike(req.strikePrice3!, currentUnderlying, entryPrice);
        strike4Used = scaleStrike(req.strikePrice4!, currentUnderlying, entryPrice);
        creditUsed = scaleCredit(req.netCredit, currentUnderlying, entryPrice);
        result = simulateIronCondor(entryPrice, exitPrice, minPrice, maxPrice, strikeUsed, strike3Used, strike2Used, strike4Used, creditUsed);
        break;
      }
    }

    trades.push({
      entryDate,
      exitDate,
      entryPrice: +entryPrice.toFixed(2),
      exitPrice: +exitPrice.toFixed(2),
      strikeUsed,
      strike2Used,
      strike3Used,
      strike4Used,
      creditReceived: +creditUsed.toFixed(2),
      pnlPerContract: +result.pnl.toFixed(2),
      outcome: result.outcome as "profit" | "loss" | "partial",
      maxAdverseMove: +result.maxAdverse.toFixed(2),
    });
  }

  // ── Compute aggregate stats ──
  const wins = trades.filter(t => t.pnlPerContract >= 0).length;
  const losses = trades.filter(t => t.pnlPerContract < 0).length;
  const totalPnL = trades.reduce((s, t) => s + t.pnlPerContract, 0);
  const avgPnL = trades.length > 0 ? totalPnL / trades.length : 0;
  const maxWin = trades.length > 0 ? Math.max(...trades.map(t => t.pnlPerContract)) : 0;
  const maxLoss = trades.length > 0 ? Math.min(...trades.map(t => t.pnlPerContract)) : 0;

  const grossProfit = trades.filter(t => t.pnlPerContract > 0).reduce((s, t) => s + t.pnlPerContract, 0);
  const grossLoss = Math.abs(trades.filter(t => t.pnlPerContract < 0).reduce((s, t) => s + t.pnlPerContract, 0));
  const profitFactor = grossLoss > 0 ? +(grossProfit / grossLoss).toFixed(2) : grossProfit > 0 ? 999 : 0;

  // Equity curve + max drawdown
  const equityCurve: { date: string; equity: number }[] = [];
  let cumPnL = 0;
  let peak = 0;
  let maxDrawdown = 0;

  for (const t of trades) {
    cumPnL += t.pnlPerContract;
    equityCurve.push({ date: t.exitDate, equity: +cumPnL.toFixed(2) });
    peak = Math.max(peak, cumPnL);
    const dd = peak - cumPnL;
    maxDrawdown = Math.max(maxDrawdown, dd);
  }

  // Sharpe ratio (annualized, using trade returns)
  const returns = trades.map(t => t.pnlPerContract);
  const meanReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const stdReturn = returns.length > 1
    ? Math.sqrt(returns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / (returns.length - 1))
    : 0;
  const tradesPerYear = 52; // weekly
  const sharpeRatio = stdReturn > 0 ? +((meanReturn / stdReturn) * Math.sqrt(tradesPerYear)).toFixed(2) : 0;

  // Monthly returns
  const monthlyMap = new Map<string, { pnl: number; trades: number }>();
  for (const t of trades) {
    const month = t.exitDate.substring(0, 7); // YYYY-MM
    const existing = monthlyMap.get(month) || { pnl: 0, trades: 0 };
    existing.pnl += t.pnlPerContract;
    existing.trades++;
    monthlyMap.set(month, existing);
  }
  const monthlyReturns = Array.from(monthlyMap.entries())
    .map(([month, data]) => ({ month, pnl: +data.pnl.toFixed(2), trades: data.trades }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return {
    ticker: req.ticker,
    strategyType: req.strategyType,
    lookbackMonths: months,
    totalTrades: trades.length,
    wins,
    losses,
    winRate: trades.length > 0 ? +(wins / trades.length).toFixed(3) : 0,
    totalPnL: +totalPnL.toFixed(2),
    avgPnL: +avgPnL.toFixed(2),
    maxWin: +maxWin.toFixed(2),
    maxLoss: +maxLoss.toFixed(2),
    maxDrawdown: +maxDrawdown.toFixed(2),
    sharpeRatio,
    avgDTE: dte,
    profitFactor,
    trades,
    equityCurve,
    monthlyReturns,
    computedAt: new Date().toISOString(),
  };
}

// ── Backtest cache (SQLite) ──
// Cache results so repeated requests for the same trade don't re-fetch OHLCV
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function getCachedBacktest(cacheKey: string): BacktestResult | null {
  const row = db.prepare(
    `SELECT result_json, computed_at FROM backtest_cache WHERE cache_key = ?`
  ).get(cacheKey) as { result_json: string; computed_at: string } | undefined;

  if (!row) return null;
  const age = Date.now() - new Date(row.computed_at).getTime();
  if (age > CACHE_TTL_MS) {
    db.prepare(`DELETE FROM backtest_cache WHERE cache_key = ?`).run(cacheKey);
    return null;
  }
  return JSON.parse(row.result_json);
}

export function cacheBacktest(cacheKey: string, result: BacktestResult): void {
  db.prepare(
    `INSERT OR REPLACE INTO backtest_cache (cache_key, result_json, computed_at) VALUES (?, ?, ?)`
  ).run(cacheKey, JSON.stringify(result), result.computedAt);
}

export function buildCacheKey(req: BacktestRequest): string {
  return `${req.ticker}:${req.strategyType}:${req.strikePrice}:${req.strikePrice2 || ""}:${req.strikePrice3 || ""}:${req.strikePrice4 || ""}:${req.daysToExpiration}:${req.lookbackMonths || 6}`;
}

// ── Backtest quality check for pick-of-day ──
// Returns true if ANY cached backtest period for this ticker+strategy has negative avg returns.
// Returns false (passes) if no backtest data exists or all periods have positive avg returns.
export function hasNegativeBacktestReturns(ticker: string, strategyType: string): boolean {
  try {
    const rows = db.prepare(
      `SELECT result_json FROM backtest_cache WHERE cache_key LIKE ?`
    ).all(`${ticker}:${strategyType}:%`) as { result_json: string }[];

    if (rows.length === 0) return false; // No data — don't penalize

    for (const row of rows) {
      try {
        const result = JSON.parse(row.result_json) as BacktestResult;
        if (result.totalTrades > 0 && result.avgPnL < 0) {
          return true; // Found a period with negative average returns
        }
      } catch { /* skip malformed */ }
    }

    return false;
  } catch {
    return false;
  }
}

// ── Historical win rate lookup (from cached backtests) ──
// Returns the best (most recent, most trades) win rate for a ticker + strategy combo
export function getHistoricalWinRate(ticker: string, strategyType: string): number | null {
  try {
    const rows = db.prepare(
      `SELECT result_json FROM backtest_cache WHERE cache_key LIKE ?`
    ).all(`${ticker}:${strategyType}:%`) as { result_json: string }[];

    if (rows.length === 0) return null;

    // Find the result with the most trades (most reliable)
    let bestWinRate: number | null = null;
    let bestTotalTrades = 0;

    for (const row of rows) {
      try {
        const result = JSON.parse(row.result_json) as BacktestResult;
        if (result.totalTrades > bestTotalTrades) {
          bestTotalTrades = result.totalTrades;
          bestWinRate = result.winRate;
        }
      } catch { /* skip malformed */ }
    }

    return bestWinRate;
  } catch {
    return null;
  }
}
