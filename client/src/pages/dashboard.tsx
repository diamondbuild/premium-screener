import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw,
  Shield,
  Target,
  Zap,
  DollarSign,
  Clock,
  BarChart3,
  Activity,
  Info,
  Moon,
  Sun,
  TrendingDown,
  ArrowDownUp,
  Layers,
  ChevronDown,
  ChevronUp,
  History,
  CheckCircle2,
  XCircle,
  Timer,
  Bell,
  BellRing,
  Star,
  StarOff,
  Plus,
  X,
  Eye,
  Trash2,
  Settings2,
  LineChart,
  TrendingUp,
  Trophy,
  AlertTriangle,
  Calendar,
  CalendarX,
  BookOpen,
  Lock,
} from "lucide-react";
import { Link } from "wouter";
import type { StrategyTrade, StrategyTradeWithEarnings, OptionLeg, StrategyType, ScanStatus, ScanRecord, WatchlistItem, Alert, BacktestResult, BacktestRequest, InsertJournalEntry } from "@shared/schema";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/use-auth";
import { UpgradeBanner, RedactedValue, UserMenu } from "@/components/UpgradeBanner";
import { Label } from "@/components/ui/label";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, BarChart, Bar, Cell, ReferenceLine, Tooltip as RechartsTooltip } from "recharts";
import { Crosshair, BarChart2, PieChart } from "lucide-react";

type FilterType = "all" | StrategyType;
type SortField = "compositeScore" | "annualizedROC" | "deltaZScore" | "probabilityOfProfit" | "premiumPerDay" | "netCredit" | "ivRank";

const STRATEGY_LABELS: Record<string, string> = {
  all: "All Strategies",
  cash_secured_put: "Cash Secured Puts",
  put_credit_spread: "Put Credit Spreads",
  strangle: "Strangles",
  iron_condor: "Iron Condors",
};

const STRATEGY_SHORT: Record<string, string> = {
  cash_secured_put: "CSP",
  put_credit_spread: "PCS",
  strangle: "Strangle",
  iron_condor: "IC",
};

const STRATEGY_COLORS: Record<string, string> = {
  cash_secured_put: "bg-chart-1 text-white",
  put_credit_spread: "bg-chart-2 text-white",
  strangle: "bg-chart-3 text-white",
  iron_condor: "bg-chart-4 text-white dark:text-black",
};

type UniverseId = "sp500" | "nasdaq100" | "both";

const UNIVERSE_OPTIONS: { id: UniverseId; label: string; short: string }[] = [
  { id: "sp500", label: "S&P 500", short: "S&P 500" },
  { id: "nasdaq100", label: "NASDAQ-100", short: "NDX 100" },
  { id: "both", label: "S&P 500 + NASDAQ-100", short: "Combined" },
];

const UNIVERSE_LABELS: Record<UniverseId, string> = {
  sp500: "S&P 500",
  nasdaq100: "NASDAQ-100",
  both: "S&P 500 + NASDAQ-100",
};

function ThemeToggle() {
  const [dark, setDark] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  return (
    <Button size="icon" variant="ghost" onClick={() => setDark(!dark)} data-testid="button-theme-toggle">
      {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </Button>
  );
}

function fmt$(val: number): string {
  return val.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}
function fmtPct(val: number): string { return val.toFixed(1) + "%"; }
function fmtNum(val: number): string {
  if (val >= 1e6) return (val / 1e6).toFixed(1) + "M";
  if (val >= 1e3) return (val / 1e3).toFixed(1) + "K";
  return val.toLocaleString();
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays === 1) return "yesterday";
  return `${diffDays}d ago`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  return `${min}m ${sec % 60}s`;
}

function FreshnessIndicator({ lastUpdated, isScanning }: { lastUpdated: string | null; isScanning: boolean }) {
  if (isScanning) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-chart-3">
        <div className="w-2 h-2 rounded-full bg-chart-3 animate-pulse" />
        <span>Scanning...</span>
      </div>
    );
  }

  if (!lastUpdated) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <div className="w-2 h-2 rounded-full bg-muted-foreground" />
        <span>No data</span>
      </div>
    );
  }

  const diffMs = Date.now() - new Date(lastUpdated).getTime();
  const isStale = diffMs > 8 * 60 * 60 * 1000;
  const isFresh = diffMs < 2 * 60 * 60 * 1000;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={`flex items-center gap-1.5 text-xs ${isFresh ? "text-profit" : isStale ? "text-loss" : "text-muted-foreground"}`}>
          <div className={`w-2 h-2 rounded-full ${isFresh ? "bg-profit" : isStale ? "bg-loss" : "bg-muted-foreground"}`} />
          <span>{timeAgo(lastUpdated)}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {isFresh ? "Data is fresh" : isStale ? "Data may be stale — consider rescanning" : "Last scan " + timeAgo(lastUpdated)}
        <br />
        {new Date(lastUpdated).toLocaleString()}
      </TooltipContent>
    </Tooltip>
  );
}

