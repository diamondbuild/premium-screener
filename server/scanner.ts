import type { StrategyTrade, OptionLeg } from "@shared/schema";
import { storage } from "./storage";
import { execFileSync, execFile } from "child_process";
import { promisify } from "util";
import { storeAtmIV } from "./iv-rank";
import https from "https";

const execFileAsync = promisify(execFile);

// ── S&P 500 + NASDAQ 100 merged universe (deduplicated, ~518 tickers) ──
const UNIVERSE_TICKERS_EMBEDDED = [
  "AAPL", "ABBV", "ABNB", "ABT", "ACN", "ADBE", "ADI", "ADM", "ADP", "ADSK", "AEE", "AEP", "AES", "AFL",
  "AIG", "AIZ", "AJG", "AKAM", "ALB", "ALGN", "ALL", "ALLE", "ALNY", "AMAT", "AMCR", "AMD", "AME",
  "AMGN", "AMP", "AMT", "AMZN", "ANET", "ANSS", "AON", "AOS", "APA", "APD", "APH", "APP", "APTV",
  "ARE", "ARM", "ASML", "ATO", "ATVI", "AVB", "AVGO", "AVY", "AWK", "AXON", "AXP", "AZO",
  "BA", "BAC", "BAX", "BBWI", "BBY", "BDX", "BEN", "BF.B", "BG", "BIIB", "BIO", "BK", "BKNG", "BKR",
  "BLDR", "BLK", "BMY", "BR", "BRK.B", "BRO", "BSX", "BWA", "BXP",
  "C", "CAG", "CAH", "CARR", "CAT", "CB", "CBOE", "CBRE", "CCEP", "CCI", "CCL", "CDAY", "CDNS", "CDW",
  "CE", "CEG", "CF", "CFG", "CHD", "CHRW", "CHTR", "CI", "CINF", "CL", "CLX", "CMA", "CMCSA", "CME",
  "CMG", "CMI", "CMS", "CNC", "CNP", "COF", "COO", "COP", "COR", "COST", "CPAY", "CPB", "CPRT", "CPT",
  "CRL", "CRM", "CRWD", "CSCO", "CSGP", "CSX", "CTAS", "CTLT", "CTRA", "CTSH", "CTVA", "CVS", "CVX", "CZR",
  "D", "DAL", "DASH", "DAY", "DD", "DDOG", "DE", "DECK", "DFS", "DG", "DGX", "DHI", "DHR", "DIS", "DLTR",
  "DOV", "DOW", "DPZ", "DRI", "DTE", "DUK", "DVA", "DVN", "DXCM",
  "EA", "EBAY", "ECL", "ED", "EFX", "EG", "EIX", "EL", "EMN", "EMR", "ENPH", "EOG", "EPAM", "EQIX",
  "EQR", "EQT", "ES", "ESS", "ETN", "ETR", "EVRG", "EW", "EXC", "EXPD", "EXPE", "EXR",
  "F", "FANG", "FAST", "FCNCA", "FCX", "FDS", "FDX", "FE", "FER", "FFIV", "FI", "FICO", "FIS", "FISV",
  "FITB", "FLT", "FMC", "FOX", "FOXA", "FRT", "FSLR", "FTNT", "FTV",
  "GD", "GDDY", "GE", "GEHC", "GEN", "GILD", "GIS", "GL", "GLW", "GM", "GNRC", "GOOG", "GOOGL",
  "GPC", "GPN", "GRMN", "GS", "GWW",
  "HAL", "HAS", "HBAN", "HCA", "HD", "HOLX", "HON", "HPE", "HPQ", "HRL", "HSIC", "HST", "HSY",
  "HUBB", "HUM", "HWM",
  "IBM", "ICE", "IDXX", "IEX", "IFF", "ILMN", "INCY", "INSM", "INTC", "INTU", "INVH", "IP", "IPG",
  "IQV", "IR", "IRM", "ISRG", "IT", "ITW", "IVZ",
  "J", "JBHT", "JBL", "JCI", "JKHY", "JNJ", "JNPR", "JPM",
  "K", "KDP", "KEY", "KEYS", "KHC", "KIM", "KLAC", "KMB", "KMI", "KMX", "KO", "KR", "KVUE",
  "L", "LDOS", "LEN", "LH", "LHX", "LIN", "LKQ", "LLY", "LMT", "LNT", "LOW", "LRCX", "LULU",
  "LUV", "LVS", "LW", "LYB", "LYV",
  "MA", "MAA", "MAR", "MAS", "MCD", "MCHP", "MCK", "MCO", "MDLZ", "MDT", "MELI", "MET", "META",
  "MGM", "MHK", "MKC", "MKTX", "MLM", "MMC", "MMM", "MNST", "MO", "MOH", "MOS", "MPC", "MPWR",
  "MRK", "MRNA", "MRVL", "MS", "MSCI", "MSFT", "MSI", "MSTR", "MTB", "MTCH", "MTD", "MU",
  "NCLH", "NDAQ", "NDSN", "NEE", "NEM", "NFLX", "NI", "NKE", "NOC", "NOW", "NRG", "NSC", "NTAP",
  "NTRS", "NUE", "NVDA", "NVR", "NWS", "NWSA", "NXPI",
  "O", "ODFL", "OKE", "OMC", "ON", "ORCL", "ORLY", "OTIS", "OXY",
  "PANW", "PARA", "PAYC", "PAYX", "PCAR", "PCG", "PDD", "PEG", "PEP", "PFE", "PFG", "PG", "PGR",
  "PH", "PHM", "PKG", "PLD", "PLTR", "PM", "PNC", "PNR", "PNW", "PODD", "POOL", "PPG", "PPL",
  "PRU", "PSA", "PSX", "PTC", "PVH", "PWR", "PXD", "PYPL",
  "QCOM", "QRVO",
  "RCL", "REG", "REGN", "RF", "RHI", "RJF", "RL", "RMD", "ROK", "ROL", "ROP", "ROST", "RSG", "RTX", "RVTY",
  "SBAC", "SBUX", "SCHW", "SEE", "SHOP", "SHW", "SJM", "SLB", "SMCI", "SNA", "SNPS", "SO", "SOLV",
  "SPG", "SPGI", "SRE", "STE", "STLD", "STT", "STX", "STZ", "SWK", "SWKS", "SYF", "SYK", "SYY",
  "T", "TAP", "TDG", "TDY", "TEAM", "TECH", "TEL", "TER", "TFC", "TFX", "TGT", "TJX", "TMO", "TMUS",
  "TPR", "TRGP", "TRI", "TRMB", "TROW", "TRV", "TSCO", "TSLA", "TSN", "TT", "TTWO", "TXN", "TXT",
  "TYL", "UAL", "UBER", "UDR", "UHS", "ULTA", "UNH", "UNP", "UPS", "URI", "USB",
  "V", "VICI", "VLO", "VLTO", "VMC", "VRSK", "VRSN", "VRTX", "VTR", "VTRS", "VZ",
  "WAB", "WAT", "WBA", "WBD", "WDAY", "WDC", "WEC", "WELL", "WFC", "WM", "WMB", "WMT", "WRB", "WRK",
  "WST", "WTW", "WY", "WYNN",
  "XEL", "XOM", "XRAY", "XYL",
  "YUM",
  "ZBH", "ZBRA", "ZION", "ZS", "ZTS"
];

