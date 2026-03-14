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
import { Crosshair, BarChart2, PieChart, Award, Flame } from "lucide-react";

type FilterType = "all" | StrategyType;
type SortField = "compositeScore" | "annualizedROC" | "deltaZScore" | "probabilityOfProfit" | "premiumPerDay" | "netCredit" | "ivRank";

const STRATEGY_LABELS: Record<string, string> = {
  all: "All Strategies",
  cash_secured_put: "Cash Secured Puts",
  put_credit_spread: "Put Credit Spreads",
  call_credit_spread: "Call Credit Spreads",
  strangle: "Strangles",
  iron_condor: "Iron Condors",
};

const STRATEGY_SHORT: Record<string, string> = {
  cash_secured_put: "CSP",
  put_credit_spread: "PCS",
  call_credit_spread: "CCS",
  strangle: "Strangle",
  iron_condor: "IC",
};

const STRATEGY_COLORS: Record<string, string> = {
  cash_secured_put: "bg-chart-1 text-white",
  put_credit_spread: "bg-chart-2 text-white",
  call_credit_spread: "bg-rose-500 text-white",
  strangle: "bg-chart-3 text-white",
  iron_condor: "bg-chart-4 text-white dark:text-black",
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
      case "call_credit_spread": {
        const sellCall = legs.find(l => l.action === "sell" && l.contractType === "call");
        const buyCall = legs.find(l => l.action === "buy" && l.contractType === "call");
        req.strikePrice = sellCall?.strikePrice || 0;
        req.strikePrice2 = buyCall?.strikePrice || 0;
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