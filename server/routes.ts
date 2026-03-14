import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import db from "./db";
import { FAVICON_32_B64, FAVICON_180_B64, FAVICON_192_B64, FAVICON_512_B64 } from "./asset-favicons";
import { OG_IMAGE_B64 } from "./asset-og";
import { runFullScan, getSP500Tickers } from "./scanner";
import { runBacktest, getCachedBacktest, cacheBacktest, buildCacheKey } from "./backtester";
import { refreshEarningsData, enrichTradesWithEarnings, getAllUpcomingEarnings, getNextEarnings } from "./earnings";
import { getIVRank, getIVRankBatch, enrichTradesWithIVRank, backfillTickers, getTickersWithIVData } from "./iv-rank";
import { requireAuth, requireSubscription, checkSubscription } from "./auth";
import type { StrategyTrade, OptionLeg, StrategyType, InsertWatchlistItem } from "@shared/schema";
import { insertWatchlistSchema, backtestRequestSchema, insertJournalEntrySchema, closeJournalEntrySchema } from "@shared/schema";

// ── Free tier limits ──
const FREE_RESULTS_LIMIT = 5; // Free users see top 5 trades only
const FREE_DELAY_HOURS = 1;   // Free users see data delayed by 1 hour

// Redact detailed fields for free tier users
function redactTradeForFree(trade: StrategyTrade): StrategyTrade & { redacted: boolean } {
  return {
    ...trade,
    // Keep: ticker, strategy type, composite score, DTE, probability, annualizedROC
    // Redact: legs details, strikes, exact Greeks, exact premium amounts, expiration
    expirationDate: "Premium",
    legs: trade.legs.map(leg => ({
      ...leg,
      strike: 0,
      bid: 0,
      ask: 0,
      midpoint: 0,
      iv: 0,
      delta: 0,
      gamma: 0,
      theta: 0,
      vega: 0,
    })),
    netCredit: -1,
    maxProfit: -1,
    maxLoss: -1,
    premiumPerDay: -1,
    netDelta: 0,
    netTheta: 0,
    netVega: 0,
    breakEvenLow: null,
    breakEvenHigh: null,
    spreadWidth: null,
    redacted: true,
  };
}

function isDelayedDataFresh(lastUpdated: string | null): boolean {
  if (!lastUpdated) return false;
  const scanTime = new Date(lastUpdated).getTime();
  const delayThreshold = Date.now() - FREE_DELAY_HOURS * 60 * 60 * 1000;
  return scanTime <= delayThreshold;
}

// Live scanning uses the external-tool CLI for Polygon/Massive API access.
// Set LIVE_SCAN=1 to enable on startup. The Rescan button always tries live first.
const LIVE_SCAN = process.env.LIVE_SCAN === "1";

function getExpDate(daysOut: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOut);
  return d.toISOString().split("T")[0];
}

function makeLeg(opts: {
  ticker: string; type: "put" | "call"; strike: number; exp: string;
  action: "sell" | "buy"; bid: number; ask: number; delta: number;
  iv: number; oi: number; vol: number;
}): OptionLeg {
  const mid = +((opts.bid + opts.ask) / 2).toFixed(2);
  return {
    ticker: `O:${opts.ticker}${opts.exp.replace(/-/g, "")}${opts.type === "call" ? "C" : "P"}${String(Math.round(opts.strike * 1000)).padStart(8, "0")}`,
    contractType: opts.type,
    strikePrice: opts.strike,
    expirationDate: opts.exp,
    action: opts.action,
    bid: opts.bid,
    ask: opts.ask,
    midpoint: mid,
    delta: opts.delta,
    gamma: +(Math.random() * 0.015 + 0.003).toFixed(4),
    theta: opts.action === "sell" ? +(Math.random() * 0.08 + 0.02).toFixed(4) : -(+(Math.random() * 0.06 + 0.01).toFixed(4)),
    vega: +(Math.random() * 0.25 + 0.05).toFixed(4),
    impliedVolatility: opts.iv,
    openInterest: opts.oi,
    volume: opts.vol,
  };
}

function computeScore(trade: Partial<StrategyTrade>): number {
  const deltaScore = Math.min(Math.abs(trade.deltaZScore || 0) / 3, 1) * 35;
  const rocScore = Math.min((trade.annualizedROC || 0) / 120, 1) * 25;
  const probScore = (trade.probabilityOfProfit || 0) * 25;
  const liqScore = Math.min((trade.totalVolume || 0) / ((trade.minOpenInterest || 1) * 3), 1) * 15;
  return +(deltaScore + rocScore + probScore + liqScore).toFixed(2);
}