// ── Dynamic ticker source: tries SPY+QQQ ETF holdings first, falls back to embedded ──
let cachedTickers: string[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function fetchETFHoldings(etfSymbol: string, etfName: string): Set<string> | null {
  try {
    const payload = JSON.stringify({
      source_id: "finance",
      tool_name: "finance_etf_holdings",
      arguments: {
        ticker_symbols: [etfSymbol],
        ticker_names: [etfName],
        query: `List all holdings in ${etfSymbol} ETF with their ticker symbols`,
      },
    });
    const raw = execFileSync("external-tool", ["call", payload], {
      timeout: 30000,
      encoding: "utf-8",
    });
    const parsed = JSON.parse(raw);
    let content = parsed?.result?.content || parsed?.content || "";
    if (typeof content === "string") {
      const tickerRegex = /\b([A-Z]{1,5}(?:\.[A-Z])?)\b/g;
      const found = new Set<string>();
      let match;
      while ((match = tickerRegex.exec(content)) !== null) {
        const t = match[1];
        const skipWords = new Set(["ETF", "SPY", "QQQ", "USD", "THE", "FOR", "AND", "ARE", "NOT", "ALL", "TOP", "HAS", "NEW", "INC", "LTD", "EST", "AVG"]);
        if (!skipWords.has(t) && t.length >= 1 && t.length <= 5) {
          found.add(t);
        }
      }
      if (found.size >= 50) {
        console.log(`Dynamic ${etfSymbol} holdings: ${found.size} tickers fetched`);
        return found;
      }
    }
    return null;
  } catch (err: any) {
    console.warn(`Failed to fetch ${etfSymbol} holdings dynamically:`, err?.message?.slice(0, 100));
    return null;
  }
}

export function getUniverseTickers(): string[] {
  const now = Date.now();
  if (cachedTickers && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedTickers;
  }

  // Try dynamic fetch of SPY + QQQ and merge
  const spyHoldings = fetchETFHoldings("SPY", "SPDR S&P 500 ETF Trust");
  if (spyHoldings && spyHoldings.size >= 400) {
    // Also try QQQ to ensure NASDAQ 100 coverage
    const qqqHoldings = fetchETFHoldings("QQQ", "Invesco QQQ Trust");
    const merged = new Set(spyHoldings);
    if (qqqHoldings) {
      for (const t of qqqHoldings) merged.add(t);
    }
    cachedTickers = Array.from(merged).sort();
    cacheTimestamp = now;
    console.log(`Using dynamic SPY+QQQ ETF holdings: ${cachedTickers.length} tickers`);
    return cachedTickers;
  }

  // Fallback to embedded list
  cachedTickers = UNIVERSE_TICKERS_EMBEDDED;
  cacheTimestamp = now;
  console.log(`Using embedded S&P 500 + NASDAQ 100 list: ${UNIVERSE_TICKERS_EMBEDDED.length} tickers`);
  return UNIVERSE_TICKERS_EMBEDDED;
}

// Backward-compatible aliases
export const getSP500Tickers = getUniverseTickers;
const SP500_TICKERS = UNIVERSE_TICKERS_EMBEDDED;

// ── Polygon API key (Options Developer plan — 15-min delayed) ──
const POLYGON_API_KEY = process.env.POLYGON_API_KEY || "ySa69UMk92kM1oE7j227SiIK6WfoMh21";

// ── Call Polygon API directly via HTTPS (better data than connector) ──
async function callPolygonDirect(pathname: string, params: Record<string, string> = {}): Promise<any> {
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

// ── Fallback: Call finance_massive via the external-tool CLI ──
// Used by IV backfill and as fallback for aggregates endpoints.
function callMassiveSync(pathname: string, params: Record<string, string> = {}): any {
  const payload = JSON.stringify({
    source_id: "finance",
    tool_name: "finance_massive",
    arguments: { pathname, params },
  });
  try {
    const raw = execFileSync("external-tool", ["call", payload], {
      timeout: 30000,
      encoding: "utf-8",
    });
    return parseMassiveResponse(raw);
  } catch (err: any) {
    const msg = err.stderr?.toString()?.slice(0, 120) || err.message?.slice(0, 120) || "unknown";
    console.error(`API [${pathname.split("?")[0].split("/").pop()}]: ${msg}`);
    return null;
  }
}

// Async connector fallback (kept for non-snapshot endpoints if needed)
async function callMassive(pathname: string, params: Record<string, string> = {}): Promise<any> {
  const payload = JSON.stringify({
    source_id: "finance",
    tool_name: "finance_massive",
    arguments: { pathname, params },
  });
  try {
    const { stdout } = await execFileAsync("external-tool", ["call", payload], {
      timeout: 30000,
      encoding: "utf-8",
    });
    return parseMassiveResponse(stdout as string);
  } catch (err: any) {
    const msg = err.stderr?.toString()?.slice(0, 120) || err.message?.slice(0, 120) || "unknown";
    console.error(`API [${pathname.split("?")[0].split("/").pop()}]: ${msg}`);
    return null;
  }
}

function parseMassiveResponse(raw: string): any {
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.result?.content) {
      return JSON.parse(parsed.result.content);
    }
    if (parsed?.content && typeof parsed.content === "string") {
      return JSON.parse(parsed.content);
    }
    return parsed;
  } catch {
    return null;
  }
}

