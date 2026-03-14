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
            <line x1={toX(emLo)} y1={pad.top} x2={toX(emLo)} y2={pad.top + cH} stroke="hsl(217, 91%, 60%)" strokeWidth={0.5} strokeDasharray="3 3" />
            <text x={toX(emLo)} y={pad.top - 4} textAnchor="middle" fontSize={8} fill="hsl(217, 91%, 60%)">
              -{(em / price * 100).toFixed(0)}%
            </text>
          </>
        )}
        {emHi < hi && (
          <>
            <line x1={toX(emHi)} y1={pad.top} x2={toX(emHi)} y2={pad.top + cH} stroke="hsl(217, 91%, 60%)" strokeWidth={0.5} strokeDasharray="3 3" />
            <text x={toX(emHi)} y={pad.top - 4} textAnchor="middle" fontSize={8} fill="hsl(217, 91%, 60%)">
              +{(em / price * 100).toFixed(0)}%
            </text>
          </>
        )}

        {/* Break-even markers */}
        {breakEvens.filter(be => be >= lo && be <= hi).map((be, i) => (
          <g key={i}>
            <line x1={toX(be)} y1={pad.top} x2={toX(be)} y2={pad.top + cH} stroke="hsl(var(--muted-foreground))" strokeWidth={0.75} strokeDasharray="2 3" />
            <text x={toX(be)} y={pad.top + cH + 22} textAnchor="middle" fontSize={8} fill="hsl(var(--muted-foreground))">
              BE {fmt$(be)}
            </text>
          </g>
        ))}

        {/* Strike price markers */}
        {legs.filter((l: any) => l.strikePrice >= lo && l.strikePrice <= hi).map((l: any, i: number) => (
          <g key={i}>
            <circle cx={toX(l.strikePrice)} cy={zeroY} r={2.5} fill={l.action === "sell" ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))"} />
          </g>
        ))}

        {/* Y-axis labels */}
        {yTicks.map((v) => (
          <text key={v} x={pad.left - 4} y={toY(v) + 3} textAnchor="end" fontSize={8} fill="hsl(var(--muted-foreground))">
            {v >= 0 ? `$${v}` : `-$${Math.abs(v)}`}
          </text>
        ))}

        {/* Max profit / loss labels */}
        <text x={W - pad.right} y={pad.top + 8} textAnchor="end" fontSize={8} fill="hsl(142, 71%, 45%)">
          Max +{fmt$(maxPnl)}
        </text>
        <text x={W - pad.right} y={pad.top + cH - 2} textAnchor="end" fontSize={8} fill="hsl(0, 72%, 51%)">
          Max -{fmt$(Math.abs(minPnl))}
        </text>
      </svg>
    </div>
  );
}