function ScoreBar({ score, max = 100 }: { score: number; max?: number }) {
  const pct = Math.min((score / max) * 100, 100);
  return (
    <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
      <div className="h-full rounded-full score-bar transition-all duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

function DeltaZBadge({ z }: { z: number }) {
  if (z >= 2.0) return <Badge variant="default" className="text-xs bg-chart-2 text-white">{z.toFixed(1)}σ High</Badge>;
  if (z >= 1.5) return <Badge variant="secondary" className="text-xs">{z.toFixed(1)}σ Elevated</Badge>;
  return <Badge variant="outline" className="text-xs">{z.toFixed(1)}σ</Badge>;
}

// ── IV Rank badge ──
function IVRankBadge({ trade }: { trade: StrategyTradeWithEarnings }) {
  if (trade.ivRank == null) return null;

  const rank = trade.ivRank;
  // Color coding: High IV = good for premium sellers (green), Low IV = bad (cool)
  const isHigh = rank >= 50;
  const isVeryHigh = rank >= 70;
  const isLow = rank < 30;

  const colorClass = isVeryHigh
    ? "border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5"
    : isHigh
      ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5"
      : isLow
        ? "border-blue-500/30 text-blue-500 dark:text-blue-400 bg-blue-500/5"
        : "border-border text-muted-foreground";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className={`text-xs gap-1 ${colorClass}`}>
          <Activity className="w-3 h-3" />
          IVR {Math.round(rank)}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-xs space-y-1">
          <p className="font-medium">IV Rank: {rank.toFixed(1)}%</p>
          {trade.ivPercentile != null && <p>IV Percentile: {trade.ivPercentile.toFixed(1)}%</p>}
          {trade.iv52wHigh != null && trade.iv52wLow != null && (
            <p className="text-muted-foreground">
              52w range: {(trade.iv52wLow * 100).toFixed(0)}% — {(trade.iv52wHigh * 100).toFixed(0)}%
            </p>
          )}
          {trade.currentIV != null && (
            <p className="text-muted-foreground">Current ATM IV: {(trade.currentIV * 100).toFixed(1)}%</p>
          )}
          <p className="text-muted-foreground pt-0.5">
            {isVeryHigh ? "Very rich IV — ideal for selling premium" :
             isHigh ? "Elevated IV — favorable for premium sellers" :
             isLow ? "Low IV — premium may be thin" :
             "Moderate IV environment"}
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function EarningsBadge({ trade }: { trade: StrategyTradeWithEarnings }) {
  if (!trade.earningsDate || !trade.hasEarningsBeforeExpiry) return null;

  const days = trade.daysToEarnings ?? 0;
  const isImminent = days <= 7;
  const label = days === 0 ? "Today" : days === 1 ? "1d" : `${days}d`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={`text-xs gap-1 ${
            isImminent
              ? "border-loss/60 text-loss bg-loss/5"
              : "border-orange-500/50 text-orange-600 dark:text-orange-400 bg-orange-500/5"
          }`}
        >
          <Calendar className="w-3 h-3" />
          ER {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-xs">
          <p className="font-medium">Earnings: {trade.earningsDate}</p>
          {trade.earningsFiscalPeriod && <p className="text-muted-foreground">{trade.earningsFiscalPeriod}</p>}
          <p className="text-loss mt-1">Warning: Earnings fall before {trade.expirationDate} expiry</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function LegRow({ leg }: { leg: OptionLeg }) {
  const isSell = leg.action === "sell";
  return (
    <div className="flex items-center gap-2 text-xs tabular-nums">
      <Badge variant={isSell ? "default" : "outline"} className={`text-xs w-10 justify-center ${isSell ? "" : "opacity-70"}`}>
        {isSell ? "Sell" : "Buy"}
      </Badge>
      <span className="w-8 text-center font-medium">{leg.contractType === "put" ? "Put" : "Call"}</span>
      <span className="w-16 text-right font-mono">{fmt$(leg.strikePrice)}</span>
      <span className="w-14 text-right font-mono text-muted-foreground">{fmt$(leg.midpoint)}</span>
      <span className="w-14 text-right font-mono text-muted-foreground">{leg.delta.toFixed(3)}</span>
      <span className="w-14 text-right font-mono text-muted-foreground">{fmtPct(leg.impliedVolatility * 100)}</span>
    </div>
  );
}

// ── Watchlist star button on trade cards ──
function WatchlistStar({ ticker, watchlist, onAdd }: {
  ticker: string;
  watchlist: WatchlistItem[];
  onAdd: (ticker: string) => void;
}) {
  const isOnWatchlist = watchlist.some(w => w.ticker === ticker);

  const removeMutation = useMutation({
    mutationFn: async () => {
      const item = watchlist.find(w => w.ticker === ticker);
      if (!item) return;
      await apiRequest("DELETE", `/api/watchlist/${item.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
    },
  });

  if (isOnWatchlist) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="text-yellow-500 hover:text-yellow-400 transition-colors p-0.5"
            onClick={(e) => { e.stopPropagation(); removeMutation.mutate(); }}
            data-testid={`star-remove-${ticker}`}
          >
            <Star className="w-4 h-4 fill-current" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Remove {ticker} from watchlist</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className="text-muted-foreground hover:text-yellow-500 transition-colors p-0.5"
          onClick={(e) => { e.stopPropagation(); onAdd(ticker); }}
          data-testid={`star-add-${ticker}`}
        >
          <Star className="w-4 h-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent>Add {ticker} to watchlist</TooltipContent>
    </Tooltip>
  );
}


// ── Backtest Panel ──
function BacktestPanel({ trade, onClose }: { trade: StrategyTrade; onClose: () => void }) {
  const [lookback, setLookback] = useState(6);

  // Build the backtest request from the trade card data
  const buildRequest = (): BacktestRequest => {
    const legs = trade.legs;
    const req: BacktestRequest = {
      ticker: trade.underlyingTicker,
      strategyType: trade.strategyType,
      strikePrice: 0,
      underlyingPrice: trade.underlyingPrice,
      daysToExpiration: trade.daysToExpiration,
      netCredit: trade.netCredit,
      spreadWidth: trade.spreadWidth || undefined,
      lookbackMonths: lookback,
    };

    switch (trade.strategyType) {
      case "cash_secured_put": {
        const sellPut = legs.find(l => l.action === "sell" && l.contractType === "put");
        req.strikePrice = sellPut?.strikePrice || 0;
        break;
      }
      case "put_credit_spread": {
        const sellPut = legs.find(l => l.action === "sell" && l.contractType === "put");
        const buyPut = legs.find(l => l.action === "buy" && l.contractType === "put");
        req.strikePrice = sellPut?.strikePrice || 0;
        req.strikePrice2 = buyPut?.strikePrice || 0;
        break;
      }
      case "strangle": {
        const sellPut = legs.find(l => l.action === "sell" && l.contractType === "put");
        const sellCall = legs.find(l => l.action === "sell" && l.contractType === "call");
        req.strikePrice = sellPut?.strikePrice || 0;
        req.strikePrice2 = sellCall?.strikePrice || 0;
        break;
      }
      case "iron_condor": {
        const putSell = legs.find(l => l.action === "sell" && l.contractType === "put");
        const callSell = legs.find(l => l.action === "sell" && l.contractType === "call");
        const putBuy = legs.find(l => l.action === "buy" && l.contractType === "put");
        const callBuy = legs.find(l => l.action === "buy" && l.contractType === "call");
        req.strikePrice = putSell?.strikePrice || 0;
        req.strikePrice2 = callSell?.strikePrice || 0;
        req.strikePrice3 = putBuy?.strikePrice || 0;
        req.strikePrice4 = callBuy?.strikePrice || 0;
        break;
      }
    }
    return req;
  };

  const backtestMutation = useMutation({
    mutationFn: async () => {
      const req = buildRequest();
      const res = await apiRequest("POST", "/api/backtest", req);
      return (await res.json()) as { result: BacktestResult; cached: boolean };
    },
  });

  useEffect(() => {
    backtestMutation.mutate();
  }, [lookback]);

  const result = backtestMutation.data?.result;
  const isCached = backtestMutation.data?.cached;

  return (
    <Card className="p-4 mt-3 border-primary/20 bg-primary/[0.02]" data-testid="panel-backtest">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <LineChart className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Backtest: {trade.underlyingTicker} {STRATEGY_SHORT[trade.strategyType]}</span>
          {isCached && <Badge variant="outline" className="text-xs">Cached</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs">
            {[3, 6, 12].map(m => (
              <button
                key={m}
                className={`px-2 py-0.5 rounded text-xs transition-colors ${
                  lookback === m
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-muted/80 text-muted-foreground"
                }`}
                onClick={(e) => { e.stopPropagation(); setLookback(m); }}
                data-testid={`button-lookback-${m}`}
              >{m}mo</button>
            ))}
          </div>
          <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="text-muted-foreground hover:text-foreground p-0.5" data-testid="button-close-backtest">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {backtestMutation.isPending && (
        <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Simulating {lookback} months of {STRATEGY_SHORT[trade.strategyType]} trades...
        </div>
      )}

      {backtestMutation.isError && (
        <div className="flex items-center gap-2 py-4 text-sm text-loss">
          <AlertTriangle className="w-4 h-4" />
          {(backtestMutation.error as Error)?.message || "Backtest failed"}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-muted/50 rounded-lg p-2.5 text-center">
              <div className="text-xs text-muted-foreground mb-0.5">Win Rate</div>
              <div className={`text-base font-bold tabular-nums ${result.winRate >= 0.7 ? "text-profit" : result.winRate >= 0.5 ? "text-foreground" : "text-loss"}`}>
                {(result.winRate * 100).toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground">{result.wins}W / {result.losses}L</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-2.5 text-center">
              <div className="text-xs text-muted-foreground mb-0.5">Total P&L</div>
              <div className={`text-base font-bold tabular-nums ${result.totalPnL >= 0 ? "text-profit" : "text-loss"}`}>
                {result.totalPnL >= 0 ? "+" : ""}{fmt$(result.totalPnL)}
              </div>
              <div className="text-xs text-muted-foreground">{result.totalTrades} trades</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-2.5 text-center">
              <div className="text-xs text-muted-foreground mb-0.5">Profit Factor</div>
              <div className={`text-base font-bold tabular-nums ${result.profitFactor >= 2 ? "text-profit" : result.profitFactor >= 1 ? "text-foreground" : "text-loss"}`}>
                {result.profitFactor >= 100 ? "∞" : result.profitFactor.toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground">Gross W / Gross L</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-2.5 text-center">
              <div className="text-xs text-muted-foreground mb-0.5">Max Drawdown</div>
              <div className="text-base font-bold tabular-nums text-loss">
                -{fmt$(result.maxDrawdown)}
              </div>
              <div className="text-xs text-muted-foreground">Sharpe {result.sharpeRatio.toFixed(2)}</div>
            </div>
          </div>

          {/* Equity Curve */}
          {result.equityCurve.length > 1 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2">Equity Curve (per contract)</div>
              <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={result.equityCurve} margin={{ top: 5, right: 5, bottom: 0, left: 5 }}>
                    <defs>
                      <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `$${v}`} stroke="hsl(var(--muted-foreground))" />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 2" />
                    <Area type="monotone" dataKey="equity" stroke="hsl(142, 71%, 45%)" fill="url(#eqGrad)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Monthly Returns */}
          {result.monthlyReturns.length > 1 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2">Monthly Returns</div>
              <div className="h-28 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={result.monthlyReturns} margin={{ top: 5, right: 5, bottom: 0, left: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={(m: string) => m.slice(5)} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `$${v}`} stroke="hsl(var(--muted-foreground))" />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 2" />
                    <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                      {result.monthlyReturns.map((entry, idx) => (
                        <Cell key={idx} fill={entry.pnl >= 0 ? "hsl(142, 71%, 45%)" : "hsl(0, 84%, 60%)"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Trade-by-trade summary (compact) */}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1.5">Trade Log ({result.trades.length} trades)</div>
            <div className="max-h-32 overflow-y-auto rounded border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left py-1 px-2 font-medium">Entry</th>
                    <th className="text-left py-1 px-2 font-medium">Exit</th>
                    <th className="text-right py-1 px-2 font-medium">Price</th>
                    <th className="text-right py-1 px-2 font-medium">Credit</th>
                    <th className="text-right py-1 px-2 font-medium">P&L</th>
                    <th className="text-center py-1 px-2 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {result.trades.map((t, i) => (
                    <tr key={i} className="border-t border-border/50 hover:bg-muted/30">
                      <td className="py-1 px-2 tabular-nums">{t.entryDate.slice(5)}</td>
                      <td className="py-1 px-2 tabular-nums">{t.exitDate.slice(5)}</td>
                      <td className="py-1 px-2 text-right tabular-nums">{fmt$(t.entryPrice)}</td>
                      <td className="py-1 px-2 text-right tabular-nums">{fmt$(t.creditReceived)}</td>
                      <td className={`py-1 px-2 text-right tabular-nums font-medium ${t.pnlPerContract >= 0 ? "text-profit" : "text-loss"}`}>
                        {t.pnlPerContract >= 0 ? "+" : ""}{fmt$(t.pnlPerContract)}
                      </td>
                      <td className="py-1 px-2 text-center">
                        {t.outcome === "profit" ? (
                          <span className="text-profit">✓</span>
                        ) : t.outcome === "partial" ? (
                          <span className="text-chart-4">~</span>
                        ) : (
                          <span className="text-loss">✗</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="text-xs text-muted-foreground/60 italic">
            Simulated using historical stock prices. Assumes weekly entries at same strike distance (% OTM), credit scaled to price level. Not financial advice.
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Payoff Diagram ──
function PayoffDiagram({ trade }: { trade: StrategyTradeWithEarnings }) {
  const W = 340;
  const H = 160;
  const pad = { top: 16, right: 16, bottom: 28, left: 44 };
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top - pad.bottom;

  // Compute payoff points at expiration across a price range
  const price = trade.underlyingPrice;
  const credit = trade.netCredit * 100; // per contract
  const legs = trade.legs;

  // Price range: ±20% from the spread center, expanded to include underlying
  const allStrikes = legs.map((l: any) => l.strikePrice);
  const minStrike = Math.min(...allStrikes);
  const maxStrike = Math.max(...allStrikes);
  const spreadCenter = (minStrike + maxStrike) / 2;
  const spreadWidth = maxStrike - minStrike || maxStrike * 0.05;
  const baseHalf = spreadCenter * 0.20;
  let lo = Math.max(0, spreadCenter - baseHalf);
  let hi = spreadCenter + baseHalf;
  if (price < lo) lo = price - spreadWidth;
  if (price > hi) hi = price + spreadWidth;
  const steps = 80;

  const points: { price: number; pnl: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const p = lo + (hi - lo) * (i / steps);
    let pnl = 0;
    for (const leg of legs) {
      const intrinsic = leg.contractType === "put"
        ? Math.max(leg.strikePrice - p, 0)
        : Math.max(p - leg.strikePrice, 0);
      if (leg.action === "sell") {
        pnl += (leg.midpoint - intrinsic) * 100;
      } else {
        pnl += (intrinsic - leg.midpoint) * 100;
      }
    }
    points.push({ price: p, pnl });
  }

  const maxPnl = Math.max(...points.map(p => p.pnl));
  const minPnl = Math.min(...points.map(p => p.pnl));
  const pnlRange = maxPnl - minPnl || 1;
  const pnlPad = pnlRange * 0.1;
  const yMin = minPnl - pnlPad;
  const yMax = maxPnl + pnlPad;

  const toX = (px: number) => pad.left + ((px - lo) / (hi - lo)) * cW;
  const toY = (pnl: number) => pad.top + (1 - (pnl - yMin) / (yMax - yMin)) * cH;
  const zeroY = Math.max(pad.top, Math.min(pad.top + cH, toY(0)));

  // Build path
  const pathD = points.map((pt, i) => {
    const x = toX(pt.price);
    const y = toY(pt.pnl);
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  // Fill area: green above zero, red below zero
  const fillAbove = points.map((pt, i) => {
    const x = toX(pt.price);
    const y = Math.min(toY(Math.max(pt.pnl, 0)), zeroY);
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ") + ` L${toX(hi).toFixed(1)},${zeroY.toFixed(1)} L${toX(lo).toFixed(1)},${zeroY.toFixed(1)} Z`;

  const fillBelow = points.map((pt, i) => {
    const x = toX(pt.price);
    const y = Math.max(toY(Math.min(pt.pnl, 0)), zeroY);
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ") + ` L${toX(hi).toFixed(1)},${zeroY.toFixed(1)} L${toX(lo).toFixed(1)},${zeroY.toFixed(1)} Z`;

  // Expected move from IV
  const avgIV = trade.avgIV;
  const dte = trade.daysToExpiration;
  const em = price * avgIV * Math.sqrt(dte / 365);
  const emLo = price - em;
  const emHi = price + em;

  // Y-axis ticks
  const yTicks: number[] = [];
  const yStep = Math.ceil(pnlRange / 4 / 50) * 50 || 100;
  const yStart = Math.ceil(yMin / yStep) * yStep;
  for (let v = yStart; v <= yMax; v += yStep) {
    yTicks.push(v);
  }
  if (!yTicks.includes(0) && yMin < 0 && yMax > 0) yTicks.push(0);
  yTicks.sort((a, b) => a - b);

  // Break-even markers
  const breakEvens: number[] = [];
  if (trade.breakEvenLow) breakEvens.push(trade.breakEvenLow);
  if (trade.breakEvenHigh) breakEvens.push(trade.breakEvenHigh);

  return (
    <div className="mt-3" data-testid="payoff-diagram">
      <div className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
        <Crosshair className="w-3 h-3" />
        P&L at Expiration
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
        {/* Expected move shading (clamp to visible range) */}
        {emLo < hi && emHi > lo && (
          <rect
            x={toX(Math.max(emLo, lo))}
            y={pad.top}
            width={toX(Math.min(emHi, hi)) - toX(Math.max(emLo, lo))}
            height={cH}
            fill="hsl(217, 91%, 60%)"
            opacity={0.06}
            rx={2}
          />
        )}

        {/* Grid lines */}
        {yTicks.map((v) => (
          <line
            key={v}
            x1={pad.left}
            x2={W - pad.right}
            y1={toY(v)}
            y2={toY(v)}
            stroke="hsl(var(--border))"
            strokeWidth={v === 0 ? 1 : 0.5}
            strokeDasharray={v === 0 ? "none" : "2 2"}
          />
        ))}

        {/* Profit fill */}
        <path d={fillAbove} fill="hsl(142, 71%, 45%)" opacity={0.15} />
        {/* Loss fill */}
        <path d={fillBelow} fill="hsl(0, 72%, 51%)" opacity={0.15} />

        {/* Payoff line */}
        <path d={pathD} fill="none" stroke="hsl(var(--foreground))" strokeWidth={1.5} />

        {/* Underlying price line */}
        <line
          x1={toX(price)} y1={pad.top} x2={toX(price)} y2={pad.top + cH}
          stroke="hsl(var(--muted-foreground))" strokeWidth={0.75} strokeDasharray="3 3"
        />
        <text x={toX(price)} y={pad.top + cH + 12} textAnchor="middle" fontSize={9} fill="hsl(var(--muted-foreground))">
          {fmt$(price)}
        </text>

        {/* Expected move range labels */}
        {emLo > lo && (
          <>
            <line x1={toX(emLo)} y1={pad.top} x2={toX(emLo)} y2={pad.top + cH} stroke="hsl(217, 91%, 60%)" strokeWidth={0.5} strokeDasharray="2 2" />
            <text x={toX(emLo)} y={pad.top + cH + 12} textAnchor="middle" fontSize={8} fill="hsl(217, 91%, 60%)">
              {fmt$(emLo)}
            </text>
          </>
        )}
        {emHi < hi && (
          <>
            <line x1={toX(emHi)} y1={pad.top} x2={toX(emHi)} y2={pad.top + cH} stroke="hsl(217, 91%, 60%)" strokeWidth={0.5} strokeDasharray="2 2" />
            <text x={toX(emHi)} y={pad.top + cH + 12} textAnchor="middle" fontSize={8} fill="hsl(217, 91%, 60%)">
              {fmt$(emHi)}
            </text>
          </>
        )}

        {/* Break-even lines */}
        {breakEvens.map((be) => {
          if (be < lo || be > hi) return null;
          return (
            <g key={be}>
              <line x1={toX(be)} y1={pad.top} x2={toX(be)} y2={pad.top + cH} stroke="hsl(var(--foreground))" strokeWidth={0.75} strokeDasharray="4 2" opacity={0.5} />
              <text x={toX(be)} y={pad.top - 4} textAnchor="middle" fontSize={8} fill="hsl(var(--foreground))" opacity={0.7}>
                BE {fmt$(be)}
              </text>
            </g>
          );
        })}

        {/* Y-axis labels */}
        {yTicks.map((v) => (
          <text key={v} x={pad.left - 3} y={toY(v) + 3} textAnchor="end" fontSize={8} fill="hsl(var(--muted-foreground))">
            {v >= 0 ? `$${v}` : `-$${Math.abs(v)}`}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ── Trade card ──
function TradeCard({
  trade,
  expanded,
  onToggle,
  watchlist,
  onAddToWatchlist,
}: {
  trade: StrategyTradeWithEarnings;
  expanded: boolean;
  onToggle: () => void;
  watchlist: WatchlistItem[];
  onAddToWatchlist: (ticker: string) => void;
}) {
  const [showBacktest, setShowBacktest] = useState(false);
  const [showPayoff, setShowPayoff] = useState(false);
  const strategy = trade.strategyType;
  const colorClass = STRATEGY_COLORS[strategy] || "bg-muted text-foreground";

  return (
    <Card
      className={`p-4 cursor-pointer transition-all hover:shadow-md hover:border-primary/30 ${expanded ? "border-primary/20" : ""}`}
      onClick={onToggle}
      data-testid={`trade-card-${trade.underlyingTicker}`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <WatchlistStar ticker={trade.underlyingTicker} watchlist={watchlist} onAdd={onAddToWatchlist} />
          <span className="font-bold text-base">{trade.underlyingTicker}</span>
          <Badge className={`text-xs shrink-0 ${colorClass}`}>{STRATEGY_SHORT[strategy]}</Badge>
          <EarningsBadge trade={trade} />
          <IVRankBadge trade={trade} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <div className="text-sm font-bold tabular-nums text-profit">{fmt$(trade.netCredit)}</div>
            <div className="text-xs text-muted-foreground">{fmtPct(trade.annualizedROC)} ann.</div>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      {/* Score bar + key metrics */}
      <div className="mt-2.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>Composite Score</span>
          <span className="font-medium text-foreground">{trade.compositeScore.toFixed(0)}</span>
        </div>
        <ScoreBar score={trade.compositeScore} />
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
        <div>
          <span className="text-muted-foreground">PoP</span>
          <div className="font-medium tabular-nums">{fmtPct(trade.probabilityOfProfit * 100)}</div>
        </div>
        <div>
          <span className="text-muted-foreground">DTE</span>
          <div className="font-medium tabular-nums">{trade.daysToExpiration}d</div>
        </div>
        <div>
          <span className="text-muted-foreground">$/day</span>
          <div className="font-medium tabular-nums">{fmt$(trade.premiumPerDay)}</div>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-4 space-y-3 border-t border-border pt-3">
          {/* Leg details */}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <Layers className="w-3 h-3" />
              Option Legs
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5 pl-12">
              <span className="w-8 text-center">Type</span>
              <span className="w-16 text-right">Strike</span>
              <span className="w-14 text-right">Mid</span>
              <span className="w-14 text-right">Delta</span>
              <span className="w-14 text-right">IV</span>
            </div>
            {trade.legs.map((leg, i) => <LegRow key={i} leg={leg} />)}
          </div>

          {/* Full metrics */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Underlying</span>
              <span className="font-mono tabular-nums">{fmt$(trade.underlyingPrice)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Expiration</span>
              <span className="font-mono tabular-nums">{trade.expirationDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Net Credit</span>
              <span className="font-mono tabular-nums text-profit">{fmt$(trade.netCredit)}</span>
            </div>
            {trade.spreadWidth && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Width</span>
                <span className="font-mono tabular-nums">{fmt$(trade.spreadWidth)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ann. ROC</span>
              <span className="font-mono tabular-nums">{fmtPct(trade.annualizedROC)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Delta Z</span>
              <span className="font-mono tabular-nums">{trade.deltaZScore.toFixed(2)}σ</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Avg IV</span>
              <span className="font-mono tabular-nums">{fmtPct(trade.avgIV * 100)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">$/Day</span>
              <span className="font-mono tabular-nums">{fmt$(trade.premiumPerDay)}</span>
            </div>
            {trade.breakEvenLow && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">BE Low</span>
                <span className="font-mono tabular-nums">{fmt$(trade.breakEvenLow)}</span>
              </div>
            )}
            {trade.breakEvenHigh && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">BE High</span>
                <span className="font-mono tabular-nums">{fmt$(trade.breakEvenHigh)}</span>
              </div>
            )}
            {trade.maxRisk && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Max Risk</span>
                <span className="font-mono tabular-nums text-loss">-{fmt$(trade.maxRisk)}</span>
              </div>
            )}
          </div>

          {/* Action row: payoff + backtest toggles */}
          <div className="flex items-center gap-2 pt-1">
            <button
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors ${
                showPayoff ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
              }`}
              onClick={(e) => { e.stopPropagation(); setShowPayoff(!showPayoff); }}
              data-testid={`button-payoff-${trade.underlyingTicker}`}
            >
              <Crosshair className="w-3 h-3" />
              Payoff
            </button>
            <button
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors ${
                showBacktest ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
              }`}
              onClick={(e) => { e.stopPropagation(); setShowBacktest(!showBacktest); if (showPayoff) setShowPayoff(false); }}
              data-testid={`button-backtest-${trade.underlyingTicker}`}
            >
              <LineChart className="w-3 h-3" />
              Backtest
            </button>
          </div>

          {showPayoff && <PayoffDiagram trade={trade} />}
          {showBacktest && <BacktestPanel trade={trade} onClose={() => setShowBacktest(false)} />}
        </div>
      )}
    </Card>
  );
}

// ── Alert Modal ──
function AlertModal({
  isOpen,
  onClose,
  onCreate,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (alert: { ticker: string; alertType: "price_above" | "price_below" | "iv_rank_above"; threshold: number }) => void;
}) {
  const [ticker, setTicker] = useState("");
  const [alertType, setAlertType] = useState<"price_above" | "price_below" | "iv_rank_above">("price_above");
  const [threshold, setThreshold] = useState("");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <Card className="p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Create Price Alert</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Ticker</Label>
            <Input
              placeholder="e.g. AAPL"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              className="mt-1 h-8 text-sm"
              data-testid="input-alert-ticker"
            />
          </div>
          <div>
            <Label className="text-xs">Alert Type</Label>
            <div className="grid grid-cols-3 gap-1 mt-1">
              {(["price_above", "price_below", "iv_rank_above"] as const).map(t => (
                <button
                  key={t}
                  className={`px-2 py-1 text-xs rounded border transition-colors ${
                    alertType === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                  onClick={() => setAlertType(t)}
                >
                  {t === "price_above" ? "Above" : t === "price_below" ? "Below" : "IV Rank>"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs">Threshold</Label>
            <Input
              type="number"
              placeholder={alertType === "iv_rank_above" ? "e.g. 50" : "e.g. 150.00"}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="mt-1 h-8 text-sm"
              data-testid="input-alert-threshold"
            />
          </div>
          <Button
            className="w-full"
            size="sm"
            disabled={!ticker || !threshold}
            onClick={() => {
              onCreate({ ticker, alertType, threshold: parseFloat(threshold) });
              setTicker(""); setThreshold("");
              onClose();
            }}
            data-testid="button-create-alert"
          >
            Create Alert
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ── Journal Entry Modal ──
function JournalModal({
  isOpen,
  onClose,
  onCreate,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (entry: InsertJournalEntry) => void;
}) {
  const [ticker, setTicker] = useState("");
  const [strategyType, setStrategyType] = useState("cash_secured_put");
  const [netCredit, setNetCredit] = useState("");
  const [notes, setNotes] = useState("");
  const [entryDate, setEntryDate] = useState("");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <Card className="p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">New Journal Entry</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Ticker</Label>
              <Input placeholder="AAPL" value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} className="mt-1 h-8 text-sm" data-testid="input-journal-ticker" />
            </div>
            <div>
              <Label className="text-xs">Entry Date</Label>
              <Input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} className="mt-1 h-8 text-sm" data-testid="input-journal-date" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Strategy</Label>
            <div className="grid grid-cols-2 gap-1 mt-1">
              {Object.entries(STRATEGY_SHORT).map(([key, label]) => (
                <button key={key}
                  className={`px-2 py-1 text-xs rounded border transition-colors ${
                    strategyType === key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                  onClick={() => setStrategyType(key)}
                >{label}</button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs">Net Credit ($)</Label>
            <Input type="number" step="0.01" placeholder="e.g. 1.25" value={netCredit} onChange={e => setNetCredit(e.target.value)} className="mt-1 h-8 text-sm" data-testid="input-journal-credit" />
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <textarea
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Trade rationale, market conditions..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              data-testid="input-journal-notes"
            />
          </div>
          <Button className="w-full" size="sm"
            disabled={!ticker || !netCredit}
            onClick={() => {
              onCreate({
                ticker,
                strategyType: strategyType as StrategyType,
                netCredit: parseFloat(netCredit),
                notes: notes || undefined,
                entryDate: entryDate || undefined,
              });
              setTicker(""); setNetCredit(""); setNotes(""); setEntryDate("");
              onClose();
            }}
            data-testid="button-submit-journal"
          >Save Entry</Button>
        </div>
      </Card>
    </div>
  );
}

// ── Universe Picker (dropdown) ──
function UniversePicker({ value, onChange }: { value: UniverseId; onChange: (v: UniverseId) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const current = UNIVERSE_OPTIONS.find(o => o.id === value)!;

  return (
    <div ref={ref} className="relative" data-testid="universe-picker">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-background text-sm hover:bg-muted transition-colors"
        data-testid="universe-picker-trigger"
      >
        <Layers className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="font-medium">{current.short}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[200px] rounded-md border border-border bg-popover shadow-lg py-1">
          {UNIVERSE_OPTIONS.map(opt => (
            <button
              key={opt.id}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted transition-colors ${
                opt.id === value ? "text-primary font-medium" : "text-foreground"
              }`}
              onClick={() => { onChange(opt.id); setOpen(false); }}
              data-testid={`universe-option-${opt.id}`}
            >
              <span>{opt.label}</span>
              {opt.id === value && <CheckCircle2 className="w-4 h-4 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ──
export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [filter, setFilter] = useState<FilterType>("all");
  const [sortBy, setSortBy] = useState<SortField>("compositeScore");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [activeTab, setActiveTab] = useState<"scanner" | "watchlist" | "alerts" | "history" | "journal">("scanner");
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [showJournalModal, setShowJournalModal] = useState(false);
  const [watchlistInput, setWatchlistInput] = useState("");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const [universe, setUniverse] = useState<UniverseId>("sp500");

  const isPro = user?.subscriptionTier === "pro";

  // ── Data fetching ──
  const tradesQuery = useQuery<StrategyTradeWithEarnings[]>({
    queryKey: ["/api/trades"],
    staleTime: 5 * 60 * 1000,
  });

  const scanHistoryQuery = useQuery<ScanRecord[]>({
    queryKey: ["/api/scan-history"],
    staleTime: 60 * 1000,
  });

  const watchlistQuery = useQuery<WatchlistItem[]>({
    queryKey: ["/api/watchlist"],
    staleTime: 30 * 1000,
  });

  const alertsQuery = useQuery<Alert[]>({
    queryKey: ["/api/alerts"],
    staleTime: 30 * 1000,
  });

  const journalQuery = useQuery<any[]>({
    queryKey: ["/api/journal"],
    staleTime: 60 * 1000,
  });

  // ── Sort menu close on outside click ──
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setShowSortMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Scan mutation ──
  const scanMutation = useMutation({
    mutationFn: async () => {
      setScanStatus({ status: "running", progress: 0, currentTicker: "", totalTickers: 0, completedTickers: 0 });
      const res = await apiRequest("POST", "/api/scan", { universe });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Scan failed" }));
        throw new Error(err.message || "Scan failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trades"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scan-history"] });
      setScanStatus(null);
      toast({ title: "Scan Complete", description: "Results updated." });
    },
    onError: (err: Error) => {
      setScanStatus(null);
      toast({ title: "Scan Failed", description: err.message, variant: "destructive" });
    },
  });

  // ── Watchlist mutation ──
  const addToWatchlistMutation = useMutation({
    mutationFn: async (ticker: string) => {
      const res = await apiRequest("POST", "/api/watchlist", { ticker });
      if (!res.ok) throw new Error("Failed to add to watchlist");
      return res.json();
    },
    onSuccess: (_, ticker) => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
      toast({ title: `${ticker} added to watchlist` });
    },
    onError: () => toast({ title: "Error", description: "Could not add to watchlist", variant: "destructive" }),
  });

  // ── Alert mutation ──
  const createAlertMutation = useMutation({
    mutationFn: async (alert: { ticker: string; alertType: "price_above" | "price_below" | "iv_rank_above"; threshold: number }) => {
      const res = await apiRequest("POST", "/api/alerts", alert);
      if (!res.ok) throw new Error("Failed to create alert");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      toast({ title: "Alert created" });
    },
    onError: () => toast({ title: "Error", description: "Could not create alert", variant: "destructive" }),
  });

  // ── Journal mutation ──
  const createJournalMutation = useMutation({
    mutationFn: async (entry: InsertJournalEntry) => {
      const res = await apiRequest("POST", "/api/journal", entry);
      if (!res.ok) throw new Error("Failed to create journal entry");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/journal"] });
      toast({ title: "Journal entry saved" });
    },
    onError: () => toast({ title: "Error", description: "Could not save journal entry", variant: "destructive" }),
  });

  // ── Filter + sort trades ──
  const allTrades = tradesQuery.data ?? [];
  const filteredTrades = allTrades
    .filter(t => filter === "all" || t.strategyType === filter)
    .sort((a, b) => {
      switch (sortBy) {
        case "annualizedROC": return b.annualizedROC - a.annualizedROC;
        case "deltaZScore": return b.deltaZScore - a.deltaZScore;
        case "probabilityOfProfit": return b.probabilityOfProfit - a.probabilityOfProfit;
        case "premiumPerDay": return b.premiumPerDay - a.premiumPerDay;
        case "netCredit": return b.netCredit - a.netCredit;
        case "ivRank": return (b.ivRank ?? 0) - (a.ivRank ?? 0);
        default: return b.compositeScore - a.compositeScore;
      }
    });

  const lastScan = scanHistoryQuery.data?.[0];
  const isScanning = scanMutation.isPending;

  // ── Ticker count query (for universe display) ──
  const tickerCountQuery = useQuery<{ universe: string; count: number }>({
    queryKey: ["/api/ticker-count", universe],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/ticker-count?universe=${universe}`);
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  const SORT_OPTIONS: { value: SortField; label: string }[] = [
    { value: "compositeScore", label: "Composite Score" },
    { value: "annualizedROC", label: "Ann. ROC" },
    { value: "deltaZScore", label: "Delta Z-Score" },
    { value: "probabilityOfProfit", label: "Prob. of Profit" },
    { value: "premiumPerDay", label: "$/Day" },
    { value: "netCredit", label: "Net Credit" },
    { value: "ivRank", label: "IV Rank" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Top nav */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                <Target className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-bold text-base tracking-tight">PremiumScreener</span>
            </div>
            <UniversePicker value={universe} onChange={setUniverse} />
          </div>
          <div className="flex items-center gap-2">
            <FreshnessIndicator lastUpdated={lastScan?.completedAt ?? null} isScanning={isScanning} />
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Upgrade Banner */}
        <UpgradeBanner />

        {/* ── Scanner tab ── */}
        {activeTab === "scanner" && (
          <>
            {/* Controls bar */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Strategy filter tabs */}
              <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterType)} className="flex-1 min-w-0">
                <TabsList className="h-8">
                  {Object.entries(STRATEGY_LABELS).map(([k, v]) => (
                    <TabsTrigger key={k} value={k} className="text-xs h-full px-3">{v}</TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              {/* Sort picker */}
              <div className="relative" ref={sortMenuRef}>
                <button
                  className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-background text-sm hover:bg-muted transition-colors"
                  onClick={() => setShowSortMenu(s => !s)}
                  data-testid="button-sort"
                >
                  <ArrowDownUp className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{SORT_OPTIONS.find(o => o.value === sortBy)?.label ?? "Sort"}</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                {showSortMenu && (
                  <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-md border border-border bg-popover shadow-lg py-1">
                    {SORT_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        className={`w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors ${
                          sortBy === opt.value ? "text-primary font-medium" : "text-foreground"
                        }`}
                        onClick={() => { setSortBy(opt.value); setShowSortMenu(false); }}
                        data-testid={`sort-option-${opt.value}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Scan button */}
              <Button
                onClick={() => scanMutation.mutate()}
                disabled={isScanning}
                className="h-8 px-4 text-sm"
                data-testid="button-scan"
              >
                {isScanning ? (
                  <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />Scanning...</>
                ) : (
                  <><Zap className="w-3.5 h-3.5 mr-1.5" />Scan {UNIVERSE_LABELS[universe]}</>
                )}
              </Button>
            </div>

            {/* Scan progress */}
            {scanStatus && (
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <span className="font-medium">
                        Scanning {scanStatus.currentTicker || "..."}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {scanStatus.completedTickers} / {scanStatus.totalTickers}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-300"
                        style={{ width: `${scanStatus.totalTickers > 0 ? (scanStatus.completedTickers / scanStatus.totalTickers) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Results count + universe info */}
            {!isScanning && allTrades.length > 0 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {filteredTrades.length} opportunity{filteredTrades.length !== 1 ? "ies" : "y"}
                  {filter !== "all" && ` · ${STRATEGY_LABELS[filter]}`}
                  {tickerCountQuery.data && (
                    <span className="ml-2 text-xs">
                      · Scanning {tickerCountQuery.data.count} tickers ({UNIVERSE_LABELS[universe]})
                    </span>
                  )}
                </span>
                <span className="text-xs">Sorted by {SORT_OPTIONS.find(o => o.value === sortBy)?.label}</span>
              </div>
            )}

            {/* Trade list */}
            {tradesQuery.isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Card key={i} className="p-4">
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-3/4" />
                    </div>
                  </Card>
                ))}
              </div>
            ) : tradesQuery.isError ? (
              <Card className="p-8 text-center">
                <AlertTriangle className="w-8 h-8 text-loss mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Failed to load trades. Try scanning.</p>
              </Card>
            ) : filteredTrades.length === 0 ? (
              <Card className="p-8 text-center">
                <Target className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {allTrades.length === 0 ? "No scan results yet. Click Scan to begin." : "No opportunities match current filters."}
                </p>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredTrades.map(trade => (
                  <TradeCard
                    key={trade.id}
                    trade={trade}
                    expanded={expandedId === trade.id}
                    onToggle={() => setExpandedId(expandedId === trade.id ? null : trade.id)}
                    watchlist={watchlistQuery.data ?? []}
                    onAddToWatchlist={(ticker) => addToWatchlistMutation.mutate(ticker)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Watchlist tab ── */}
        {activeTab === "watchlist" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Add ticker (e.g. AAPL)"
                value={watchlistInput}
                onChange={(e) => setWatchlistInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && watchlistInput) {
                    addToWatchlistMutation.mutate(watchlistInput);
                    setWatchlistInput("");
                  }
                }}
                className="h-8 text-sm max-w-xs"
                data-testid="input-watchlist-ticker"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => { if (watchlistInput) { addToWatchlistMutation.mutate(watchlistInput); setWatchlistInput(""); } }}
                data-testid="button-add-watchlist"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Add
              </Button>
            </div>
            {watchlistQuery.isLoading ? (
              <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : (watchlistQuery.data ?? []).length === 0 ? (
              <Card className="p-8 text-center">
                <Star className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Watchlist empty. Add tickers or star trades.</p>
              </Card>
            ) : (
              <div className="space-y-2">
                {(watchlistQuery.data ?? []).map(item => (
                  <Card key={item.id} className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Star className="w-4 h-4 text-yellow-500 fill-current" />
                      <div>
                        <div className="font-medium text-sm">{item.ticker}</div>
                        {item.notes && <div className="text-xs text-muted-foreground">{item.notes}</div>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.alertPrice && (
                        <Badge variant="outline" className="text-xs">
                          <Bell className="w-3 h-3 mr-1" />{fmt$(item.alertPrice)}
                        </Badge>
                      )}
                      <button
                        className="text-muted-foreground hover:text-loss transition-colors"
                        onClick={async () => {
                          await apiRequest("DELETE", `/api/watchlist/${item.id}`);
                          queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
                        }}
                        data-testid={`button-remove-watchlist-${item.ticker}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Alerts tab ── */}
        {activeTab === "alerts" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setShowAlertModal(true)} data-testid="button-new-alert">
                <Plus className="w-3.5 h-3.5 mr-1" />New Alert
              </Button>
            </div>
            {alertsQuery.isLoading ? (
              <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : (alertsQuery.data ?? []).length === 0 ? (
              <Card className="p-8 text-center">
                <Bell className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No alerts set. Create one to get notified.</p>
              </Card>
            ) : (
              <div className="space-y-2">
                {(alertsQuery.data ?? []).map(alert => (
                  <Card key={alert.id} className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <BellRing className="w-4 h-4 text-primary" />
                      <div>
                        <div className="font-medium text-sm">{alert.ticker}</div>
                        <div className="text-xs text-muted-foreground">
                          {alert.alertType === "price_above" ? "Price above" : alert.alertType === "price_below" ? "Price below" : "IV Rank above"} {alert.alertType === "iv_rank_above" ? alert.threshold : fmt$(alert.threshold)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={alert.isActive ? "default" : "secondary"} className="text-xs">
                        {alert.isActive ? "Active" : "Triggered"}
                      </Badge>
                      <button
                        className="text-muted-foreground hover:text-loss transition-colors"
                        onClick={async () => {
                          await apiRequest("DELETE", `/api/alerts/${alert.id}`);
                          queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
                        }}
                        data-testid={`button-delete-alert-${alert.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Scan History tab ── */}
        {activeTab === "history" && (
          <div className="space-y-3">
            {scanHistoryQuery.isLoading ? (
              <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : (scanHistoryQuery.data ?? []).length === 0 ? (
              <Card className="p-8 text-center">
                <History className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No scan history yet.</p>
              </Card>
            ) : (
              (scanHistoryQuery.data ?? []).map(record => (
                <Card key={record.id} className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {record.status === "completed" ? (
                        <CheckCircle2 className="w-4 h-4 text-profit" />
                      ) : record.status === "failed" ? (
                        <XCircle className="w-4 h-4 text-loss" />
                      ) : (
                        <Timer className="w-4 h-4 text-chart-3 animate-pulse" />
                      )}
                      <div>
                        <div className="text-sm font-medium">
                          {record.status === "completed" ? `${record.tradesFound} trade${record.tradesFound !== 1 ? "s" : ""} found` : record.status === "failed" ? "Scan failed" : "Running..."}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {record.startedAt ? timeAgo(record.startedAt) : ""}
                          {record.durationMs ? ` · ${formatDuration(record.durationMs)}` : ""}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant="outline" className="text-xs">{record.status}</Badge>
                      {record.tickersScanned && (
                        <div className="text-xs text-muted-foreground mt-0.5">{record.tickersScanned} tickers</div>
                      )}
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        )}

        {/* ── Journal tab ── */}
        {activeTab === "journal" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setShowJournalModal(true)} data-testid="button-new-journal">
                <Plus className="w-3.5 h-3.5 mr-1" />New Entry
              </Button>
            </div>
            {journalQuery.isLoading ? (
              <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
            ) : (journalQuery.data ?? []).length === 0 ? (
              <Card className="p-8 text-center">
                <BookOpen className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No journal entries yet. Log your trades to track performance.</p>
              </Card>
            ) : (
              <div className="space-y-2">
                {(journalQuery.data ?? []).map((entry: any) => (
                  <Card key={entry.id} className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <div className="text-sm font-medium">{entry.ticker} <Badge className={`text-xs ${STRATEGY_COLORS[entry.strategyType] ?? ""}`}>{STRATEGY_SHORT[entry.strategyType] ?? entry.strategyType}</Badge></div>
                          <div className="text-xs text-muted-foreground">
                            {entry.entryDate ?? ""} · Credit: {fmt$(entry.netCredit)}
                          </div>
                          {entry.notes && <div className="text-xs text-muted-foreground mt-0.5 italic">{entry.notes}</div>}
                        </div>
                      </div>
                      <button
                        className="text-muted-foreground hover:text-loss transition-colors shrink-0"
                        onClick={async () => {
                          await apiRequest("DELETE", `/api/journal/${entry.id}`);
                          queryClient.invalidateQueries({ queryKey: ["/api/journal"] });
                        }}
                        data-testid={`button-delete-journal-${entry.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Floating tab bar */}
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40">
          <div className="flex items-center gap-1 bg-background/95 backdrop-blur border border-border rounded-full px-2 py-1.5 shadow-lg">
            {([
              { id: "scanner", icon: Target, label: "Scanner" },
              { id: "watchlist", icon: Star, label: "Watchlist" },
              { id: "alerts", icon: Bell, label: "Alerts" },
              { id: "history", icon: History, label: "History" },
              { id: "journal", icon: BookOpen, label: "Journal" },
            ] as const).map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  activeTab === id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
                onClick={() => setActiveTab(id)}
                data-testid={`tab-${id}`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>

      </main>

      {/* Modals */}
      <AlertModal
        isOpen={showAlertModal}
        onClose={() => setShowAlertModal(false)}
        onCreate={(alert) => createAlertMutation.mutate(alert)}
      />
      <JournalModal
        isOpen={showJournalModal}
        onClose={() => setShowJournalModal(false)}
        onCreate={(entry) => createJournalMutation.mutate(entry)}
      />
    </div>
  );
}