// ── Types for Polygon response ──
interface PolygonOption {
  day?: { volume?: number; close?: number; high?: number; low?: number; open?: number; vwap?: number; change?: number; change_percent?: number; previous_close?: number; };
  details?: {
    contract_type?: string;
    expiration_date?: string;
    strike_price?: number;
    ticker?: string;
  };
  greeks?: {
    delta?: number;
    gamma?: number;
    theta?: number;
    vega?: number;
  };
  implied_volatility?: number;
  last_quote?: { ask?: number; bid?: number; midpoint?: number; };
  last_trade?: { price?: number; size?: number; sip_timestamp?: number; timeframe?: string; };
  open_interest?: number;
  underlying_asset?: { price?: number; ticker?: string; timeframe?: string; };
  fmv?: number; // Fair market value (available on Business plans)
  break_even_price?: number;
}

// ── Helpers ──
function getDTE(expDate: string): number {
  const exp = new Date(expDate + "T16:00:00-05:00");
  return Math.max(1, Math.ceil((exp.getTime() - Date.now()) / 86400000));
}

function dateOffsetISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function makeLegFromPolygon(opt: PolygonOption, action: "sell" | "buy"): OptionLeg | null {
  if (!opt.details || !opt.greeks?.delta) return null;

  const strike = opt.details.strike_price!;
  const underlying = opt.underlying_asset?.price || 0;
  const ctype = opt.details.contract_type;
  const absDelta = Math.abs(opt.greeks.delta!);
  const iv = opt.implied_volatility || 0;

  // ── Step 1: Determine best available price ──
  // Priority: last_quote (Business plan) > last_trade (Developer plan) > day.close > fmv
  let bid = opt.last_quote?.bid || 0;
  let ask = opt.last_quote?.ask || 0;
  let mid = opt.last_quote?.midpoint || 0;
  let usingFallback = false;

  if (mid <= 0 && bid <= 0) {
    // No live bid/ask quotes — try last_trade price (Developer plan, 15-min delayed)
    const tradePrice = opt.last_trade?.price || 0;
    const dayClose = opt.day?.close || 0;
    // Prefer last_trade if available and recent; otherwise day.close
    const bestPrice = tradePrice > 0 ? tradePrice : (dayClose > 0 ? dayClose : (opt.fmv || 0));
    if (bestPrice <= 0) return null;
    mid = bestPrice;
    usingFallback = !tradePrice; // Only flag as "fallback" if no last_trade
    // Synthesize bid/ask with a spread based on the day's range if available
    const dayHigh = opt.day?.high || 0;
    const dayLow = opt.day?.low || 0;
    const daySpread = dayHigh > dayLow && dayLow > 0 ? (dayHigh - dayLow) * 0.3 : 0;
    const spread = daySpread > 0.02 ? daySpread : Math.max(0.05, bestPrice * 0.05);
    bid = +Math.max(0.01, bestPrice - spread / 2).toFixed(2);
    ask = +(bestPrice + spread / 2).toFixed(2);
  } else if (mid <= 0) {
    mid = +((bid + ask) / 2).toFixed(2);
  }

  if (mid <= 0.01) return null;

  // ── Step 2: Strict validation when using fallback pricing ──
  // Fallback prices (day.close/fmv) can be stale from trades made days/weeks
  // ago at very different underlying prices. Apply aggressive sanity checks.
  if (underlying > 0) {
    const intrinsic = ctype === "put"
      ? Math.max(strike - underlying, 0)
      : Math.max(underlying - strike, 0);

    // Put can never be worth more than its strike price
    if (ctype === "put" && mid > strike) return null;
    // Call can never be worth more than the underlying
    if (ctype === "call" && mid > underlying) return null;

    // ── Delta-based premium bounds ──
    // For OTM options, the premium should correlate with delta.
    if (absDelta > 0 && absDelta < 0.50) {
      const maxTimeValue = absDelta * underlying * 2.0;
      const timeValue = mid - intrinsic;
      if (timeValue > maxTimeValue) return null;
    }

    // ── Theta-based cross-validation (most reliable stale price detector) ──
    // Greeks (theta, delta, vega) are computed from CURRENT underlying price
    // and IV model, independent of the stale day.close/fmv quote.
    // Total remaining theta ≈ abs(theta) * DTE gives an independent price est.
    // If the quoted price vastly exceeds this, the quote is stale.
    // E.g. ENPH $34 put: theta=-0.025, DTE=29 → est=$0.73, but quote=$2.47
    const absTheta = Math.abs(opt.greeks.theta || 0);
    if (usingFallback && absTheta > 0 && absDelta < 0.50 && absDelta > 0.01) {
      const dte = getDTE(opt.details.expiration_date!);
      // Theta-based estimate with generous 3x multiplier (theta accelerates)
      const thetaEstimate = absTheta * dte * 3.0;
      if (mid > thetaEstimate + intrinsic && mid > 0.20) {
        return null;
      }
    }

    // ── Absolute premium cap ──
    const maxReasonable = intrinsic + underlying * 0.10;
    if (mid > maxReasonable) return null;
  }

  // ── Step 3: Liquidity gate for fallback pricing ──
  // When using stale fallback data, require evidence of recent trading
  // activity to reduce garbage from illiquid strikes.
  if (usingFallback) {
    const oi = opt.open_interest || 0;
    const vol = opt.day?.volume || 0;
    // Require either some daily volume OR meaningful open interest
    if (vol === 0 && oi < 50) return null;
  }

  return {
    ticker: opt.details.ticker!,
    contractType: opt.details.contract_type as "put" | "call",
    strikePrice: strike,
    expirationDate: opt.details.expiration_date!,
    action,
    bid,
    ask,
    midpoint: +mid.toFixed(2),
    delta: opt.greeks.delta,
    gamma: opt.greeks.gamma || 0,
    theta: opt.greeks.theta || 0,
    vega: opt.greeks.vega || 0,
    impliedVolatility: iv,
    openInterest: opt.open_interest || 0,
    volume: opt.day?.volume || 0,
  };
}