function GreekRow({ label, value, tooltip }: { label: string; value: string; tooltip?: string }) {
  const content = (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium tabular-nums">{value}</span>
    </div>
  );
  if (!tooltip) return content;
  return (
    <Tooltip>
      <TooltipTrigger asChild><div>{content}</div></TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function TradeCard({
  trade,
  isExpanded,
  onToggle,
  watchlist,
  onAddToWatchlist,
  isPremium,
}: {
  trade: StrategyTradeWithEarnings;
  isExpanded: boolean;
  onToggle: () => void;
  watchlist: WatchlistItem[];
  onAddToWatchlist: (ticker: string) => void;
  isPremium: boolean;
}) {
  const [showBacktest, setShowBacktest] = useState(false);
  const [showJournal, setShowJournal] = useState(false);
  const [journalNote, setJournalNote] = useState("");
  const { toast } = useToast();

  const journalMutation = useMutation({
    mutationFn: async (entry: InsertJournalEntry) => {
      const res = await apiRequest("POST", "/api/journal", entry);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Journal entry saved" });
      setJournalNote("");
      setShowJournal(false);
    },
    onError: () => {
      toast({ title: "Failed to save journal entry", variant: "destructive" });
    },
  });

  const strategy = trade.strategyType;
  const colorClass = STRATEGY_COLORS[strategy] || "bg-muted text-muted-foreground";
  const shortLabel = STRATEGY_SHORT[strategy] || strategy;
  const score = trade.compositeScore;
  const isHighScore = score >= 80;
  const isMidScore = score >= 60;

  const handleJournalSave = () => {
    const entry: InsertJournalEntry = {
      ticker: trade.underlyingTicker,
      strategyType: trade.strategyType,
      expirationDate: trade.expirationDate,
      netCredit: trade.netCredit,
      strikePrice: trade.legs.find(l => l.action === "sell")?.strikePrice || 0,
      note: journalNote,
    };
    journalMutation.mutate(entry);
  };

  return (
    <Card
      className={`p-4 cursor-pointer transition-all duration-200 hover:shadow-md trade-card ${
        isHighScore ? "border-chart-2/30" : isMidScore ? "border-chart-1/20" : ""
      }`}
      onClick={onToggle}
      data-testid={`trade-card-${trade.underlyingTicker}-${strategy}`}
    >
      {/* ── Row 1: ticker + badges + score ── */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <WatchlistStar ticker={trade.underlyingTicker} watchlist={watchlist} onAdd={onAddToWatchlist} />
          <span className="text-base font-bold tracking-tight">{trade.underlyingTicker}</span>
          <Badge className={`text-xs ${colorClass}`}>{shortLabel}</Badge>
          {trade.hasEarningsBeforeExpiry && <EarningsBadge trade={trade} />}
          <IVRankBadge trade={trade} />
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-right">
            <div className={`text-lg font-bold tabular-nums leading-none ${
              isHighScore ? "text-chart-2" : isMidScore ? "text-chart-1" : "text-foreground"
            }`}>{score.toFixed(0)}</div>
            <div className="text-xs text-muted-foreground">score</div>
          </div>
          {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      {/* ── Row 2: key metrics ── */}
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div>
          <div className="text-xs text-muted-foreground">Net Credit</div>
          <div className="text-sm font-semibold tabular-nums text-profit">{fmt$(trade.netCredit)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Ann. ROC</div>
          <div className="text-sm font-semibold tabular-nums">{fmtPct(trade.annualizedROC)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">P(Profit)</div>
          <div className="text-sm font-semibold tabular-nums">{fmtPct(trade.probabilityOfProfit)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">DTE</div>
          <div className="text-sm font-semibold tabular-nums">{trade.daysToExpiration}d · {trade.expirationDate}</div>
        </div>
      </div>

      {/* ── Score bar ── */}
      <div className="mt-2">
        <ScoreBar score={score} />
      </div>

      {/* ── Expanded Detail ── */}
      {isExpanded && (
        <div className="mt-4 space-y-4 border-t border-border/50 pt-4">

          {/* Greeks */}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Position Greeks & Risk</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              <GreekRow label="Delta Δ" value={trade.positionDelta.toFixed(3)} tooltip="Net position delta. Negative = short delta (profits if stock falls)" />
              <GreekRow label="Theta Θ" value={`+${fmt$(trade.thetaDecay)}/day`} tooltip="Daily theta decay — premium you collect per day from time decay" />
              <GreekRow label="Vega ν" value={trade.vega.toFixed(3)} tooltip="Sensitivity to IV changes. Negative vega profits when IV decreases" />
              <GreekRow label="Gamma γ" value={trade.gamma.toFixed(4)} tooltip="Rate of delta change. High gamma = higher risk near expiry" />
              <GreekRow label="Delta Z-score" value={`${trade.deltaZScore.toFixed(2)}σ`} tooltip="How elevated current delta is vs 30-day average. Higher = more mean-reversion potential" />
              <GreekRow label="Premium/Day" value={fmt$(trade.premiumPerDay)} tooltip="Net credit divided by DTE — daily premium capture rate" />
            </div>
          </div>

          {/* Break-even prices */}
          {(trade.breakEvenLow || trade.breakEvenHigh) && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2">Break-even Prices</div>
              <div className="flex flex-wrap gap-3">
                {trade.breakEvenLow && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Lower BE:</span>
                    <span className="text-sm font-mono font-medium">{fmt$(trade.breakEvenLow)}</span>
                    <span className="text-xs text-muted-foreground">
                      ({((trade.breakEvenLow / trade.underlyingPrice - 1) * 100).toFixed(1)}%)
                    </span>
                  </div>
                )}
                {trade.breakEvenHigh && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Upper BE:</span>
                    <span className="text-sm font-mono font-medium">{fmt$(trade.breakEvenHigh)}</span>
                    <span className="text-xs text-muted-foreground">
                      (+{((trade.breakEvenHigh / trade.underlyingPrice - 1) * 100).toFixed(1)}%)
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Legs table */}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Option Legs</div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <span className="w-10"></span>
                <span className="w-8 text-center">Type</span>
                <span className="w-16 text-right">Strike</span>
                <span className="w-14 text-right">Mid</span>
                <span className="w-14 text-right">Delta</span>
                <span className="w-14 text-right">IV</span>
              </div>
              {trade.legs.map((leg, i) => <LegRow key={i} leg={leg} />)}
            </div>
          </div>

          {/* Payoff diagram */}
          <PayoffDiagram trade={trade} />

          {/* Underlying info */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            <GreekRow label="Underlying" value={`${fmt$(trade.underlyingPrice)} (${trade.underlyingTicker})`} />
            {trade.spreadWidth != null && (
              <GreekRow label="Spread Width" value={fmt$(trade.spreadWidth)} />
            )}
            <GreekRow label="Max Profit" value={fmt$(trade.netCredit * 100)} tooltip="Max profit per contract = net credit × 100" />
            {trade.maxLoss != null && (
              <GreekRow label="Max Loss" value={fmt$(trade.maxLoss)} tooltip="Max loss per contract" />
            )}
            <GreekRow label="Avg IV" value={fmtPct(trade.avgIV * 100)} />
            <GreekRow label="Volume / OI" value={`${fmtNum(trade.volume)} / ${fmtNum(trade.openInterest)}`} />
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              onClick={(e) => { e.stopPropagation(); setShowBacktest(!showBacktest); }}
              data-testid="button-backtest"
            >
              <LineChart className="w-3.5 h-3.5" />
              {showBacktest ? "Hide Backtest" : "Backtest"}
            </Button>

            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              onClick={(e) => { e.stopPropagation(); setShowJournal(!showJournal); }}
              data-testid="button-journal"
            >
              <BookOpen className="w-3.5 h-3.5" />
              {showJournal ? "Hide Journal" : "Add to Journal"}
            </Button>
          </div>

          {/* Backtest Panel */}
          {showBacktest && (
            <BacktestPanel
              trade={trade}
              onClose={() => setShowBacktest(false)}
            />
          )}

          {/* Journal Panel */}
          {showJournal && (
            <Card className="p-3 mt-3 border-border/50" onClick={(e) => e.stopPropagation()}>
              <div className="text-sm font-medium mb-2 flex items-center gap-1.5">
                <BookOpen className="w-4 h-4" />
                Trade Journal
              </div>
              <textarea
                className="w-full text-sm bg-muted/30 border border-border rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                rows={3}
                placeholder="Note your thesis, risk level, entry reason..."
                value={journalNote}
                onChange={(e) => setJournalNote(e.target.value)}
                data-testid="journal-textarea"
              />
              <div className="flex gap-2 mt-2">
                <Button
                  size="sm"
                  onClick={handleJournalSave}
                  disabled={!journalNote.trim() || journalMutation.isPending}
                  data-testid="button-journal-save"
                >
                  {journalMutation.isPending ? "Saving..." : "Save Entry"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowJournal(false)}>Cancel</Button>
              </div>
            </Card>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Alert Panel ──
function AlertsPanel({ isPremium }: { isPremium: boolean }) {
  const { toast } = useToast();
  const [newTicker, setNewTicker] = useState("");
  const [newThreshold, setNewThreshold] = useState("");
  const [newType, setNewType] = useState<"price_above" | "price_below" | "iv_rank_above">("price_below");

  const alertsQuery = useQuery<Alert[]>({
    queryKey: ["/api/alerts"],
    refetchInterval: 60000,
  });

  const createAlertMutation = useMutation({
    mutationFn: async (alert: { ticker: string; alertType: string; threshold: number }) => {
      const res = await apiRequest("POST", "/api/alerts", alert);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      setNewTicker("");
      setNewThreshold("");
      toast({ title: "Alert created" });
    },
  });

  const deleteAlertMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/alerts/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/alerts"] }),
  });

  const handleCreate = () => {
    const thresh = parseFloat(newThreshold);
    if (!newTicker || isNaN(thresh)) return;
    createAlertMutation.mutate({ ticker: newTicker.toUpperCase(), alertType: newType, threshold: thresh });
  };

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <BellRing className="w-4 h-4 text-primary" />
        <span className="font-semibold text-sm">Price & IV Alerts</span>
        {!isPremium && <Badge variant="outline" className="text-xs gap-1"><Lock className="w-3 h-3" /> Pro</Badge>}
      </div>

      {!isPremium ? (
        <div className="text-sm text-muted-foreground py-4 text-center">
          Upgrade to Pro to set price and IV rank alerts.
        </div>
      ) : (
        <>
          {/* Create alert form */}
          <div className="flex flex-wrap gap-2 mb-4">
            <Input
              placeholder="Ticker"
              className="w-20 h-8 text-sm uppercase"
              value={newTicker}
              onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
              data-testid="alert-ticker-input"
            />
            <select
              className="h-8 text-sm border border-border rounded px-2 bg-background"
              value={newType}
              onChange={(e) => setNewType(e.target.value as any)}
              data-testid="alert-type-select"
            >
              <option value="price_below">Price below</option>
              <option value="price_above">Price above</option>
              <option value="iv_rank_above">IV Rank above</option>
            </select>
            <Input
              placeholder="Threshold"
              type="number"
              className="w-24 h-8 text-sm"
              value={newThreshold}
              onChange={(e) => setNewThreshold(e.target.value)}
              data-testid="alert-threshold-input"
            />
            <Button
              size="sm"
              className="h-8"
              onClick={handleCreate}
              disabled={createAlertMutation.isPending || !newTicker || !newThreshold}
              data-testid="alert-create-button"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add Alert
            </Button>
          </div>

          {/* Alert list */}
          {alertsQuery.isLoading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : !alertsQuery.data?.length ? (
            <div className="text-sm text-muted-foreground py-2">No alerts set.</div>
          ) : (
            <div className="space-y-2">
              {alertsQuery.data.map((alert) => (
                <div key={alert.id} className={`flex items-center justify-between p-2 rounded-lg border ${
                  alert.isTriggered ? "border-chart-3/50 bg-chart-3/5" : "border-border"
                }`}>
                  <div className="flex items-center gap-2">
                    {alert.isTriggered ? (
                      <BellRing className="w-3.5 h-3.5 text-chart-3" />
                    ) : (
                      <Bell className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                    <span className="text-sm font-medium">{alert.ticker}</span>
                    <span className="text-xs text-muted-foreground">
                      {alert.alertType === "price_above" ? "above" : alert.alertType === "price_below" ? "below" : "IV Rank >"} {alert.threshold}
                    </span>
                    {alert.isTriggered && (
                      <Badge variant="default" className="text-xs bg-chart-3">Triggered</Badge>
                    )}
                  </div>
                  <button
                    className="text-muted-foreground hover:text-loss p-0.5"
                    onClick={() => deleteAlertMutation.mutate(alert.id)}
                    data-testid={`alert-delete-${alert.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ── Scan History Panel ──
function ScanHistoryPanel() {
  const scanHistoryQuery = useQuery<ScanRecord[]>({
    queryKey: ["/api/scan-history"],
  });

  if (scanHistoryQuery.isLoading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <History className="w-4 h-4" />
          <span className="font-semibold text-sm">Scan History</span>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}
        </div>
      </Card>
    );
  }

  const records = scanHistoryQuery.data || [];

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <History className="w-4 h-4" />
        <span className="font-semibold text-sm">Scan History</span>
        <Badge variant="secondary" className="text-xs">{records.length}</Badge>
      </div>
      {records.length === 0 ? (
        <div className="text-sm text-muted-foreground py-2">No scan history yet. Run your first scan above.</div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {records.map((record) => (
            <div key={record.id} className="flex items-center justify-between p-2 rounded-lg border border-border hover:bg-muted/30">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  record.status === "complete" ? "bg-profit" :
                  record.status === "running" ? "bg-chart-3 animate-pulse" : "bg-loss"
                }`} />
                <div>
                  <div className="text-sm font-medium">{record.tickers.slice(0, 3).join(", ")}{record.tickers.length > 3 ? ` +${record.tickers.length - 3}` : ""}</div>
                  <div className="text-xs text-muted-foreground">{timeAgo(record.createdAt)} · {record.resultCount} results</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {record.durationMs && (
                  <span className="text-xs text-muted-foreground">{formatDuration(record.durationMs)}</span>
                )}
                <Badge variant={record.status === "complete" ? "default" : record.status === "running" ? "secondary" : "destructive"} className="text-xs">
                  {record.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Journal Viewer ──
function JournalViewer({ isPremium }: { isPremium: boolean }) {
  const journalQuery = useQuery({
    queryKey: ["/api/journal"],
    enabled: isPremium,
  });

  if (!isPremium) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <BookOpen className="w-4 h-4" />
          <span className="font-semibold text-sm">Trade Journal</span>
          <Badge variant="outline" className="text-xs gap-1"><Lock className="w-3 h-3" /> Pro</Badge>
        </div>
        <div className="text-sm text-muted-foreground">Upgrade to Pro to keep a trade journal with notes and history.</div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <BookOpen className="w-4 h-4" />
        <span className="font-semibold text-sm">Trade Journal</span>
      </div>
      {journalQuery.isLoading ? (
        <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-16" />)}</div>
      ) : !journalQuery.data?.length ? (
        <div className="text-sm text-muted-foreground py-2">No journal entries yet. Use the "Add to Journal" button on any trade card.</div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {journalQuery.data.map((entry: any) => (
            <div key={entry.id} className="p-3 rounded-lg border border-border hover:bg-muted/30">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{entry.ticker}</span>
                  <Badge variant="secondary" className="text-xs">{STRATEGY_SHORT[entry.strategyType] || entry.strategyType}</Badge>
                </div>
                <span className="text-xs text-muted-foreground">{timeAgo(entry.createdAt)}</span>
              </div>
              <div className="text-xs text-muted-foreground mb-1">
                {entry.expirationDate} · Credit: {fmt$(entry.netCredit)}
              </div>
              {entry.note && <div className="text-sm">{entry.note}</div>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Watchlist Panel ──
function WatchlistPanel({ isPremium }: { isPremium: boolean }) {
  const { toast } = useToast();
  const [newTicker, setNewTicker] = useState("");

  const watchlistQuery = useQuery<WatchlistItem[]>({
    queryKey: ["/api/watchlist"],
  });

  const addMutation = useMutation({
    mutationFn: async (ticker: string) => {
      const res = await apiRequest("POST", "/api/watchlist", { ticker });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
      setNewTicker("");
      toast({ title: `Added to watchlist` });
    },
    onError: () => toast({ title: "Already on watchlist", variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/watchlist/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] }),
  });

  const items = watchlistQuery.data || [];
  const maxItems = isPremium ? Infinity : 5;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Star className="w-4 h-4 text-yellow-500" />
        <span className="font-semibold text-sm">Watchlist</span>
        <Badge variant="secondary" className="text-xs">{items.length}{!isPremium && "/5"}</Badge>
        {!isPremium && <Badge variant="outline" className="text-xs gap-1 ml-auto"><Lock className="w-3 h-3" /> Pro = unlimited</Badge>}
      </div>

      {/* Add form */}
      <div className="flex gap-2 mb-3">
        <Input
          placeholder="AAPL, TSLA..."
          className="h-8 text-sm uppercase"
          value={newTicker}
          onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === "Enter" && newTicker) addMutation.mutate(newTicker); }}
          data-testid="watchlist-ticker-input"
        />
        <Button
          size="sm"
          className="h-8"
          onClick={() => newTicker && addMutation.mutate(newTicker)}
          disabled={addMutation.isPending || !newTicker || items.length >= maxItems}
          data-testid="watchlist-add-button"
        >
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>

      {watchlistQuery.isLoading ? (
        <div className="space-y-1">{[1, 2, 3].map(i => <Skeleton key={i} className="h-8" />)}</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-muted-foreground">No tickers yet. Add some above.</div>
      ) : (
        <div className="space-y-1">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50">
              <div className="flex items-center gap-2">
                <Star className="w-3.5 h-3.5 text-yellow-500 fill-current" />
                <span className="text-sm font-medium">{item.ticker}</span>
              </div>
              <button
                className="text-muted-foreground hover:text-loss p-0.5"
                onClick={() => removeMutation.mutate(item.id)}
                data-testid={`watchlist-remove-${item.ticker}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Performance Dashboard ──
function PerformanceDashboard({ isPremium }: { isPremium: boolean }) {
  const statsQuery = useQuery({
    queryKey: ["/api/performance/stats"],
    enabled: isPremium,
  });

  if (!isPremium) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Trophy className="w-4 h-4" />
          <span className="font-semibold text-sm">Performance</span>
          <Badge variant="outline" className="text-xs gap-1"><Lock className="w-3 h-3" /> Pro</Badge>
        </div>
        <div className="text-sm text-muted-foreground">Upgrade to Pro to track your strategy performance and analytics.</div>
      </Card>
    );
  }

  if (statsQuery.isLoading) {
    return (
      <Card className="p-4">
        <Skeleton className="h-4 w-32 mb-3" />
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}
        </div>
      </Card>
    );
  }

  const stats = statsQuery.data as any;
  if (!stats) return null;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="w-4 h-4 text-chart-4" />
        <span className="font-semibold text-sm">Strategy Performance</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {Object.entries(stats).map(([strategy, data]: [string, any]) => (
          <div key={strategy} className="bg-muted/50 rounded-lg p-2.5">
            <div className="text-xs font-medium mb-1">{STRATEGY_SHORT[strategy] || strategy}</div>
            <div className={`text-base font-bold tabular-nums ${data.winRate >= 0.7 ? "text-profit" : "text-foreground"}`}>
              {(data.winRate * 100).toFixed(0)}% WR
            </div>
            <div className="text-xs text-muted-foreground">{data.totalTrades} trades</div>
            <div className={`text-xs font-medium ${data.totalPnL >= 0 ? "text-profit" : "text-loss"}`}>
              {data.totalPnL >= 0 ? "+" : ""}{fmt$(data.totalPnL)}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Scan Settings Panel ──
function ScanSettingsPanel({
  minScore,
  setMinScore,
  minAnnROC,
  setMinAnnROC,
  minPOP,
  setMinPOP,
  minDTE,
  setMinDTE,
  maxDTE,
  setMaxDTE,
  filterEarnings,
  setFilterEarnings,
  showSettings,
  setShowSettings,
}: {
  minScore: number;
  setMinScore: (v: number) => void;
  minAnnROC: number;
  setMinAnnROC: (v: number) => void;
  minPOP: number;
  setMinPOP: (v: number) => void;
  minDTE: number;
  setMinDTE: (v: number) => void;
  maxDTE: number;
  setMaxDTE: (v: number) => void;
  filterEarnings: boolean;
  setFilterEarnings: (v: boolean) => void;
  showSettings: boolean;
  setShowSettings: (v: boolean) => void;
}) {
  if (!showSettings) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5"
        onClick={() => setShowSettings(true)}
        data-testid="button-show-settings"
      >
        <Settings2 className="w-3.5 h-3.5" />
        Filters
      </Button>
    );
  }

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4" />
          <span className="font-semibold text-sm">Scan Filters</span>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setShowSettings(false)} data-testid="button-hide-settings">
          <X className="w-4 h-4" />
        </Button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Min Score</Label>
          <Input type="number" className="h-8 text-sm mt-1" value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} data-testid="filter-min-score" />
        </div>
        <div>
          <Label className="text-xs">Min Ann. ROC %</Label>
          <Input type="number" className="h-8 text-sm mt-1" value={minAnnROC} onChange={(e) => setMinAnnROC(Number(e.target.value))} data-testid="filter-min-roc" />
        </div>
        <div>
          <Label className="text-xs">Min P(Profit) %</Label>
          <Input type="number" className="h-8 text-sm mt-1" value={minPOP} onChange={(e) => setMinPOP(Number(e.target.value))} data-testid="filter-min-pop" />
        </div>
        <div>
          <Label className="text-xs">Min DTE</Label>
          <Input type="number" className="h-8 text-sm mt-1" value={minDTE} onChange={(e) => setMinDTE(Number(e.target.value))} data-testid="filter-min-dte" />
        </div>
        <div>
          <Label className="text-xs">Max DTE</Label>
          <Input type="number" className="h-8 text-sm mt-1" value={maxDTE} onChange={(e) => setMaxDTE(Number(e.target.value))} data-testid="filter-max-dte" />
        </div>
        <div className="flex items-end pb-1">
          <div className="flex items-center gap-2">
            <Switch
              id="filter-earnings"
              checked={filterEarnings}
              onCheckedChange={setFilterEarnings}
              data-testid="filter-earnings-toggle"
            />
            <Label htmlFor="filter-earnings" className="text-xs">Hide earnings risk</Label>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const [tickerInput, setTickerInput] = useState("SPY,QQQ,AAPL,TSLA,NVDA,AMD,MSFT,AMZN,META,GOOGL");
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [sortField, setSortField] = useState<SortField>("compositeScore");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showRawJson, setShowRawJson] = useState(false);
  const [minScore, setMinScore] = useState(0);
  const [minAnnROC, setMinAnnROC] = useState(0);
  const [minPOP, setMinPOP] = useState(0);
  const [minDTE, setMinDTE] = useState(0);
  const [maxDTE, setMaxDTE] = useState(365);
  const [filterEarnings, setFilterEarnings] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const { user } = useAuth();
  const isPremium = user?.isPremium ?? false;
  const { toast } = useToast();

  const statusQuery = useQuery<ScanStatus>({
    queryKey: ["/api/scan/status"],
    refetchInterval: (query) => {
      const data = query.state.data as ScanStatus | undefined;
      return data?.isScanning ? 1500 : 15000;
    },
  });

  const tradesQuery = useQuery<StrategyTradeWithEarnings[]>({
    queryKey: ["/api/trades"],
    refetchInterval: (query) => {
      const statusData = queryClient.getQueryData<ScanStatus>(["/api/scan/status"]);
      return statusData?.isScanning ? 2000 : 30000;
    },
  });

  const watchlistQuery = useQuery<WatchlistItem[]>({
    queryKey: ["/api/watchlist"],
  });

  const scanMutation = useMutation({
    mutationFn: async (tickers: string[]) => {
      const res = await apiRequest("POST", "/api/scan", { tickers });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scan/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trades"] });
    },
  });

  const addToWatchlistMutation = useMutation({
    mutationFn: async (ticker: string) => {
      const res = await apiRequest("POST", "/api/watchlist", { ticker });
      return res.json();
    },
    onSuccess: (_, ticker) => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
      toast({ title: `${ticker} added to watchlist` });
    },
    onError: () => toast({ title: "Already on watchlist", variant: "destructive" }),
  });

  const handleScan = () => {
    const tickers = tickerInput
      .split(/[,\s]+/)
      .map(t => t.trim().toUpperCase())
      .filter(Boolean);
    if (tickers.length === 0) return;
    scanMutation.mutate(tickers);
  };

  const status = statusQuery.data;
  const isScanning = status?.isScanning ?? false;

  // Filter and sort trades
  const allTrades = tradesQuery.data || [];
  const filteredTrades = allTrades
    .filter(t => activeFilter === "all" || t.strategyType === activeFilter)
    .filter(t => t.compositeScore >= minScore)
    .filter(t => t.annualizedROC >= minAnnROC)
    .filter(t => t.probabilityOfProfit >= minPOP)
    .filter(t => t.daysToExpiration >= minDTE && t.daysToExpiration <= maxDTE)
    .filter(t => !filterEarnings || !t.hasEarningsBeforeExpiry)
    .sort((a, b) => (b[sortField] as number) - (a[sortField] as number));

  // Strategy counts for filter tabs
  const strategyCounts = allTrades.reduce((acc, t) => {
    acc[t.strategyType] = (acc[t.strategyType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Top Nav ── */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <span className="font-bold text-sm tracking-tight">PremiumScreener</span>
          </div>
          <div className="flex items-center gap-1">
            <Link href="/screener">
              <Button size="sm" variant="ghost" className="text-xs">Screener</Button>
            </Link>
            <Link href="/analytics">
              <Button size="sm" variant="ghost" className="text-xs">Analytics</Button>
            </Link>
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* ── Upgrade Banner ── */}
        <UpgradeBanner />

        {/* ── Scanner Input ── */}
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-0">
              <Input
                placeholder="Enter tickers: SPY, QQQ, AAPL..."
                value={tickerInput}
                onChange={(e) => setTickerInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleScan()}
                className="font-mono text-sm"
                data-testid="ticker-input"
              />
            </div>
            <Button
              onClick={handleScan}
              disabled={isScanning || scanMutation.isPending}
              className="gap-2"
              data-testid="button-scan"
            >
              {isScanning ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Scanning...</>
              ) : (
                <><Zap className="w-4 h-4" /> Scan</>  
              )}
            </Button>
            <FreshnessIndicator lastUpdated={status?.lastUpdated ?? null} isScanning={isScanning} />
            <ScanSettingsPanel
              minScore={minScore} setMinScore={setMinScore}
              minAnnROC={minAnnROC} setMinAnnROC={setMinAnnROC}
              minPOP={minPOP} setMinPOP={setMinPOP}
              minDTE={minDTE} setMinDTE={setMinDTE}
              maxDTE={maxDTE} setMaxDTE={setMaxDTE}
              filterEarnings={filterEarnings} setFilterEarnings={setFilterEarnings}
              showSettings={showSettings} setShowSettings={setShowSettings}
            />
          </div>
        </Card>

        {/* ── Strategy Tabs + Sort ── */}
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={activeFilter} onValueChange={(v) => setActiveFilter(v as FilterType)}>
            <TabsList className="h-8">
              {(["all", "cash_secured_put", "put_credit_spread", "call_credit_spread", "strangle", "iron_condor"] as FilterType[]).map(f => (
                <TabsTrigger key={f} value={f} className="text-xs px-2.5 py-1" data-testid={`tab-filter-${f}`}>
                  {f === "all" ? "All" : STRATEGY_SHORT[f]}
                  {f !== "all" && strategyCounts[f] ? (
                    <Badge variant="secondary" className="ml-1 text-xs px-1">{strategyCounts[f]}</Badge>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-1.5 ml-auto">
            <ArrowDownUp className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              className="text-xs border border-border rounded px-2 py-1 bg-background h-8"
              value={sortField}
              onChange={(e) => setSortField(e.target.value as SortField)}
              data-testid="sort-select"
            >
              <option value="compositeScore">Score</option>
              <option value="annualizedROC">Ann. ROC</option>
              <option value="deltaZScore">Delta Z</option>
              <option value="probabilityOfProfit">P(Profit)</option>
              <option value="premiumPerDay">Premium/Day</option>
              <option value="netCredit">Net Credit</option>
              <option value="ivRank">IV Rank</option>
            </select>
          </div>
        </div>

        {/* ── Main Content Grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Trade Cards */}
          <div className="lg:col-span-2 space-y-3">
            {tradesQuery.isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <Card key={i} className="p-4">
                    <div className="flex justify-between mb-3">
                      <Skeleton className="h-6 w-24" />
                      <Skeleton className="h-6 w-12" />
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {[1, 2, 3, 4].map(j => <Skeleton key={j} className="h-10" />)}
                    </div>
                  </Card>
                ))}
              </div>
            ) : filteredTrades.length === 0 ? (
              <Card className="p-8 text-center">
                <Target className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
                <div className="text-sm font-medium">
                  {allTrades.length === 0 ? "No trades yet — run a scan to get started" : "No trades match your filters"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {allTrades.length === 0
                    ? "Enter some tickers above and click Scan"
                    : "Try relaxing your score or filter thresholds"}
                </div>
              </Card>
            ) : (
              filteredTrades.map(trade => (
                <TradeCard
                  key={trade.id}
                  trade={trade}
                  isExpanded={expandedId === trade.id}
                  onToggle={() => setExpandedId(expandedId === trade.id ? null : trade.id)}
                  watchlist={watchlistQuery.data || []}
                  onAddToWatchlist={(ticker) => addToWatchlistMutation.mutate(ticker)}
                  isPremium={isPremium}
                />
              ))
            )}
          </div>

          {/* Right: Side Panels */}
          <div className="space-y-4">
            <WatchlistPanel isPremium={isPremium} />
            <AlertsPanel isPremium={isPremium} />
            <PerformanceDashboard isPremium={isPremium} />
            <ScanHistoryPanel />
            <JournalViewer isPremium={isPremium} />

            {/* Dev: Raw JSON toggle */}
            {process.env.NODE_ENV === "development" && (
              <Card className="p-3">
                <button
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  onClick={() => setShowRawJson(!showRawJson)}
                >
                  <Eye className="w-3 h-3" />
                  {showRawJson ? "Hide" : "Show"} raw trades JSON
                </button>
                {showRawJson && (
                  <pre className="mt-2 text-xs overflow-auto max-h-64 bg-muted/50 rounded p-2">
                    {JSON.stringify(allTrades, null, 2)}
                  </pre>
                )}
              </Card>
            )}
          </div>
        </div>

        {/* ── Scan Progress Indicator ── */}
        {isScanning && status && (
          <Card className="p-4">
            <div className="flex items-center gap-3 mb-2">
              <RefreshCw className="w-4 h-4 animate-spin text-chart-3" />
              <span className="text-sm font-medium">Scanning {status.totalTickers} tickers...</span>
              <span className="text-xs text-muted-foreground ml-auto">
                {status.processedTickers} / {status.totalTickers} processed
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-chart-3 transition-all duration-500"
                style={{ width: `${status.totalTickers > 0 ? (status.processedTickers / status.totalTickers) * 100 : 0}%` }}
              />
            </div>
          </Card>
        )}

      </main>
    </div>
  );
}