function generateDemoData(): StrategyTrade[] {
  const trades: StrategyTrade[] = [];
  let idCounter = 1;

  // ── Cash Secured Puts ──
  const cspData = [
    { sym: "NVDA", price: 875.30, strike: 850, dte: 12, iv: 0.52, delta: -0.22, bid: 13.80, ask: 14.40, oi: 15420, vol: 8200, zScore: 2.1 },
    { sym: "AAPL", price: 178.50, strike: 175, dte: 19, iv: 0.24, delta: -0.18, bid: 2.20, ask: 2.50, oi: 22150, vol: 11500, zScore: 1.8 },
    { sym: "TSLA", price: 192.40, strike: 185, dte: 12, iv: 0.61, delta: -0.25, bid: 5.60, ask: 6.00, oi: 18300, vol: 9800, zScore: 2.4 },
    { sym: "AMZN", price: 186.70, strike: 180, dte: 19, iv: 0.32, delta: -0.20, bid: 2.90, ask: 3.30, oi: 12400, vol: 6100, zScore: 1.5 },
    { sym: "META", price: 505.20, strike: 490, dte: 12, iv: 0.38, delta: -0.23, bid: 9.10, ask: 9.80, oi: 9800, vol: 5200, zScore: 1.9 },
    { sym: "JPM", price: 198.50, strike: 195, dte: 26, iv: 0.20, delta: -0.15, bid: 1.70, ask: 2.00, oi: 8900, vol: 4200, zScore: 1.3 },
    { sym: "LLY", price: 785.60, strike: 770, dte: 19, iv: 0.28, delta: -0.17, bid: 10.80, ask: 11.60, oi: 6100, vol: 2900, zScore: 1.6 },
  ];

  for (const d of cspData) {
    const exp = getExpDate(d.dte);
    const leg = makeLeg({ ticker: d.sym, type: "put", strike: d.strike, exp, action: "sell", bid: d.bid, ask: d.ask, delta: d.delta, iv: d.iv, oi: d.oi, vol: d.vol });
    const netCredit = leg.midpoint;
    const maxLoss = (d.strike - netCredit) * 100;
    const annROC = maxLoss > 0 ? ((netCredit * 100) / maxLoss) * (365 / d.dte) * 100 : 0;
    const trade: StrategyTrade = {
      id: `csp-${idCounter++}`,
      strategyType: "cash_secured_put",
      underlyingTicker: d.sym,
      underlyingPrice: d.price,
      legs: [leg],
      expirationDate: exp,
      daysToExpiration: d.dte,
      netCredit,
      maxProfit: netCredit * 100,
      maxLoss: -maxLoss,
      breakEvenLow: +(d.strike - netCredit).toFixed(2),
      breakEvenHigh: null,
      riskRewardRatio: maxLoss > 0 ? +((netCredit * 100) / maxLoss).toFixed(3) : 0,
      probabilityOfProfit: +(1 - Math.abs(d.delta)).toFixed(3),
      netDelta: d.delta,
      netTheta: leg.theta,
      netVega: -leg.vega,
      avgIV: d.iv,
      deltaZScore: d.zScore,
      annualizedROC: +annROC.toFixed(1),
      premiumPerDay: +(netCredit * 100 / d.dte).toFixed(2),
      compositeScore: 0,
      minOpenInterest: d.oi,
      totalVolume: d.vol,
      spreadWidth: null,
    };
    trade.compositeScore = computeScore(trade);
    trades.push(trade);
  }

  // ── Put Credit Spreads ──
  const pcsData = [
    { sym: "NVDA", price: 875.30, sellStrike: 830, buyStrike: 805, dte: 45, iv: 0.50, sellDelta: -0.16, buyDelta: -0.09, sellBid: 11.20, sellAsk: 11.90, buyBid: 9.85, buyAsk: 10.55, oi: 14200, vol: 7500, zScore: 2.3 },
    { sym: "TSLA", price: 192.40, sellStrike: 177, buyStrike: 167, dte: 45, iv: 0.58, sellDelta: -0.18, buyDelta: -0.10, sellBid: 4.30, sellAsk: 4.70, buyBid: 3.70, buyAsk: 4.10, oi: 16500, vol: 8900, zScore: 2.5 },
    { sym: "AMD", price: 164.80, sellStrike: 152, buyStrike: 142, dte: 45, iv: 0.46, sellDelta: -0.17, buyDelta: -0.09, sellBid: 3.10, sellAsk: 3.50, buyBid: 2.60, buyAsk: 3.00, oi: 19200, vol: 10400, zScore: 2.0 },
    { sym: "META", price: 505.20, sellStrike: 475, buyStrike: 455, dte: 45, iv: 0.36, sellDelta: -0.15, buyDelta: -0.08, sellBid: 7.80, sellAsk: 8.40, buyBid: 6.70, buyAsk: 7.30, oi: 8700, vol: 4600, zScore: 1.7 },
    { sym: "GOOGL", price: 152.30, sellStrike: 143, buyStrike: 133, dte: 45, iv: 0.27, sellDelta: -0.16, buyDelta: -0.08, sellBid: 1.45, sellAsk: 1.75, buyBid: 1.00, buyAsk: 1.30, oi: 11500, vol: 5800, zScore: 1.9 },
    { sym: "MSFT", price: 415.60, sellStrike: 395, buyStrike: 380, dte: 45, iv: 0.23, sellDelta: -0.14, buyDelta: -0.07, sellBid: 3.80, sellAsk: 4.20, buyBid: 3.15, buyAsk: 3.55, oi: 13800, vol: 7000, zScore: 1.4 },
  ];

  for (const d of pcsData) {
    const exp = getExpDate(d.dte);
    const sellLeg = makeLeg({ ticker: d.sym, type: "put", strike: d.sellStrike, exp, action: "sell", bid: d.sellBid, ask: d.sellAsk, delta: d.sellDelta, iv: d.iv, oi: d.oi, vol: d.vol });
    const buyLeg = makeLeg({ ticker: d.sym, type: "put", strike: d.buyStrike, exp, action: "buy", bid: d.buyBid, ask: d.buyAsk, delta: d.buyDelta, iv: d.iv * 0.95, oi: Math.round(d.oi * 0.7), vol: Math.round(d.vol * 0.6) });
    const width = d.sellStrike - d.buyStrike;
    const netCredit = +(sellLeg.midpoint - buyLeg.midpoint).toFixed(2);
    const maxLoss = (width - netCredit) * 100;
    const annROC = maxLoss > 0 ? ((netCredit * 100) / maxLoss) * (365 / d.dte) * 100 : 0;
    const trade: StrategyTrade = {
      id: `pcs-${idCounter++}`,
      strategyType: "put_credit_spread",
      underlyingTicker: d.sym,
      underlyingPrice: d.price,
      legs: [sellLeg, buyLeg],
      expirationDate: exp,
      daysToExpiration: d.dte,
      netCredit,
      maxProfit: netCredit * 100,
      maxLoss: -maxLoss,
      breakEvenLow: +(d.sellStrike - netCredit).toFixed(2),
      breakEvenHigh: null,
      riskRewardRatio: maxLoss > 0 ? +((netCredit * 100) / maxLoss).toFixed(3) : 0,
      probabilityOfProfit: +(1 - Math.abs(d.sellDelta)).toFixed(3),
      netDelta: +(d.sellDelta - d.buyDelta).toFixed(4),
      netTheta: +(sellLeg.theta + buyLeg.theta).toFixed(4),
      netVega: +(-(sellLeg.vega) + buyLeg.vega).toFixed(4),
      avgIV: d.iv,
      deltaZScore: d.zScore,
      annualizedROC: +annROC.toFixed(1),
      premiumPerDay: +(netCredit * 100 / d.dte).toFixed(2),
      compositeScore: 0,
      minOpenInterest: Math.min(d.oi, Math.round(d.oi * 0.7)),
      totalVolume: d.vol + Math.round(d.vol * 0.6),
      spreadWidth: width,
    };
    trade.compositeScore = computeScore(trade);
    trades.push(trade);
  }

  // ── Strangles ──
  const strangleData = [
    { sym: "TSLA", price: 192.40, putStrike: 170, callStrike: 215, dte: 45, iv: 0.58, putDelta: -0.15, callDelta: 0.16, putBid: 2.60, putAsk: 3.00, callBid: 2.30, callAsk: 2.70, oi: 14200, vol: 7600, zScore: 2.2 },
    { sym: "NVDA", price: 875.30, putStrike: 810, callStrike: 940, dte: 45, iv: 0.48, putDelta: -0.14, callDelta: 0.15, putBid: 11.40, putAsk: 12.00, callBid: 10.20, callAsk: 10.80, oi: 11300, vol: 6200, zScore: 2.0 },
    { sym: "AMD", price: 164.80, putStrike: 148, callStrike: 182, dte: 45, iv: 0.44, putDelta: -0.15, callDelta: 0.16, putBid: 1.70, putAsk: 2.10, callBid: 1.50, callAsk: 1.90, oi: 17800, vol: 9100, zScore: 1.8 },
    { sym: "NFLX", price: 628.40, putStrike: 580, callStrike: 680, dte: 45, iv: 0.35, putDelta: -0.14, callDelta: 0.15, putBid: 6.40, putAsk: 6.90, callBid: 5.80, callAsk: 6.30, oi: 7600, vol: 3800, zScore: 1.6 },
    { sym: "META", price: 505.20, putStrike: 465, callStrike: 545, dte: 45, iv: 0.37, putDelta: -0.13, callDelta: 0.15, putBid: 5.10, putAsk: 5.60, callBid: 4.60, callAsk: 5.10, oi: 9200, vol: 4800, zScore: 2.1 },
  ];

  for (const d of strangleData) {
    const exp = getExpDate(d.dte);
    const putLeg = makeLeg({ ticker: d.sym, type: "put", strike: d.putStrike, exp, action: "sell", bid: d.putBid, ask: d.putAsk, delta: d.putDelta, iv: d.iv, oi: d.oi, vol: d.vol });
    const callLeg = makeLeg({ ticker: d.sym, type: "call", strike: d.callStrike, exp, action: "sell", bid: d.callBid, ask: d.callAsk, delta: d.callDelta, iv: d.iv * 0.97, oi: Math.round(d.oi * 0.85), vol: Math.round(d.vol * 0.8) });
    const netCredit = +(putLeg.midpoint + callLeg.midpoint).toFixed(2);
    const marginReq = d.price * 20;
    const annROC = marginReq > 0 ? ((netCredit * 100) / marginReq) * (365 / d.dte) * 100 : 0;
    const trade: StrategyTrade = {
      id: `str-${idCounter++}`,
      strategyType: "strangle",
      underlyingTicker: d.sym,
      underlyingPrice: d.price,
      legs: [putLeg, callLeg],
      expirationDate: exp,
      daysToExpiration: d.dte,
      netCredit,
      maxProfit: netCredit * 100,
      maxLoss: -999999,
      breakEvenLow: +(d.putStrike - netCredit).toFixed(2),
      breakEvenHigh: +(d.callStrike + netCredit).toFixed(2),
      riskRewardRatio: 0,
      probabilityOfProfit: +((1 - Math.abs(d.putDelta)) * (1 - Math.abs(d.callDelta))).toFixed(3),
      netDelta: +(d.putDelta + d.callDelta).toFixed(4),
      netTheta: +(putLeg.theta + callLeg.theta).toFixed(4),
      netVega: +(-(putLeg.vega + callLeg.vega)).toFixed(4),
      avgIV: +((d.iv + d.iv * 0.97) / 2).toFixed(3),
      deltaZScore: d.zScore,
      annualizedROC: +annROC.toFixed(1),
      premiumPerDay: +(netCredit * 100 / d.dte).toFixed(2),
      compositeScore: 0,
      minOpenInterest: Math.min(d.oi, Math.round(d.oi * 0.85)),
      totalVolume: d.vol + Math.round(d.vol * 0.8),
      spreadWidth: +(d.callStrike - d.putStrike).toFixed(2),
    };
    trade.compositeScore = computeScore(trade);
    trades.push(trade);
  }

  // ── Iron Condors ──
  const icData = [
    { sym: "AAPL", price: 178.50, putBuyStrike: 160, putSellStrike: 170, callSellStrike: 190, callBuyStrike: 200, dte: 45, iv: 0.23,
      putSellDelta: -0.14, putBuyDelta: -0.07, callSellDelta: 0.16, callBuyDelta: 0.08,
      putSellBid: 1.40, putSellAsk: 1.70, putBuyBid: 1.05, putBuyAsk: 1.35,
      callSellBid: 1.20, callSellAsk: 1.50, callBuyBid: 0.90, callBuyAsk: 1.15,
      oi: 20100, vol: 10500, zScore: 1.9 },
    { sym: "MSFT", price: 415.60, putBuyStrike: 385, putSellStrike: 395, callSellStrike: 435, callBuyStrike: 445, dte: 45, iv: 0.22,
      putSellDelta: -0.13, putBuyDelta: -0.06, callSellDelta: 0.15, callBuyDelta: 0.07,
      putSellBid: 3.40, putSellAsk: 3.80, putBuyBid: 3.00, putBuyAsk: 3.40,
      callSellBid: 3.00, callSellAsk: 3.40, callBuyBid: 2.60, callBuyAsk: 3.00,
      oi: 13500, vol: 6800, zScore: 1.6 },
    { sym: "AMZN", price: 186.70, putBuyStrike: 165, putSellStrike: 175, callSellStrike: 200, callBuyStrike: 210, dte: 45, iv: 0.30,
      putSellDelta: -0.14, putBuyDelta: -0.07, callSellDelta: 0.16, callBuyDelta: 0.08,
      putSellBid: 1.80, putSellAsk: 2.10, putBuyBid: 1.40, putBuyAsk: 1.70,
      callSellBid: 1.50, callSellAsk: 1.80, callBuyBid: 1.15, callBuyAsk: 1.40,
      oi: 11800, vol: 5900, zScore: 1.7 },
    { sym: "GOOGL", price: 152.30, putBuyStrike: 137, putSellStrike: 145, callSellStrike: 160, callBuyStrike: 168, dte: 40, iv: 0.26,
      putSellDelta: -0.13, putBuyDelta: -0.06, callSellDelta: 0.15, callBuyDelta: 0.07,
      putSellBid: 1.10, putSellAsk: 1.35, putBuyBid: 0.80, putBuyAsk: 1.05,
      callSellBid: 0.95, callSellAsk: 1.15, callBuyBid: 0.70, callBuyAsk: 0.90,
      oi: 10400, vol: 5300, zScore: 2.0 },
    { sym: "SPY", price: 512.80, putBuyStrike: 490, putSellStrike: 500, callSellStrike: 525, callBuyStrike: 535, dte: 40, iv: 0.15,
      putSellDelta: -0.12, putBuyDelta: -0.06, callSellDelta: 0.14, callBuyDelta: 0.07,
      putSellBid: 2.50, putSellAsk: 2.80, putBuyBid: 2.10, putBuyAsk: 2.40,
      callSellBid: 2.15, callSellAsk: 2.45, callBuyBid: 1.80, callBuyAsk: 2.10,
      oi: 45000, vol: 28000, zScore: 1.5 },
  ];

  for (const d of icData) {
    const exp = getExpDate(d.dte);
    const putSell = makeLeg({ ticker: d.sym, type: "put", strike: d.putSellStrike, exp, action: "sell", bid: d.putSellBid, ask: d.putSellAsk, delta: d.putSellDelta, iv: d.iv, oi: d.oi, vol: d.vol });
    const putBuy = makeLeg({ ticker: d.sym, type: "put", strike: d.putBuyStrike, exp, action: "buy", bid: d.putBuyBid, ask: d.putBuyAsk, delta: d.putBuyDelta, iv: d.iv * 0.95, oi: Math.round(d.oi * 0.6), vol: Math.round(d.vol * 0.5) });
    const callSell = makeLeg({ ticker: d.sym, type: "call", strike: d.callSellStrike, exp, action: "sell", bid: d.callSellBid, ask: d.callSellAsk, delta: d.callSellDelta, iv: d.iv * 0.98, oi: Math.round(d.oi * 0.8), vol: Math.round(d.vol * 0.7) });
    const callBuy = makeLeg({ ticker: d.sym, type: "call", strike: d.callBuyStrike, exp, action: "buy", bid: d.callBuyBid, ask: d.callBuyAsk, delta: d.callBuyDelta, iv: d.iv * 0.93, oi: Math.round(d.oi * 0.5), vol: Math.round(d.vol * 0.4) });

    const putCredit = +(putSell.midpoint - putBuy.midpoint).toFixed(2);
    const callCredit = +(callSell.midpoint - callBuy.midpoint).toFixed(2);
    const netCredit = +(putCredit + callCredit).toFixed(2);
    const putWidth = d.putSellStrike - d.putBuyStrike;
    const callWidth = d.callBuyStrike - d.callSellStrike;
    const maxWidth = Math.max(putWidth, callWidth);
    const maxLoss = (maxWidth - netCredit) * 100;
    const annROC = maxLoss > 0 ? ((netCredit * 100) / maxLoss) * (365 / d.dte) * 100 : 0;

    const probPutOTM = 1 - Math.abs(d.putSellDelta);
    const probCallOTM = 1 - Math.abs(d.callSellDelta);

    const trade: StrategyTrade = {
      id: `ic-${idCounter++}`,
      strategyType: "iron_condor",
      underlyingTicker: d.sym,
      underlyingPrice: d.price,
      legs: [putBuy, putSell, callSell, callBuy],
      expirationDate: exp,
      daysToExpiration: d.dte,
      netCredit,
      maxProfit: netCredit * 100,
      maxLoss: -maxLoss,
      breakEvenLow: +(d.putSellStrike - netCredit).toFixed(2),
      breakEvenHigh: +(d.callSellStrike + netCredit).toFixed(2),
      riskRewardRatio: maxLoss > 0 ? +((netCredit * 100) / maxLoss).toFixed(3) : 0,
      probabilityOfProfit: +(probPutOTM * probCallOTM).toFixed(3),
      netDelta: +(d.putSellDelta + d.putBuyDelta + d.callSellDelta + d.callBuyDelta).toFixed(4),
      netTheta: +(putSell.theta + putBuy.theta + callSell.theta + callBuy.theta).toFixed(4),
      netVega: +(-(putSell.vega + callSell.vega) + putBuy.vega + callBuy.vega).toFixed(4),
      avgIV: +((d.iv + d.iv * 0.98) / 2).toFixed(3),
      deltaZScore: d.zScore,
      annualizedROC: +annROC.toFixed(1),
      premiumPerDay: +(netCredit * 100 / d.dte).toFixed(2),
      compositeScore: 0,
      minOpenInterest: Math.min(d.oi, Math.round(d.oi * 0.5)),
      totalVolume: d.vol + Math.round(d.vol * 0.5) + Math.round(d.vol * 0.7) + Math.round(d.vol * 0.4),
      spreadWidth: maxWidth,
    };
    trade.compositeScore = computeScore(trade);
    trades.push(trade);
  }

  return trades;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ── Serve embedded PNG assets (bypass file system binary corruption) ──
  const assetRoutes: Record<string, string> = {
    "/favicon.png": FAVICON_32_B64,
    "/favicon-32.png": FAVICON_32_B64,
    "/favicon-180.png": FAVICON_180_B64,
    "/apple-touch-icon.png": FAVICON_180_B64,
    "/favicon-192.png": FAVICON_192_B64,
    "/favicon-512.png": FAVICON_512_B64,
    "/og-image.png": OG_IMAGE_B64,
  };

  for (const [route, b64] of Object.entries(assetRoutes)) {
    app.get(route, (_req, res) => {
      const buf = Buffer.from(b64, "base64");
      res.set("Content-Type", "image/png");
      res.set("Cache-Control", "public, max-age=86400");
      res.set("Content-Length", String(buf.length));
      res.send(buf);
    });
  }

  // Also serve /favicon.ico as the 32px PNG
  app.get("/favicon.ico", (_req, res) => {
    const buf = Buffer.from(FAVICON_32_B64, "base64");
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=86400");
    res.send(buf);
  });

  // Check if we already have recent data in the DB
  const latestScanId = storage.getLatestScanId();
  const hasData = latestScanId !== null;

  if (LIVE_SCAN && !hasData) {
    // Only run startup scan if DB is empty
    console.log("LIVE_SCAN=1 — no existing data, running initial live scan...");
    runFullScan("startup").catch(err => {
      console.error("Live scan failed, falling back to demo data:", err);
      const demoData = generateDemoData();
      storage.saveResults(demoData);
      const tc = getSP500Tickers().length;
      storage.setScanStatus({
        status: "complete",
        progress: 100,
        totalTickers: tc,
        scannedTickers: tc,
        lastUpdated: new Date().toISOString(),
      });
    });
  } else if (hasData) {
    console.log(`Loaded existing scan data (scan #${latestScanId})`);
    const tc = getSP500Tickers().length;
    storage.setScanStatus({
      status: "complete",
      progress: 100,
      totalTickers: tc,
      scannedTickers: tc,
    });
  } else {
    console.log("Loading demo data (set LIVE_SCAN=1 for live scanning)");
    const demoData = generateDemoData();
    await storage.saveResults(demoData);
    const tc = getSP500Tickers().length;
    storage.setScanStatus({
      status: "complete",
      progress: 100,
      totalTickers: tc,
      scannedTickers: tc,
      lastUpdated: new Date().toISOString(),
    });
  }

  // ── Refresh earnings on startup (non-blocking) ──
  try {
    refreshEarningsData();
  } catch (err) {
    console.error("Earnings refresh failed on startup:", err);
  }

  // ── IV Rank backfill (non-blocking, runs in background) ──
  if (LIVE_SCAN) {
    setTimeout(() => {
      try {
        const tickers = getSP500Tickers();
        const existingData = getTickersWithIVData();
        // Only backfill tickers that don't have data yet
        const needBackfill = tickers.filter(t => !existingData.includes(t));
        if (needBackfill.length > 0) {
          console.log(`IV Rank: backfilling ${needBackfill.length} tickers (${existingData.length} already have data)...`);
          // Backfill in small batches to avoid rate limits
          const batchSize = 20;
          let completed = 0;
          const processBatch = () => {
            const batch = needBackfill.slice(completed, completed + batchSize);
            if (batch.length === 0) {
              console.log(`IV Rank: backfill complete (${completed} tickers processed)`);
              return;
            }
            const result = backfillTickers(batch);
            completed += batch.length;
            console.log(`IV Rank: backfilled ${completed}/${needBackfill.length} (batch: ${result.success} ok, ${result.failed} failed, ${result.skipped} skipped)`);
            // Rate limit: wait 5s between batches
            setTimeout(processBatch, 5000);
          };
          processBatch();
        } else {
          console.log(`IV Rank: all ${existingData.length} tickers have historical data`);
        }
      } catch (err) {
        console.error("IV Rank backfill failed:", err);
      }
    }, 3000); // Start 3s after server boot
  }

  // GET /api/top-picks
  app.get("/api/top-picks", checkSubscription, async (req, res) => {
    try {
      const isPremium = (req as any).isPremium;
      const strategyType = (req.query.strategy as string) || "all";
      const topN = parseInt(req.query.topN as string) || 5;
      const excludeEarnings = req.query.excludeEarnings === "1";
      let picks = await storage.getTopPicks(strategyType as any, excludeEarnings ? topN * 3 : topN);
      picks = enrichTradesWithEarnings(picks);
      picks = enrichTradesWithIVRank(picks);
      if (excludeEarnings) {
        picks = picks.filter((t: any) => !t.hasEarningsBeforeExpiry);
        picks = picks.slice(0, topN);
      }

      if (!isPremium) {
        // Free: show top 3, redact details
        picks = picks.slice(0, 3).map(redactTradeForFree) as any;
      }

      res.json({ picks, isPremium });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch top picks" });
    }
  });

  // GET /api/all-results
  app.get("/api/all-results", checkSubscription, async (req, res) => {
    try {
      const isPremium = (req as any).isPremium;
      const scanId = req.query.scanId ? parseInt(req.query.scanId as string) : undefined;
      const excludeEarnings = req.query.excludeEarnings === "1";
      let results = await storage.getAllResults(scanId);
      results = enrichTradesWithEarnings(results);
      results = enrichTradesWithIVRank(results);
      const totalBeforeFilter = results.length;
      if (excludeEarnings) {
        results = results.filter((t: any) => !t.hasEarningsBeforeExpiry);
      }

      const totalAll = results.length;
      if (!isPremium) {
        // Free: limited results, redacted
        results = results.slice(0, FREE_RESULTS_LIMIT).map(redactTradeForFree) as any;
      }

      res.json({ results, total: results.length, totalBeforeFilter, totalAll, isPremium });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch results" });
    }
  });

  // GET /api/scan-status
  app.get("/api/scan-status", (_req, res) => {
    res.json(storage.getScanStatus());
  });

  // POST /api/scan — premium users OR cron jobs with API key
  app.post("/api/scan", (req, res, next) => {
    // Allow cron jobs / external triggers with the scan API key
    const cronKey = req.headers["x-scan-key"] || req.query.key;
    if (cronKey === (process.env.SCAN_API_KEY || "ps-scan-2026")) {
      return next();
    }
    // Otherwise require active subscription
    return requireSubscription(req, res, next);
  }, async (_req, res) => {
    const status = storage.getScanStatus();
    if (status.status === "scanning") {
      return res.status(409).json({ error: "Scan already in progress" });
    }

    res.json({ message: "Scan started", mode: "live" });
    runFullScan("manual").then(() => {
      // Refresh earnings data after scan completes
      try { refreshEarningsData(); } catch (e) { console.error("Post-scan earnings refresh failed:", e); }
    }).catch(err => {
      console.error("Live rescan failed, using demo fallback:", err);
      const demoData = generateDemoData();
      storage.saveResults(demoData);
      const tc2 = getSP500Tickers().length;
      storage.setScanStatus({
        status: "complete",
        progress: 100,
        totalTickers: tc2,
        scannedTickers: tc2,
        lastUpdated: new Date().toISOString(),
      });
    });
  });

  // GET /api/ticker-count — how many tickers are scanned
  app.get("/api/ticker-count", (_req, res) => {
    const tickers = getSP500Tickers();
    res.json({ count: tickers.length, source: tickers === getSP500Tickers() ? "cached" : "fresh" });
  });

  // GET /api/strategy-summary
  app.get("/api/strategy-summary", async (_req, res) => {
    try {
      const results = await storage.getAllResults();
      const summary: Record<string, { count: number; avgScore: number; avgROC: number; avgPOP: number }> = {};
      for (const strat of ["cash_secured_put", "put_credit_spread", "strangle", "iron_condor"] as const) {
        const filtered = results.filter(r => r.strategyType === strat);
        summary[strat] = {
          count: filtered.length,
          avgScore: filtered.length > 0 ? +(filtered.reduce((s, r) => s + r.compositeScore, 0) / filtered.length).toFixed(1) : 0,
          avgROC: filtered.length > 0 ? +(filtered.reduce((s, r) => s + r.annualizedROC, 0) / filtered.length).toFixed(1) : 0,
          avgPOP: filtered.length > 0 ? +(filtered.reduce((s, r) => s + r.probabilityOfProfit, 0) / filtered.length * 100).toFixed(1) : 0,
        };
      }
      res.json(summary);
    } catch (err) {
      res.status(500).json({ error: "Failed to compute summary" });
    }
  });

  // GET /api/scan-history — list past scans
  app.get("/api/scan-history", (_req, res) => {
    try {
      const limit = parseInt(_req.query.limit as string) || 30;
      const history = storage.getScanHistory(limit);
      res.json({ history });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch scan history" });
    }
  });

  // GET /api/scan/:id — get a specific scan's details
  app.get("/api/scan/:id", async (req, res) => {
    try {
      const scanId = parseInt(req.params.id);
      if (isNaN(scanId)) return res.status(400).json({ error: "Invalid scan ID" });

      const record = storage.getScanById(scanId);
      if (!record) return res.status(404).json({ error: "Scan not found" });

      const results = await storage.getAllResults(scanId);
      res.json({ scan: record, results, total: results.length });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch scan" });
    }
  });

  // ── Watchlist routes (premium only) ──
  app.get("/api/watchlist", requireSubscription, (_req, res) => {
    try {
      const items = storage.getWatchlist();
      res.json({ watchlist: items });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch watchlist" });
    }
  });

  app.post("/api/watchlist", requireSubscription, (req, res) => {
    try {
      const parsed = insertWatchlistSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      }
      const item = storage.addToWatchlist(parsed.data);
      res.status(201).json(item);
    } catch (err: any) {
      if (err?.message?.includes("UNIQUE")) {
        return res.status(409).json({ error: "Ticker already on watchlist" });
      }
      res.status(500).json({ error: "Failed to add to watchlist" });
    }
  });

  app.patch("/api/watchlist/:id", requireSubscription, (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const updated = storage.updateWatchlistItem(id, req.body);
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to update watchlist item" });
    }
  });

  app.delete("/api/watchlist/:id", requireSubscription, (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const removed = storage.removeFromWatchlist(id);
      if (!removed) return res.status(404).json({ error: "Not found" });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to remove from watchlist" });
    }
  });

  // ── Alert routes (premium only) ──
  app.get("/api/alerts", requireSubscription, (req, res) => {
    try {
      const unseenOnly = req.query.unseen === "1";
      const limit = parseInt(req.query.limit as string) || 50;
      const alerts = storage.getAlerts(limit, unseenOnly);
      const unseenCount = storage.getUnseenAlertCount();
      res.json({ alerts, unseenCount });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch alerts" });
    }
  });

  app.post("/api/alerts/mark-seen", requireSubscription, (req, res) => {
    try {
      const { alertIds } = req.body;
      if (!Array.isArray(alertIds)) {
        return res.status(400).json({ error: "alertIds must be an array" });
      }
      storage.markAlertsSeen(alertIds);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to mark alerts seen" });
    }
  });

  app.delete("/api/alerts/:id", requireSubscription, (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const removed = storage.deleteAlert(id);
      if (!removed) return res.status(404).json({ error: "Alert not found" });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete alert" });
    }
  });

  // ── Journal routes (premium only) ──
  app.get("/api/journal", requireSubscription, (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const ticker = req.query.ticker as string | undefined;
      const limit = parseInt(req.query.limit as string) || 100;
      const entries = storage.getJournalEntries(status as any, ticker, limit);
      res.json({ entries });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch journal entries" });
    }
  });

  app.post("/api/journal", requireSubscription, (req, res) => {
    try {
      const parsed = insertJournalEntrySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      }
      const entry = storage.addJournalEntry(parsed.data);
      res.status(201).json(entry);
    } catch (err) {
      res.status(500).json({ error: "Failed to add journal entry" });
    }
  });

  app.patch("/api/journal/:id", requireSubscription, (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const updated = storage.updateJournalEntry(id, req.body);
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to update journal entry" });
    }
  });

  app.post("/api/journal/:id/close", requireSubscription, (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const parsed = closeJournalEntrySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      }
      const closed = storage.closeJournalEntry(id, parsed.data);
      if (!closed) return res.status(404).json({ error: "Not found" });
      res.json(closed);
    } catch (err) {
      res.status(500).json({ error: "Failed to close journal entry" });
    }
  });

  app.delete("/api/journal/:id", requireSubscription, (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const removed = storage.deleteJournalEntry(id);
      if (!removed) return res.status(404).json({ error: "Not found" });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete journal entry" });
    }
  });

  // ── Backtest route ──
  app.post("/api/backtest", requireSubscription, async (req, res) => {
    try {
      const parsed = backtestRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      }

      const btReq = parsed.data;
      const cacheKey = buildCacheKey(btReq);

      // Check cache first
      const cached = getCachedBacktest(cacheKey);
      if (cached) {
        return res.json({ ...cached, fromCache: true });
      }

      // Run new backtest
      const result = await runBacktest(btReq);
      cacheBacktest(cacheKey, result);
      res.json(result);
    } catch (err: any) {
      console.error("Backtest error:", err);
      res.status(500).json({ error: err.message || "Backtest failed" });
    }
  });

  // GET /api/earnings — upcoming earnings for all tracked tickers
  app.get("/api/earnings", checkSubscription, (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const earnings = getAllUpcomingEarnings(days);
      res.json({ earnings });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch earnings" });
    }
  });

  // GET /api/earnings/:ticker — next earnings for specific ticker
  app.get("/api/earnings/:ticker", checkSubscription, (req, res) => {
    try {
      const ticker = req.params.ticker.toUpperCase();
      const next = getNextEarnings(ticker);
      res.json({ ticker, next });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch earnings" });
    }
  });

  // POST /api/earnings/refresh — manually refresh earnings data (premium)
  app.post("/api/earnings/refresh", requireSubscription, (req, res) => {
    try {
      refreshEarningsData();
      res.json({ message: "Earnings refresh triggered" });
    } catch (err) {
      res.status(500).json({ error: "Failed to refresh earnings" });
    }
  });

  // ── IV Rank routes ──
  app.get("/api/iv-rank/:ticker", checkSubscription, (req, res) => {
    try {
      const ticker = req.params.ticker.toUpperCase();
      const ivData = getIVRank(ticker);
      res.json(ivData || { ticker, ivRank: null, ivPercentile: null, message: "No IV data available" });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch IV rank" });
    }
  });

  app.post("/api/iv-rank/batch", checkSubscription, (req, res) => {
    try {
      const { tickers } = req.body;
      if (!Array.isArray(tickers)) {
        return res.status(400).json({ error: "tickers must be an array" });
      }
      const results = getIVRankBatch(tickers.map((t: string) => t.toUpperCase()));
      res.json({ results });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch IV rank batch" });
    }
  });

  // GET /api/auth/status — check subscription status
  app.get("/api/auth/status", async (req, res) => {
    try {
      const authHeader = req.headers["authorization"];
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.json({ authenticated: false, isPremium: false });
      }
      const token = authHeader.slice(7);
      const { data: { user }, error } = await (await import("./auth")).getSupabaseAdmin().auth.getUser(token);
      if (error || !user) {
        return res.json({ authenticated: false, isPremium: false });
      }
      const isPremium = await checkSubscription(user.id);
      return res.json({
        authenticated: true,
        isPremium,
        userId: user.id,
        email: user.email,
      });
    } catch (err) {
      res.status(500).json({ error: "Auth status check failed" });
    }
  });

  // ── Stripe webhook ──
  app.post("/api/stripe/webhook", async (req, res) => {
    try {
      const stripe = (await import("./stripe")).default;
      const sig = req.headers["stripe-signature"] as string;
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      if (!webhookSecret) {
        console.error("STRIPE_WEBHOOK_SECRET not configured");
        return res.status(500).json({ error: "Webhook not configured" });
      }

      let event;
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      } catch (err: any) {
        console.error("Webhook signature verification failed:", err.message);
        return res.status(400).json({ error: "Invalid signature" });
      }

      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as any;
          const userId = session.metadata?.userId;
          const subscriptionId = session.subscription as string;
          if (userId && subscriptionId) {
            db.prepare(
              `INSERT OR REPLACE INTO subscriptions (user_id, stripe_subscription_id, status, updated_at)
               VALUES (?, ?, 'active', datetime('now'))`
            ).run(userId, subscriptionId);
            console.log(`Subscription activated for user ${userId}`);
          }
          break;
        }
        case "customer.subscription.updated": {
          const sub = event.data.object as any;
          const userId = sub.metadata?.userId;
          if (userId) {
            db.prepare(
              `UPDATE subscriptions SET status = ?, updated_at = datetime('now') WHERE user_id = ?`
            ).run(sub.status, userId);
          }
          break;
        }
        case "customer.subscription.deleted": {
          const sub = event.data.object as any;
          const userId = sub.metadata?.userId;
          if (userId) {
            db.prepare(
              `UPDATE subscriptions SET status = 'canceled', updated_at = datetime('now') WHERE user_id = ?`
            ).run(userId);
            console.log(`Subscription canceled for user ${userId}`);
          }
          break;
        }
      }

      res.json({ received: true });
    } catch (err) {
      console.error("Webhook error:", err);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  // POST /api/stripe/create-checkout
  app.post("/api/stripe/create-checkout", requireAuth, async (req, res) => {
    try {
      const stripe = (await import("./stripe")).default;
      const userId = (req as any).userId;
      const { priceId, returnUrl } = req.body;

      if (!priceId) {
        return res.status(400).json({ error: "priceId is required" });
      }

      const baseUrl = returnUrl || process.env.APP_URL || "http://localhost:5000";

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: { userId },
        success_url: `${baseUrl}/dashboard?checkout=success`,
        cancel_url: `${baseUrl}/pricing?checkout=canceled`,
      });

      res.json({ url: session.url, sessionId: session.id });
    } catch (err: any) {
      console.error("Checkout session creation failed:", err);
      res.status(500).json({ error: err.message || "Failed to create checkout session" });
    }
  });

  // POST /api/stripe/create-portal
  app.post("/api/stripe/create-portal", requireAuth, async (req, res) => {
    try {
      const stripe = (await import("./stripe")).default;
      const userId = (req as any).userId;
      const { returnUrl } = req.body;

      // Get customer ID from subscription
      const sub = db.prepare(
        `SELECT stripe_subscription_id FROM subscriptions WHERE user_id = ? AND status = 'active'`
      ).get(userId) as { stripe_subscription_id: string } | undefined;

      if (!sub) {
        return res.status(404).json({ error: "No active subscription found" });
      }

      // Get customer ID from Stripe
      const subscription = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
      const customerId = subscription.customer as string;

      const baseUrl = returnUrl || process.env.APP_URL || "http://localhost:5000";
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${baseUrl}/dashboard`,
      });

      res.json({ url: portalSession.url });
    } catch (err: any) {
      console.error("Portal session creation failed:", err);
      res.status(500).json({ error: err.message || "Failed to create portal session" });
    }
  });

  // ── AI insights endpoint ──
  app.post("/api/ai-insights", requireSubscription, async (req, res) => {
    try {
      const { trade, question } = req.body;
      if (!trade) {
        return res.status(400).json({ error: "trade is required" });
      }

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const tradeContext = `
Strategy: ${trade.strategyType}
Ticker: ${trade.underlyingTicker}
Underlying Price: $${trade.underlyingPrice}
Expiration: ${trade.expirationDate} (${trade.daysToExpiration} DTE)
Net Credit: $${trade.netCredit}
Max Profit: $${trade.maxProfit}
Max Loss: $${trade.maxLoss}
Probability of Profit: ${(trade.probabilityOfProfit * 100).toFixed(1)}%
Annualized ROC: ${trade.annualizedROC}%
Composite Score: ${trade.compositeScore}/100
Delta: ${trade.netDelta}
Theta: ${trade.netTheta}
Break-even: ${trade.breakEvenLow}${trade.breakEvenHigh ? ` - $${trade.breakEvenHigh}` : ""}
`;

      const prompt = question
        ? `You are an expert options trading analyst. Analyze this trade and answer the user's question.

Trade details:
${tradeContext}

User question: ${question}

Provide a concise, actionable answer (2-3 sentences).`
        : `You are an expert options trading analyst. Provide a brief analysis of this options trade.

Trade details:
${tradeContext}

Provide 2-3 key insights about: (1) risk/reward profile, (2) market conditions this works best in, (3) one key risk to monitor. Keep it concise and actionable.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
        temperature: 0.7,
      });

      const insights = completion.choices[0]?.message?.content || "Unable to generate insights";
      res.json({ insights });
    } catch (err: any) {
      console.error("AI insights error:", err);
      res.status(500).json({ error: "Failed to generate AI insights" });
    }
  });

  return httpServer;
}
