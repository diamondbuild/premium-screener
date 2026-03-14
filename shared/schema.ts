import { z } from "zod";

// Individual option leg
export const optionLegSchema = z.object({
  ticker: z.string(),
  contractType: z.enum(["put", "call"]),
  strikePrice: z.number(),
  expirationDate: z.string(),
  action: z.enum(["sell", "buy"]),
  bid: z.number(),
  ask: z.number(),
  midpoint: z.number(),
  delta: z.number(),
  gamma: z.number(),
  theta: z.number(),
  vega: z.number(),
  impliedVolatility: z.number(),
  openInterest: z.number(),
  volume: z.number(),
});

export type OptionLeg = z.infer<typeof optionLegSchema>;

// Strategy types
export const strategyTypes = [
  "cash_secured_put",
  "put_credit_spread",
  "strangle",
  "iron_condor",
] as const;

export const strategyTypeSchema = z.enum(strategyTypes);
export type StrategyType = z.infer<typeof strategyTypeSchema>;

// Strategy display names
export const strategyDisplayNames: Record<StrategyType, string> = {
  cash_secured_put: "Cash Secured Put",
  put_credit_spread: "Put Credit Spread",
  strangle: "Strangle",
  iron_condor: "Iron Condor",
};

// Full strategy trade
export const strategyTradeSchema = z.object({
  id: z.string(),
  strategyType: strategyTypeSchema,
  underlyingTicker: z.string(),
  underlyingPrice: z.number(),
  legs: z.array(optionLegSchema),
  expirationDate: z.string(),
  daysToExpiration: z.number(),

  // P&L metrics
  netCredit: z.number(),         // Total premium collected per contract
  maxProfit: z.number(),          // Max profit (= net credit for credit strategies)
  maxLoss: z.number(),            // Max loss (negative number)
  breakEvenLow: z.number().nullable(),  // Lower breakeven price
  breakEvenHigh: z.number().nullable(), // Upper breakeven price
  riskRewardRatio: z.number(),    // Max profit / max loss (positive)

  // Probability & Greeks
  probabilityOfProfit: z.number(),     // Estimated prob of profit
  netDelta: z.number(),                // Combined delta of all legs
  netTheta: z.number(),                // Combined theta (daily premium decay to you)
  netVega: z.number(),                 // Combined vega exposure
  avgIV: z.number(),                   // Average IV across sold legs

  // Scoring
  deltaZScore: z.number(),             // How elevated delta is vs recent avg
  annualizedROC: z.number(),           // Annualized return on capital at risk
  premiumPerDay: z.number(),           // Net credit * 100 / DTE
  compositeScore: z.number(),          // Final ranking score

  // Liquidity
  minOpenInterest: z.number(),         // Lowest OI across legs
  totalVolume: z.number(),             // Sum of volume across legs
  spreadWidth: z.number().nullable(),  // Width of spreads (null for CSP)
});

export type StrategyTrade = z.infer<typeof strategyTradeSchema>;

// Enriched trade with earnings + IV rank data (added server-side)
export interface StrategyTradeWithEarnings extends StrategyTrade {
  earningsDate: string | null;
  daysToEarnings: number | null;
  hasEarningsBeforeExpiry: boolean;
  earningsFiscalPeriod?: string;
  // IV Rank data
  ivRank: number | null;
  ivPercentile: number | null;
  iv52wHigh: number | null;
  iv52wLow: number | null;
  currentIV: number | null;
}

export const scanStatusSchema = z.object({
  status: z.enum(["idle", "scanning", "complete", "error"]),
  progress: z.number(),
  totalTickers: z.number(),
  scannedTickers: z.number(),
  lastUpdated: z.string().nullable(),
  error: z.string().nullable(),
});

export type ScanStatus = z.infer<typeof scanStatusSchema>;

// ── Scan history record ──
export const scanRecordSchema = z.object({
  id: z.number(),
  scanDate: z.string(),             // ISO timestamp of when scan started
  completedAt: z.string().nullable(), // ISO timestamp of completion
  mode: z.enum(["scheduled", "manual", "startup"]),
  totalTickers: z.number(),
  scannedTickers: z.number(),
  totalTrades: z.number(),
  cspCount: z.number(),
  pcsCount: z.number(),
  strangleCount: z.number(),
  icCount: z.number(),
  avgScore: z.number(),
  avgROC: z.number(),
  avgPOP: z.number(),
  durationMs: z.number(),           // How long the scan took
  status: z.enum(["complete", "failed", "partial"]),
  error: z.string().nullable(),
  universe: z.string().optional(),  // "sp500" | "nasdaq100" | "both"
});

export type ScanRecord = z.infer<typeof scanRecordSchema>;

// ── Watchlist ──
export const watchlistItemSchema = z.object({
  id: z.number(),
  ticker: z.string(),
  addedAt: z.string(),
  scoreThreshold: z.number().nullable(), // Alert when score >= threshold
  notes: z.string().nullable(),
});

export type WatchlistItem = z.infer<typeof watchlistItemSchema>;

export const insertWatchlistSchema = z.object({
  ticker: z.string().min(1).max(10),
  scoreThreshold: z.number().min(0).max(100).nullable().default(null),
  notes: z.string().max(200).nullable().default(null),
});

export type InsertWatchlistItem = z.infer<typeof insertWatchlistSchema>;

// ── Alerts ──
export const alertSchema = z.object({
  id: z.number(),
  watchlistId: z.number(),
  ticker: z.string(),
  strategyType: z.string(),
  tradeId: z.string(),
  compositeScore: z.number(),
  threshold: z.number(),
  scanId: z.number(),
  triggeredAt: z.string(),
  seen: z.boolean(),
  // Snapshot fields for the alert card
  netCredit: z.number(),
  annualizedROC: z.number(),
  probabilityOfProfit: z.number(),
  daysToExpiration: z.number(),
  expirationDate: z.string(),
});