function computeScore(trade: Partial<StrategyTrade>): number {
  const deltaScore = Math.min(Math.abs(trade.deltaZScore || 0) / 3, 1) * 35;
  const rocScore = Math.min((trade.annualizedROC || 0) / 120, 1) * 25;
  const probScore = (trade.probabilityOfProfit || 0) * 25;
  const liqScore = Math.min((trade.totalVolume || 0) / ((trade.minOpenInterest || 1) * 3), 1) * 15;
  return +(deltaScore + rocScore + probScore + liqScore).toFixed(2);
}

function computeZScores(opts: PolygonOption[]): Map<string, number> {
  const deltas = opts.filter(o => o.greeks?.delta != null).map(o => Math.abs(o.greeks!.delta!));
  const avg = deltas.length > 0 ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0;
  const std = deltas.length > 1
    ? Math.sqrt(deltas.reduce((s, d) => s + (d - avg) ** 2, 0) / (deltas.length - 1))
    : 0.1;
  const zMap = new Map<string, number>();
  for (const o of opts) {
    if (o.details?.ticker && o.greeks?.delta) {
      zMap.set(o.details.ticker, std > 0 ? (Math.abs(o.greeks.delta) - avg) / std : 0);
    }
  }
  return zMap;
}

// ── Fetch options chain via direct Polygon API (Developer plan, 15-min delayed) ──
async function fetchChain(
  ticker: string, contractType: "put" | "call",
  minDTE: number, maxDTE: number
): Promise<PolygonOption[]> {
  const data = await callPolygonDirect(`/v3/snapshot/options/${ticker}`, {
    contract_type: contractType,
    "expiration_date.gte": dateOffsetISO(minDTE),
    "expiration_date.lte": dateOffsetISO(maxDTE),
    limit: "250",
    order: "desc",
  });
  return data?.results || [];
}

// ── Strategy builders ──
let idCounter = 0;

function buildCSP(putOpt: PolygonOption, zScore: number, minOI: number, minPOP: number): StrategyTrade | null {
  const leg = makeLegFromPolygon(putOpt, "sell");
  if (!leg || leg.openInterest < minOI) return null;
  const absDelta = Math.abs(leg.delta);
  const pop = 1 - absDelta;
  if (pop < minPOP) return null;
  const dte = getDTE(leg.expirationDate);
  const credit = leg.midpoint;
  const maxLossAmt = (leg.strikePrice - credit) * 100;
  const annROC = maxLossAmt > 0 ? (credit * 100 / maxLossAmt) * (365 / dte) * 100 : 0;

  const trade: StrategyTrade = {
    id: `csp-${++idCounter}`,
    strategyType: "cash_secured_put",
    underlyingTicker: putOpt.underlying_asset?.ticker || "",
    underlyingPrice: putOpt.underlying_asset?.price || 0,
    legs: [leg],
    expirationDate: leg.expirationDate,
    daysToExpiration: dte,
    netCredit: credit,
    maxProfit: credit * 100,
    maxLoss: -maxLossAmt,
    breakEvenLow: +(leg.strikePrice - credit).toFixed(2),
    breakEvenHigh: null,
    riskRewardRatio: maxLossAmt > 0 ? +((credit * 100) / maxLossAmt).toFixed(3) : 0,
    probabilityOfProfit: +pop.toFixed(3),
    netDelta: leg.delta,
    netTheta: leg.theta,
    netVega: -leg.vega,
    avgIV: leg.impliedVolatility,
    deltaZScore: +zScore.toFixed(2),
    annualizedROC: +annROC.toFixed(1),
    premiumPerDay: +(credit * 100 / dte).toFixed(2),
    compositeScore: 0,
    minOpenInterest: leg.openInterest,
    totalVolume: leg.volume,
    spreadWidth: null,
  };
  trade.compositeScore = computeScore(trade);
  return trade;
}

function buildPutCreditSpread(
  sellOpt: PolygonOption, buyOpt: PolygonOption, zScore: number, minOI: number, minPOP: number
): StrategyTrade | null {
  const sellLeg = makeLegFromPolygon(sellOpt, "sell");
  const buyLeg = makeLegFromPolygon(buyOpt, "buy");
  if (!sellLeg || !buyLeg) return null;
  if (sellLeg.openInterest < minOI || buyLeg.openInterest < minOI) return null;
  const pop = 1 - Math.abs(sellLeg.delta);
  if (pop < minPOP) return null;
  const width = sellLeg.strikePrice - buyLeg.strikePrice;
  if (width <= 0) return null;
  const dte = getDTE(sellLeg.expirationDate);
  const netCredit = +(sellLeg.midpoint - buyLeg.midpoint).toFixed(2);
  if (netCredit <= 0.05) return null;
  const maxLoss = (width - netCredit) * 100;
  const annROC = maxLoss > 0 ? (netCredit * 100 / maxLoss) * (365 / dte) * 100 : 0;

  const trade: StrategyTrade = {
    id: `pcs-${++idCounter}`,
    strategyType: "put_credit_spread",
    underlyingTicker: sellOpt.underlying_asset?.ticker || "",
    underlyingPrice: sellOpt.underlying_asset?.price || 0,
    legs: [sellLeg, buyLeg],
    expirationDate: sellLeg.expirationDate,
    daysToExpiration: dte,
    netCredit,
    maxProfit: netCredit * 100,
    maxLoss: -maxLoss,
    breakEvenLow: +(sellLeg.strikePrice - netCredit).toFixed(2),
    breakEvenHigh: null,
    riskRewardRatio: maxLoss > 0 ? +((netCredit * 100) / maxLoss).toFixed(3) : 0,
    probabilityOfProfit: +pop.toFixed(3),
    netDelta: +(sellLeg.delta - buyLeg.delta).toFixed(4),
    netTheta: +(sellLeg.theta + buyLeg.theta).toFixed(4),
    netVega: +(-(sellLeg.vega) + buyLeg.vega).toFixed(4),
    avgIV: sellLeg.impliedVolatility,
    deltaZScore: +zScore.toFixed(2),
    annualizedROC: +annROC.toFixed(1),
    premiumPerDay: +(netCredit * 100 / dte).toFixed(2),
    compositeScore: 0,
    minOpenInterest: Math.min(sellLeg.openInterest, buyLeg.openInterest),
    totalVolume: sellLeg.volume + buyLeg.volume,
    spreadWidth: width,
  };
  trade.compositeScore = computeScore(trade);
  return trade;
}

function buildStrangle(
  putOpt: PolygonOption, callOpt: PolygonOption,
  putZScore: number, callZScore: number,
  minOI: number, minPOP: number
): StrategyTrade | null {
  const putLeg = makeLegFromPolygon(putOpt, "sell");
  const callLeg = makeLegFromPolygon(callOpt, "sell");
  if (!putLeg || !callLeg) return null;
  if (putLeg.openInterest < minOI || callLeg.openInterest < minOI) return null;
  const combinedPOP = (1 - Math.abs(putLeg.delta)) * (1 - Math.abs(callLeg.delta));
  if (combinedPOP < minPOP) return null;
  const dte = getDTE(putLeg.expirationDate);
  const netCredit = +(putLeg.midpoint + callLeg.midpoint).toFixed(2);
  const underlyingPrice = putOpt.underlying_asset?.price || 0;
  const margin = underlyingPrice * 20; // ~20% of underlying
  const annROC = margin > 0 ? (netCredit * 100 / margin) * (365 / dte) * 100 : 0;

  const trade: StrategyTrade = {
    id: `str-${++idCounter}`,
    strategyType: "strangle",
    underlyingTicker: putOpt.underlying_asset?.ticker || "",
    underlyingPrice,
    legs: [putLeg, callLeg],
    expirationDate: putLeg.expirationDate,
    daysToExpiration: dte,
    netCredit,
    maxProfit: netCredit * 100,
    maxLoss: -999999,
    breakEvenLow: +(putLeg.strikePrice - netCredit).toFixed(2),
    breakEvenHigh: +(callLeg.strikePrice + netCredit).toFixed(2),
    riskRewardRatio: 0,
    probabilityOfProfit: +combinedPOP.toFixed(3),
    netDelta: +(putLeg.delta + callLeg.delta).toFixed(4),
    netTheta: +(putLeg.theta + callLeg.theta).toFixed(4),
    netVega: +(-(putLeg.vega + callLeg.vega)).toFixed(4),
    avgIV: +((putLeg.impliedVolatility + callLeg.impliedVolatility) / 2).toFixed(3),
    deltaZScore: +((Math.abs(putZScore) + Math.abs(callZScore)) / 2).toFixed(2),
    annualizedROC: +annROC.toFixed(1),
    premiumPerDay: +(netCredit * 100 / dte).toFixed(2),
    compositeScore: 0,
    minOpenInterest: Math.min(putLeg.openInterest, callLeg.openInterest),
    totalVolume: putLeg.volume + callLeg.volume,
    spreadWidth: +(callLeg.strikePrice - putLeg.strikePrice).toFixed(2),
  };
  trade.compositeScore = computeScore(trade);
  return trade;
}