export type Alert = z.infer<typeof alertSchema>;

// ── Backtesting ──
export const backtestRequestSchema = z.object({
  ticker: z.string(),
  strategyType: strategyTypeSchema,
  strikePrice: z.number(),
  strikePrice2: z.number().optional(),
  strikePrice3: z.number().optional(),
  strikePrice4: z.number().optional(),
  underlyingPrice: z.number(),
  daysToExpiration: z.number(),
  netCredit: z.number(),
  spreadWidth: z.number().optional(),
  lookbackMonths: z.number().min(1).max(24).optional(),
});

export type BacktestRequest = z.infer<typeof backtestRequestSchema>;

export const backtestTradeSchema = z.object({
  entryDate: z.string(),
  exitDate: z.string(),
  entryPrice: z.number(),
  exitPrice: z.number(),
  strikeUsed: z.number(),
  strike2Used: z.number().optional(),
  strike3Used: z.number().optional(),
  strike4Used: z.number().optional(),
  creditReceived: z.number(),
  pnlPerContract: z.number(),
  outcome: z.enum(["profit", "loss", "partial"]),
  maxAdverseMove: z.number(),
});

export type BacktestTrade = z.infer<typeof backtestTradeSchema>;

export const backtestResultSchema = z.object({
  ticker: z.string(),
  strategyType: z.string(),
  lookbackMonths: z.number(),
  totalTrades: z.number(),
  wins: z.number(),
  losses: z.number(),
  winRate: z.number(),
  totalPnL: z.number(),
  avgPnL: z.number(),
  maxWin: z.number(),
  maxLoss: z.number(),
  maxDrawdown: z.number(),
  sharpeRatio: z.number(),
  avgDTE: z.number(),
  profitFactor: z.number(),
  trades: z.array(backtestTradeSchema),
  equityCurve: z.array(z.object({ date: z.string(), equity: z.number() })),
  monthlyReturns: z.array(z.object({ month: z.string(), pnl: z.number(), trades: z.number() })),
  computedAt: z.string(),
});

export type BacktestResult = z.infer<typeof backtestResultSchema>;

// ── Trade Journal ──
export const journalStatusValues = ["open", "closed", "expired", "rolled", "assigned"] as const;
export const journalStatusSchema = z.enum(journalStatusValues);
export type JournalStatus = z.infer<typeof journalStatusSchema>;

export const journalEntrySchema = z.object({
  id: z.number(),
  // What was traded
  ticker: z.string(),
  strategyType: strategyTypeSchema,
  legs: z.array(optionLegSchema),
  expirationDate: z.string(),
  // Entry details
  entryDate: z.string(),
  entryCredit: z.number(),                // Credit received per contract at open
  contracts: z.number(),                   // Number of contracts
  underlyingPriceAtEntry: z.number(),
  // Status
  status: journalStatusSchema,
  // Exit details (null while open)
  exitDate: z.string().nullable(),
  exitDebit: z.number().nullable(),        // Debit paid to close (0 if expired worthless)
  pnlPerContract: z.number().nullable(),   // (entryCredit - exitDebit) * 100
  pnlTotal: z.number().nullable(),         // pnlPerContract * contracts
  pnlPercent: z.number().nullable(),       // pnlTotal / max_risk * 100
  underlyingPriceAtExit: z.number().nullable(),
  // Risk at entry
  maxLoss: z.number(),                     // Max risk per contract at entry
  spreadWidth: z.number().nullable(),      // Width of spread (null for CSP)
  // Metadata
  compositeScoreAtEntry: z.number().nullable(),  // Score from scanner
  ivRankAtEntry: z.number().nullable(),          // IVR at entry
  scanTradeId: z.string().nullable(),            // Link back to scanner trade ID
  notes: z.string().nullable(),
  tags: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type JournalEntry = z.infer<typeof journalEntrySchema>;

export const insertJournalEntrySchema = z.object({
  ticker: z.string().min(1).max(10),
  strategyType: strategyTypeSchema,
  legs: z.array(optionLegSchema),
  expirationDate: z.string(),
  entryDate: z.string(),
  entryCredit: z.number().min(0),
  contracts: z.number().int().min(1).default(1),
  underlyingPriceAtEntry: z.number().min(0),
  maxLoss: z.number(),
  spreadWidth: z.number().nullable().default(null),
  compositeScoreAtEntry: z.number().nullable().default(null),
  ivRankAtEntry: z.number().nullable().default(null),
  scanTradeId: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
  tags: z.array(z.string()).default([]),
});

export type InsertJournalEntry = z.infer<typeof insertJournalEntrySchema>;

export const closeJournalEntrySchema = z.object({
  exitDebit: z.number().min(0),
  exitDate: z.string().optional(),
  underlyingPriceAtExit: z.number().min(0).optional(),
  status: z.enum(["closed", "expired", "rolled", "assigned"]).default("closed"),
  notes: z.string().nullable().optional(),
});

export type CloseJournalEntry = z.infer<typeof closeJournalEntrySchema>;

// ── Journal Performance Stats ──
export interface JournalStats {
  totalTrades: number;
  openTrades: number;
  closedTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnL: number;
  avgPnL: number;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  profitFactor: number;
  totalPremiumCollected: number;
  avgDaysHeld: number;
  byStrategy: Record<string, {
    trades: number;
    wins: number;
    losses: number;
    winRate: number;
    totalPnL: number;
  }>;
  monthlyPnL: { month: string; pnl: number; trades: number; wins: number }[];
  equityCurve: { date: string; cumPnL: number }[];
}