function buildIronCondor(
  putSellOpt: PolygonOption, putBuyOpt: PolygonOption,
  callSellOpt: PolygonOption, callBuyOpt: PolygonOption,
  putZScore: number, callZScore: number,
  minOI: number, minPOP: number
): StrategyTrade | null {
  const putSell = makeLegFromPolygon(putSellOpt, "sell");
  const putBuy = makeLegFromPolygon(putBuyOpt, "buy");
  const callSell = makeLegFromPolygon(callSellOpt, "sell");
  const callBuy = makeLegFromPolygon(callBuyOpt, "buy");
  if (!putSell || !putBuy || !callSell || !callBuy) return null;
  const minOILeg = Math.min(putSell.openInterest, putBuy.openInterest, callSell.openInterest, callBuy.openInterest);
  if (minOILeg < minOI / 2) return null;
  const combinedPOP = (1 - Math.abs(putSell.delta)) * (1 - Math.abs(callSell.delta));
  if (combinedPOP < minPOP) return null;
  const dte = getDTE(putSell.expirationDate);
  const putCredit = +(putSell.midpoint - putBuy.midpoint).toFixed(2);
  const callCredit = +(callSell.midpoint - callBuy.midpoint).toFixed(2);
  const netCredit = +(putCredit + callCredit).toFixed(2);
  if (netCredit <= 0.05) return null;
  const putWidth = putSell.strikePrice - putBuy.strikePrice;
  const callWidth = callBuy.strikePrice - callSell.strikePrice;
  const maxWidth = Math.max(putWidth, callWidth);
  const maxLoss = (maxWidth - netCredit) * 100;
  const annROC = maxLoss > 0 ? (netCredit * 100 / maxLoss) * (365 / dte) * 100 : 0;

  const trade: StrategyTrade = {
    id: `ic-${++idCounter}`,
    strategyType: "iron_condor",
    underlyingTicker: putSellOpt.underlying_asset?.ticker || "",
    underlyingPrice: putSellOpt.underlying_asset?.price || 0,
    legs: [putBuy, putSell, callSell, callBuy],
    expirationDate: putSell.expirationDate,
    daysToExpiration: dte,
    netCredit,
    maxProfit: netCredit * 100,
    maxLoss: -maxLoss,
    breakEvenLow: +(putSell.strikePrice - netCredit).toFixed(2),
    breakEvenHigh: +(callSell.strikePrice + netCredit).toFixed(2),
    riskRewardRatio: maxLoss > 0 ? +((netCredit * 100) / maxLoss).toFixed(3) : 0,
    probabilityOfProfit: +combinedPOP.toFixed(3),
    netDelta: +(putSell.delta + putBuy.delta + callSell.delta + callBuy.delta).toFixed(4),
    netTheta: +(putSell.theta + putBuy.theta + callSell.theta + callBuy.theta).toFixed(4),
    netVega: +(-(putSell.vega + callSell.vega) + putBuy.vega + callBuy.vega).toFixed(4),
    avgIV: +((putSell.impliedVolatility + callSell.impliedVolatility) / 2).toFixed(3),
    deltaZScore: +((Math.abs(putZScore) + Math.abs(callZScore)) / 2).toFixed(2),
    annualizedROC: +annROC.toFixed(1),
    premiumPerDay: +(netCredit * 100 / dte).toFixed(2),
    compositeScore: 0,
    minOpenInterest: minOILeg,
    totalVolume: putSell.volume + putBuy.volume + callSell.volume + callBuy.volume,
    spreadWidth: maxWidth,
  };
  trade.compositeScore = computeScore(trade);
  return trade;
}

// ── Main ticker scanner ──
async function scanTicker(
  ticker: string, minDTE: number, maxDTE: number, minOI: number, minPOP: number
): Promise<StrategyTrade[]> {
  const results: StrategyTrade[] = [];

  try {
    // Fetch both chains in parallel (puts + calls simultaneously)
    const [puts, calls] = await Promise.all([
      fetchChain(ticker, "put", minDTE, maxDTE),
      fetchChain(ticker, "call", minDTE, maxDTE),
    ]);

    if (puts.length === 0 && calls.length === 0) return results;

    // ── Capture ATM IV for IV Rank tracking ──
    try {
      const underlyingPrice = puts[0]?.underlying_asset?.price || calls[0]?.underlying_asset?.price || 0;
      if (underlyingPrice > 0) {
        // Find put closest to ATM
        const atmPut = puts
          .filter(p => p.implied_volatility && p.implied_volatility > 0 && p.details?.strike_price)
          .sort((a, b) => Math.abs(a.details!.strike_price! - underlyingPrice) - Math.abs(b.details!.strike_price! - underlyingPrice))[0];
        const atmCall = calls
          .filter(c => c.implied_volatility && c.implied_volatility > 0 && c.details?.strike_price)
          .sort((a, b) => Math.abs(a.details!.strike_price! - underlyingPrice) - Math.abs(b.details!.strike_price! - underlyingPrice))[0];
        // Average put+call ATM IV (most accurate ATM IV measure)
        const putIV = atmPut?.implied_volatility || 0;
        const callIV = atmCall?.implied_volatility || 0;
        const atmIV = putIV > 0 && callIV > 0 ? (putIV + callIV) / 2 : putIV || callIV;
        if (atmIV > 0) storeAtmIV(ticker, atmIV);
      }
    } catch (e) { /* non-critical */ }

    const putZScores = computeZScores(puts);
    const callZScores = computeZScores(calls);

    // Group by expiration
    const putsByExp = new Map<string, PolygonOption[]>();
    const callsByExp = new Map<string, PolygonOption[]>();

    for (const p of puts) {
      const exp = p.details?.expiration_date;
      if (!exp || !p.greeks?.delta) continue;
      // Need any usable price source
      const hasPrice = (p.last_quote?.bid && p.last_quote.bid > 0)
        || (p.last_trade?.price && p.last_trade.price > 0)
        || (p.day?.close && p.day.close > 0)
        || (p.fmv && p.fmv > 0);
      if (!hasPrice) continue;
      if (!putsByExp.has(exp)) putsByExp.set(exp, []);
      putsByExp.get(exp)!.push(p);
    }
    for (const c of calls) {
      const exp = c.details?.expiration_date;
      if (!exp || !c.greeks?.delta) continue;
      const hasPrice = (c.last_quote?.bid && c.last_quote.bid > 0)
        || (c.last_trade?.price && c.last_trade.price > 0)
        || (c.day?.close && c.day.close > 0)
        || (c.fmv && c.fmv > 0);
      if (!hasPrice) continue;
      if (!callsByExp.has(exp)) callsByExp.set(exp, []);
      callsByExp.get(exp)!.push(c);
    }

    // ── 1. Cash Secured Puts ──
    for (const p of puts) {
      if (!p.greeks?.delta || !p.details?.ticker) continue;
      const absDelta = Math.abs(p.greeks.delta);
      if (absDelta < 0.08 || absDelta > 0.30) continue;
      const z = putZScores.get(p.details.ticker) || 0;
      const trade = buildCSP(p, z, minOI, minPOP);
      if (trade) results.push(trade);
    }

    // ── 2. Put Credit Spreads ──
    for (const [, expPuts] of putsByExp) {
      const sorted = expPuts
        .filter(p => { const d = Math.abs(p.greeks!.delta!); return d >= 0.08 && d <= 0.30; })
        .sort((a, b) => b.details!.strike_price! - a.details!.strike_price!);

      for (let i = 0; i < sorted.length; i++) {
        const sellOpt = sorted[i];
        const sellStrike = sellOpt.details!.strike_price!;
        const price = sellOpt.underlying_asset?.price || 0;
        const minWidth = Math.max(5, Math.round(price * 0.01));
        const maxWidth = Math.max(25, Math.round(price * 0.05));

        for (let j = i + 1; j < sorted.length; j++) {
          const buyOpt = sorted[j];
          const width = sellStrike - buyOpt.details!.strike_price!;
          if (width < minWidth) continue;
          if (width > maxWidth) break;
          const z = putZScores.get(sellOpt.details!.ticker!) || 0;
          const trade = buildPutCreditSpread(sellOpt, buyOpt, z, minOI, minPOP);
          if (trade) { results.push(trade); break; }
        }
      }
    }

    // ── 3. Strangles ──
    for (const [exp, expPuts] of putsByExp) {
      const expCalls = callsByExp.get(exp);
      if (!expCalls?.length) continue;
      const otmPuts = expPuts
        .filter(p => { const d = Math.abs(p.greeks!.delta!); return d >= 0.08 && d <= 0.22; })
        .sort((a, b) => Math.abs(a.greeks!.delta!) - Math.abs(b.greeks!.delta!));
      const otmCalls = expCalls
        .filter(c => { const d = Math.abs(c.greeks!.delta!); return d >= 0.08 && d <= 0.22; })
        .sort((a, b) => Math.abs(a.greeks!.delta!) - Math.abs(b.greeks!.delta!));

      if (otmPuts.length > 0 && otmCalls.length > 0) {
        const bestPut = otmPuts[Math.min(1, otmPuts.length - 1)];
        const bestCall = otmCalls[Math.min(1, otmCalls.length - 1)];
        const pz = putZScores.get(bestPut.details!.ticker!) || 0;
        const cz = callZScores.get(bestCall.details!.ticker!) || 0;
        const trade = buildStrangle(bestPut, bestCall, pz, cz, minOI, minPOP);
        if (trade) results.push(trade);
      }
    }

    // ── 4. Iron Condors ──
    for (const [exp, expPuts] of putsByExp) {
      const expCalls = callsByExp.get(exp);
      if (!expCalls?.length) continue;

      const otmPuts = expPuts
        .filter(p => { const d = Math.abs(p.greeks!.delta!); return d >= 0.10 && d <= 0.20; })
        .sort((a, b) => b.details!.strike_price! - a.details!.strike_price!);
      const otmCalls = expCalls
        .filter(c => { const d = Math.abs(c.greeks!.delta!); return d >= 0.10 && d <= 0.20; })
        .sort((a, b) => a.details!.strike_price! - b.details!.strike_price!);

      if (otmPuts.length === 0 || otmCalls.length === 0) continue;

      const putSellOpt = otmPuts[0];
      const callSellOpt = otmCalls[0];
      const price = putSellOpt.underlying_asset?.price || 0;
      const wingWidth = Math.max(5, Math.round(price * 0.02));

      const putBuyOpt = expPuts
        .filter(p => {
          const diff = putSellOpt.details!.strike_price! - p.details!.strike_price!;
          return diff >= wingWidth * 0.5 && diff <= wingWidth * 2;
        })
        .sort((a, b) => b.details!.strike_price! - a.details!.strike_price!)[0];

      const callBuyOpt = expCalls
        .filter(c => {
          const diff = c.details!.strike_price! - callSellOpt.details!.strike_price!;
          return diff >= wingWidth * 0.5 && diff <= wingWidth * 2;
        })
        .sort((a, b) => a.details!.strike_price! - b.details!.strike_price!)[0];

      if (!putBuyOpt || !callBuyOpt) continue;

      const pz = putZScores.get(putSellOpt.details!.ticker!) || 0;
      const cz = callZScores.get(callSellOpt.details!.ticker!) || 0;
      const trade = buildIronCondor(putSellOpt, putBuyOpt, callSellOpt, callBuyOpt, pz, cz, minOI / 2, minPOP);
      if (trade) results.push(trade);
    }

  } catch (err) {
    console.error(`Error scanning ${ticker}:`, err);
  }

  return results;
}

// ── Concurrency control ──
const CONCURRENCY = 5; // Number of tickers scanned in parallel

async function runWithConcurrency<T>(
  items: T[],
  fn: (item: T, index: number) => Promise<void>,
  concurrency: number
): Promise<void> {
  let idx = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

// ── Full scan entry point ──
export async function runFullScan(
  mode: "scheduled" | "manual" | "startup" = "manual",
  minDTE: number = 14,
  maxDTE: number = 60,
  minOI: number = 100,
  minPOP: number = 0.65,
): Promise<void> {
  idCounter = 0;
  const startTime = Date.now();
  const allResults: StrategyTrade[] = [];
  const tickers = getUniverseTickers();
  const scanId = storage.beginScan(mode, tickers.length);
  let scannedCount = 0;

  storage.setScanStatus({
    status: "scanning",
    progress: 0,
    totalTickers: tickers.length,
    scannedTickers: 0,
    error: null,
    lastUpdated: null,
  });

  let scanError: string | undefined;

  try {
    await runWithConcurrency(tickers, async (ticker) => {
      try {
        const trades = await scanTicker(ticker, minDTE, maxDTE, minOI, minPOP);
        // Synchronized push (safe because JS is single-threaded between awaits)
        allResults.push(...trades);
        console.log(`${ticker}: ${trades.length} trades found`);
      } catch (err) {
        console.error(`Scan failed for ${ticker}:`, err);
      }

      scannedCount++;
      storage.setScanStatus({
        scannedTickers: scannedCount,
        progress: Math.round((scannedCount / tickers.length) * 100),
      });
    }, CONCURRENCY);

    allResults.sort((a, b) => b.compositeScore - a.compositeScore);
    await storage.saveResults(allResults, scanId);
  } catch (err: any) {
    scanError = err?.message || "Unknown scan error";
    console.error("Scan error:", err);
  }

  const durationMs = Date.now() - startTime;
  storage.completeScan(scanId, allResults, durationMs, scanError);

  storage.setScanStatus({
    status: scanError ? "error" : "complete",
    progress: 100,
    lastUpdated: new Date().toISOString(),
    error: scanError || null,
  });

  const byType = {
    csp: allResults.filter(t => t.strategyType === "cash_secured_put").length,
    pcs: allResults.filter(t => t.strategyType === "put_credit_spread").length,
    str: allResults.filter(t => t.strategyType === "strangle").length,
    ic: allResults.filter(t => t.strategyType === "iron_condor").length,
  };
  console.log(`Scan #${scanId} complete in ${(durationMs / 1000).toFixed(1)}s: ${allResults.length} trades (CSP: ${byType.csp}, PCS: ${byType.pcs}, Strangle: ${byType.str}, IC: ${byType.ic})`);

  // Check alert triggers
  try {
    const triggered = storage.checkAlerts(scanId);
    if (triggered.length > 0) {
      console.log(`⚠️ ${triggered.length} alert(s) triggered: ${triggered.map(a => `${a.ticker} ${a.strategyType} score=${a.compositeScore}`).join(", ")}`);
    }
  } catch (err) {
    console.error("Alert check failed:", err);
  }
}

export { SP500_TICKERS };
