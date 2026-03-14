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
            <text x={toX(emLo)} y={pad.top - 3} textAnchor="middle" fontSize={8} fill="hsl(217, 91%, 60%)">
              EM {fmt$(emLo)}
            </text>
          </>
        )}
        {emHi < hi && (
          <>
            <line x1={toX(emHi)} y1={pad.top} x2={toX(emHi)} y2={pad.top + cH} stroke="hsl(217, 91%, 60%)" strokeWidth={0.5} strokeDasharray="2 2" />
            <text x={toX(emHi)} y={pad.top - 3} textAnchor="middle" fontSize={8} fill="hsl(217, 91%, 60%)">
              EM {fmt$(emHi)}
            </text>
          </>
        )}

        {/* Break-even markers */}
        {breakEvens.map((be, i) => be > lo && be < hi && (
          <g key={i}>
            <line x1={toX(be)} y1={zeroY - 4} x2={toX(be)} y2={zeroY + 4} stroke="hsl(43, 74%, 49%)" strokeWidth={2} />
            <text x={toX(be)} y={pad.top + cH + 22} textAnchor="middle" fontSize={8} fill="hsl(43, 74%, 49%)">
              BE {fmt$(be)}
            </text>
          </g>
        ))}

        {/* Strike markers */}
        {legs.filter(l => l.action === "sell").map((leg, i) => leg.strikePrice > lo && leg.strikePrice < hi && (
          <g key={`s${i}`}>
            <line x1={toX(leg.strikePrice)} y1={pad.top + cH - 2} x2={toX(leg.strikePrice)} y2={pad.top + cH + 3} stroke="hsl(142, 71%, 45%)" strokeWidth={1.5} />
          </g>
        ))}
        {legs.filter(l => l.action === "buy").map((leg, i) => leg.strikePrice > lo && leg.strikePrice < hi && (
          <g key={`b${i}`}>
            <line x1={toX(leg.strikePrice)} y1={pad.top + cH - 2} x2={toX(leg.strikePrice)} y2={pad.top + cH + 3} stroke="hsl(0, 72%, 51%)" strokeWidth={1.5} />
          </g>
        ))}

        {/* Y axis labels */}
        {yTicks.map((v) => (
          <text key={v} x={pad.left - 4} y={toY(v) + 3} textAnchor="end" fontSize={9} fill="hsl(var(--muted-foreground))">
            {v >= 0 ? "+" : ""}{v < 1000 && v > -1000 ? `$${v}` : `$${(v / 1000).toFixed(1)}k`}
          </text>
        ))}

        {/* Max profit / max loss labels */}
        <text x={W - pad.right} y={toY(maxPnl) - 4} textAnchor="end" fontSize={8} fill="hsl(142, 71%, 45%)" fontWeight={600}>
          Max +{fmt$(maxPnl)}
        </text>
        {minPnl < 0 && minPnl > -100000 && (
          <text x={W - pad.right} y={toY(minPnl) + 12} textAnchor="end" fontSize={8} fill="hsl(0, 72%, 51%)" fontWeight={600}>
            Max {fmt$(minPnl)}
          </text>
        )}
      </svg>
      {/* Legend */}
      <div className="flex items-center gap-4 mt-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm" style={{ background: "hsl(217, 91%, 60%)", opacity: 0.3 }} />
          Expected Move (±1σ)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm" style={{ background: "hsl(43, 74%, 49%)" }} />
          Break-even
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-0.5" style={{ background: "hsl(var(--muted-foreground))" }} />
          Current Price
        </span>
      </div>
    </div>
  );
}

function TradeCard({ trade, rank, expanded, onToggle, watchlist, onWatchlistAdd, isPinned, loggedTradeIds, onLogTrade }: {
  trade: StrategyTradeWithEarnings; rank: number; expanded: boolean; onToggle: () => void;
  watchlist: WatchlistItem[]; onWatchlistAdd: (ticker: string) => void; isPinned: boolean;
  loggedTradeIds: string[]; onLogTrade: (trade: StrategyTradeWithEarnings) => void;
}) {
  const isUndefined = trade.maxLoss === -999999;
  const isRedacted = (trade as any).redacted === true;
  const [showBacktest, setShowBacktest] = useState(false);
  const [showPayoff, setShowPayoff] = useState(false);
  const isLogged = loggedTradeIds.includes(trade.id);
  const premiumLabel = <span className="text-yellow-500 font-semibold text-xs">Premium</span>;

  return (
    <Card className={`p-4 hover-elevate ${isPinned ? "ring-1 ring-yellow-500/30 bg-yellow-500/[0.02]" : ""}`} data-testid={`card-trade-${rank}`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold tabular-nums shrink-0">
            {rank}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <WatchlistStar ticker={trade.underlyingTicker} watchlist={watchlist} onAdd={onWatchlistAdd} />
              <span className="font-semibold text-sm" data-testid={`text-ticker-${rank}`}>
                {trade.underlyingTicker}
              </span>
              <Badge className={`text-xs ${STRATEGY_COLORS[trade.strategyType]}`}>
                {STRATEGY_SHORT[trade.strategyType]}
              </Badge>
              <DeltaZBadge z={trade.deltaZScore} />
              <IVRankBadge trade={trade} />
              <EarningsBadge trade={trade} />
              {isPinned && (
                <Badge variant="outline" className="text-xs border-yellow-500/40 text-yellow-600 dark:text-yellow-400">
                  Watchlist
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {fmt$(trade.underlyingPrice)} · {isRedacted ? <>Exp {premiumLabel}</> : <>Exp {trade.expirationDate}</>} · {trade.daysToExpiration}d
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-semibold tabular-nums">{trade.compositeScore.toFixed(1)}</div>
          <div className="text-xs text-muted-foreground">Score</div>
        </div>
      </div>

      <ScoreBar score={trade.compositeScore} />

      {/* Key metrics row */}
      <div className="grid grid-cols-5 gap-2 mt-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-0.5">Credit</div>
              <div className="text-sm font-medium tabular-nums">{isRedacted ? premiumLabel : fmt$(trade.netCredit)}</div>
            </div>
          </TooltipTrigger>
          <TooltipContent>Net credit received per contract ({fmt$(trade.maxProfit)} total)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-0.5">Ann. ROC</div>
              <div className="text-sm font-medium tabular-nums text-profit">{fmtPct(trade.annualizedROC)}</div>
            </div>
          </TooltipTrigger>
          <TooltipContent>Annualized return on capital at risk</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-0.5">POP</div>
              <div className="text-sm font-medium tabular-nums">{fmtPct(trade.probabilityOfProfit * 100)}</div>
            </div>
          </TooltipTrigger>
          <TooltipContent>Probability of profit</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-0.5">Max Loss</div>
              <div className="text-sm font-medium tabular-nums text-loss">
                {isRedacted ? premiumLabel : isUndefined ? "Undef." : fmt$(Math.abs(trade.maxLoss))}
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent>{isUndefined ? "Undefined risk — requires margin" : `Max loss per contract: ${fmt$(Math.abs(trade.maxLoss))}`}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-0.5">$/Day</div>
              <div className="text-sm font-medium tabular-nums">{isRedacted ? premiumLabel : fmt$(trade.premiumPerDay)}</div>
            </div>
          </TooltipTrigger>
          <TooltipContent>Premium earned per day per contract</TooltipContent>
        </Tooltip>
      </div>

      {/* Expandable legs section + backtest button */}
      <div className="flex items-center mt-3 pt-2 border-t border-border">
        {isRedacted ? (
          <div className="flex items-center gap-1.5 text-xs text-yellow-500 flex-1">
            <Lock className="w-3.5 h-3.5" />
            <span>Upgrade to view strikes, legs, P&L & backtest</span>
          </div>
        ) : (
        <button
          className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer flex-1"
          onClick={onToggle}
          data-testid={`button-expand-${rank}`}
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <span>{trade.legs.length} leg{trade.legs.length > 1 ? "s" : ""}</span>
          <span className="ml-auto flex items-center gap-3">
            <span>Δ {trade.netDelta.toFixed(3)}</span>
            <span>Θ {trade.netTheta.toFixed(3)}</span>
            <span>IV {fmtPct(trade.avgIV * 100)}</span>
            {trade.ivRank != null && <span>IVR {Math.round(trade.ivRank)}%</span>}
            <span>OI {fmtNum(trade.minOpenInterest)}</span>
          </span>
        </button>
        )}
        {!isRedacted && (
        <>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={`ml-2 flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                showPayoff
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
              }`}
              onClick={(e) => { e.stopPropagation(); setShowPayoff(!showPayoff); if (!showPayoff) setShowBacktest(false); }}
              data-testid={`button-payoff-${rank}`}
            >
              <Crosshair className="w-3 h-3" />
              <span className="hidden sm:inline">P&L</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>Show P&L payoff diagram with expected move</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={`ml-1.5 flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                showBacktest
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
              }`}
              onClick={(e) => { e.stopPropagation(); setShowBacktest(!showBacktest); if (!showBacktest) setShowPayoff(false); }}
              data-testid={`button-backtest-${rank}`}
            >
              <LineChart className="w-3 h-3" />
              <span className="hidden sm:inline">Backtest</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>Simulate this trade over 6 months of price history</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={`ml-1.5 flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                isLogged
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 cursor-default"
                  : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
              }`}
              onClick={(e) => { e.stopPropagation(); if (!isLogged) onLogTrade(trade); }}
              disabled={isLogged}
              data-testid={`button-log-trade-${rank}`}
            >
              {isLogged ? <CheckCircle2 className="w-3 h-3" /> : <BookOpen className="w-3 h-3" />}
              <span className="hidden sm:inline">{isLogged ? "Logged" : "Log"}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>{isLogged ? "Trade already in your journal" : "Log this trade to your journal"}</TooltipContent>
        </Tooltip>
        </>
        )}
      </div>

      {expanded && !isRedacted && (
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium px-0.5">
            <span className="w-10 text-center">Side</span>
            <span className="w-8 text-center">Type</span>
            <span className="w-16 text-right">Strike</span>
            <span className="w-14 text-right">Mid</span>
            <span className="w-14 text-right">Delta</span>
            <span className="w-14 text-right">IV</span>
          </div>
          {trade.legs.map((leg, i) => <LegRow key={i} leg={leg} />)}

          <div className="flex items-center gap-4 text-xs pt-2 border-t border-border text-muted-foreground">
            {trade.breakEvenLow && <span>BE Low: {fmt$(trade.breakEvenLow)}</span>}
            {trade.breakEvenHigh && <span>BE High: {fmt$(trade.breakEvenHigh)}</span>}
            {trade.spreadWidth && <span>Width: ${trade.spreadWidth}</span>}
            {trade.riskRewardRatio > 0 && <span>R:R {trade.riskRewardRatio.toFixed(2)}</span>}
          </div>
        </div>
      )}

      {/* Payoff diagram panel */}
      {showPayoff && !isRedacted && (
        <PayoffDiagram trade={trade} />
      )}

      {/* Backtest panel */}
      {showBacktest && !isRedacted && (
        <BacktestPanel trade={trade} onClose={() => setShowBacktest(false)} />
      )}
    </Card>
  );
}

function KPICard({ icon: Icon, label, value, sub, color }: {
  icon: typeof DollarSign; label: string; value: string; sub?: string; color?: string;
}) {
  const isPremiumLabel = value === "Premium";
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className={`w-3.5 h-3.5 ${color || "text-muted-foreground"}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className={`text-lg font-semibold tabular-nums ${isPremiumLabel ? "text-yellow-500 flex items-center gap-1.5" : ""}`}>
        {isPremiumLabel && <Lock className="w-3.5 h-3.5" />}
        {value}
      </div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <Card key={i} className="p-4">
          <div className="flex items-start gap-3 mb-3">
            <Skeleton className="w-7 h-7 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="h-6 w-12" />
          </div>
          <Skeleton className="h-1.5 w-full rounded-full" />
          <div className="grid grid-cols-5 gap-2 mt-3">
            {[1, 2, 3, 4, 5].map((j) => (
              <div key={j} className="text-center space-y-1">
                <Skeleton className="h-3 w-10 mx-auto" />
                <Skeleton className="h-4 w-14 mx-auto" />
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function ScanHistoryPanel({ history, onClose }: { history: ScanRecord[]; onClose: () => void }) {
  return (
    <Card className="p-4" data-testid="panel-scan-history">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Scan History</h3>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose} className="text-xs h-7 px-2" data-testid="button-close-history">
          Close
        </Button>
      </div>

      {history.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">No scan history yet</p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {history.map((scan) => (
            <div
              key={scan.id}
              className="flex items-center gap-3 p-2.5 rounded-md border border-border text-xs"
            >
              <div className="shrink-0">
                {scan.status === "complete" ? (
                  <CheckCircle2 className="w-4 h-4 text-profit" />
                ) : (
                  <XCircle className="w-4 h-4 text-loss" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-medium">
                    Scan #{scan.id}
                  </span>
                  <Badge variant="outline" className="text-xs h-4 px-1">
                    {scan.mode}
                  </Badge>
                </div>
                <div className="text-muted-foreground truncate">
                  {new Date(scan.scanDate).toLocaleString()} · {formatDuration(scan.durationMs)}
                </div>
              </div>
              <div className="text-right shrink-0 tabular-nums">
                <div className="font-medium">{scan.totalTrades}</div>
                <div className="text-muted-foreground">trades</div>
              </div>
              <div className="hidden sm:grid grid-cols-4 gap-2 text-center shrink-0">
                <div>
                  <div className="font-medium">{scan.cspCount}</div>
                  <div className="text-muted-foreground">CSP</div>
                </div>
                <div>
                  <div className="font-medium">{scan.pcsCount}</div>
                  <div className="text-muted-foreground">PCS</div>
                </div>
                <div>
                  <div className="font-medium">{scan.strangleCount}</div>
                  <div className="text-muted-foreground">STR</div>
                </div>
                <div>
                  <div className="font-medium">{scan.icCount}</div>
                  <div className="text-muted-foreground">IC</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Notification Bell ──
function NotificationBell({ alerts, unseenCount, onMarkSeen }: {
  alerts: Alert[];
  unseenCount: number;
  onMarkSeen: () => void;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/alerts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
    },
  });

  const handleOpen = () => {
    setOpen(!open);
    if (!open && unseenCount > 0) {
      onMarkSeen();
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <Button
        size="icon"
        variant="ghost"
        onClick={handleOpen}
        className="relative"
        data-testid="button-notifications"
      >
        {unseenCount > 0 ? (
          <BellRing className="w-4 h-4 text-yellow-500" />
        ) : (
          <Bell className="w-4 h-4" />
        )}
        {unseenCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold px-1 tabular-nums" data-testid="badge-unseen-count">
            {unseenCount > 99 ? "99+" : unseenCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 z-50 rounded-lg border border-border bg-card shadow-lg overflow-hidden" data-testid="panel-alerts">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-accent/30">
            <div className="flex items-center gap-2">
              <BellRing className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold">Alerts</span>
              {alerts.length > 0 && (
                <Badge variant="secondary" className="text-xs h-4 px-1.5">{alerts.length}</Badge>
              )}
            </div>
            <Button size="sm" variant="ghost" className="text-xs h-6 px-2" onClick={() => setOpen(false)}>
              <X className="w-3 h-3" />
            </Button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="py-8 text-center">
                <Bell className="w-6 h-6 text-muted-foreground mx-auto mb-2 opacity-40" />
                <p className="text-xs text-muted-foreground">No alerts yet</p>
                <p className="text-xs text-muted-foreground mt-1">Set a score threshold on watchlist tickers</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`px-3 py-2.5 text-xs ${!alert.seen ? "bg-primary/5" : ""}`}
                    data-testid={`alert-item-${alert.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="font-semibold">{alert.ticker}</span>
                          <Badge className={`text-[10px] h-4 px-1 ${STRATEGY_COLORS[alert.strategyType] || "bg-muted"}`}>
                            {STRATEGY_SHORT[alert.strategyType] || alert.strategyType}
                          </Badge>
                          <span className="font-medium tabular-nums text-profit">
                            Score {alert.compositeScore.toFixed(1)}
                          </span>
                          {!alert.seen && (
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-muted-foreground tabular-nums">
                          <span>{fmt$(alert.netCredit)} cr</span>
                          <span>{fmtPct(alert.annualizedROC)} ROC</span>
                          <span>{fmtPct(alert.probabilityOfProfit * 100)} POP</span>
                        </div>
                        <div className="text-muted-foreground mt-0.5">
                          Exp {alert.expirationDate} · {alert.daysToExpiration}d · Threshold ≥{alert.threshold.toFixed(0)}
                        </div>
                        <div className="text-muted-foreground mt-0.5">{timeAgo(alert.triggeredAt)}</div>
                      </div>
                      <button
                        className="text-muted-foreground hover:text-loss transition-colors p-1 shrink-0"
                        onClick={() => deleteMutation.mutate(alert.id)}
                        data-testid={`alert-delete-${alert.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Watchlist Panel ──
function WatchlistPanel({ onClose }: { onClose: () => void }) {
  const [newTicker, setNewTicker] = useState("");
  const [newThreshold, setNewThreshold] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editThreshold, setEditThreshold] = useState("");

  const { data: watchlistData } = useQuery<{ watchlist: WatchlistItem[] }>({
    queryKey: ["/api/watchlist"],
    refetchInterval: 10000,
  });

  const watchlist = watchlistData?.watchlist || [];

  const addMutation = useMutation({
    mutationFn: async (data: { ticker: string; scoreThreshold: number | null }) => {
      await apiRequest("POST", "/api/watchlist", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
      setNewTicker("");
      setNewThreshold("");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, scoreThreshold }: { id: number; scoreThreshold: number | null }) => {
      await apiRequest("PATCH", `/api/watchlist/${id}`, { scoreThreshold });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
      setEditingId(null);
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/watchlist/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
    },
  });

  const handleAdd = () => {
    const ticker = newTicker.trim().toUpperCase();
    if (!ticker) return;
    const threshold = newThreshold ? parseFloat(newThreshold) : null;
    addMutation.mutate({ ticker, scoreThreshold: threshold });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleAdd();
  };

  const handleSaveThreshold = (id: number) => {
    const threshold = editThreshold ? parseFloat(editThreshold) : null;
    updateMutation.mutate({ id, scoreThreshold: threshold });
  };

  return (
    <Card className="p-4" data-testid="panel-watchlist">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-yellow-500" />
          <h3 className="text-sm font-semibold">Watchlist</h3>
          {watchlist.length > 0 && (
            <Badge variant="secondary" className="text-xs h-4 px-1.5">{watchlist.length}</Badge>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={onClose} className="text-xs h-7 px-2" data-testid="button-close-watchlist">
          Close
        </Button>
      </div>

      {/* Add ticker form */}
      <div className="flex items-center gap-2 mb-3">
        <Input
          placeholder="Ticker (e.g. AAPL)"
          value={newTicker}
          onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
          onKeyDown={handleKeyDown}
          className="h-8 text-xs flex-1"
          maxLength={10}
          data-testid="input-watchlist-ticker"
        />
        <Input
          placeholder="Score ≥"
          value={newThreshold}
          onChange={(e) => setNewThreshold(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-8 text-xs w-20"
          type="number"
          min={0}
          max={100}
          data-testid="input-watchlist-threshold"
        />
        <Button
          size="sm"
          className="h-8 text-xs px-3"
          onClick={handleAdd}
          disabled={!newTicker.trim() || addMutation.isPending}
          data-testid="button-watchlist-add"
        >
          <Plus className="w-3 h-3 mr-1" />
          Add
        </Button>
      </div>

      {addMutation.isError && (
        <p className="text-xs text-loss mb-2">
          {(addMutation.error as any)?.message?.includes("409") ? "Already on watchlist" : "Failed to add"}
        </p>
      )}

      {/* Watchlist items */}
      {watchlist.length === 0 ? (
        <div className="py-4 text-center">
          <p className="text-xs text-muted-foreground">No tickers yet. Add one above or click the star on any trade card.</p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-60 overflow-y-auto">
          {watchlist.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 p-2 rounded-md border border-border text-xs group"
              data-testid={`watchlist-item-${item.ticker}`}
            >
              <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500 shrink-0" />
              <span className="font-semibold w-14">{item.ticker}</span>

              {editingId === item.id ? (
                <div className="flex items-center gap-1.5 flex-1">
                  <Input
                    value={editThreshold}
                    onChange={(e) => setEditThreshold(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveThreshold(item.id); if (e.key === "Escape") setEditingId(null); }}
                    className="h-6 text-xs w-16"
                    type="number"
                    min={0}
                    max={100}
                    placeholder="Score"
                    autoFocus
                    data-testid={`input-edit-threshold-${item.ticker}`}
                  />
                  <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={() => handleSaveThreshold(item.id)}>
                    <CheckCircle2 className="w-3 h-3 text-profit" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={() => setEditingId(null)}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex-1 text-muted-foreground">
                    {item.scoreThreshold ? (
                      <span className="tabular-nums">Alert ≥ {item.scoreThreshold.toFixed(0)}</span>
                    ) : (
                      <span className="opacity-50">No alert</span>
                    )}
                  </div>
                  <button
                    className="text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100 p-0.5"
                    onClick={() => { setEditingId(item.id); setEditThreshold(item.scoreThreshold?.toString() || ""); }}
                    data-testid={`button-edit-threshold-${item.ticker}`}
                  >
                    <Settings2 className="w-3 h-3" />
                  </button>
                  <button
                    className="text-muted-foreground hover:text-loss transition-colors opacity-0 group-hover:opacity-100 p-0.5"
                    onClick={() => removeMutation.mutate(item.id)}
                    data-testid={`button-remove-${item.ticker}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </>
              )}

              <span className="text-muted-foreground opacity-60">{timeAgo(item.addedAt)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

type StrategySummary = Record<string, { count: number; avgScore: number; avgROC: number; avgPOP: number }>;

export default function Dashboard() {
  const [strategy, setStrategy] = useState<FilterType>("all");
  const [sortBy, setSortBy] = useState<SortField>("compositeScore");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showHistory, setShowHistory] = useState(false);
  const [showWatchlist, setShowWatchlist] = useState(false);
  const [excludeEarnings, setExcludeEarnings] = useState(false);
  const [visibleCount, setVisibleCount] = useState(25);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const { data: allData, isLoading: allLoading } = useQuery<{ results: StrategyTradeWithEarnings[]; total: number; totalBeforeFilter?: number }>({
    queryKey: ["/api/all-results", excludeEarnings ? "?excludeEarnings=1" : ""],
    refetchInterval: 15000,
  });

  const { data: summaryData } = useQuery<StrategySummary>({
    queryKey: ["/api/strategy-summary"],
    refetchInterval: 15000,
  });

  const { data: scanStatus } = useQuery<ScanStatus>({
    queryKey: ["/api/scan-status"],
    refetchInterval: 3000,
  });

  const { data: historyData } = useQuery<{ history: ScanRecord[] }>({
    queryKey: ["/api/scan-history"],
    refetchInterval: 30000,
  });

  const { data: watchlistData } = useQuery<{ watchlist: WatchlistItem[] }>({
    queryKey: ["/api/watchlist"],
    refetchInterval: 10000,
  });

  const { data: alertsData } = useQuery<{ alerts: Alert[]; unseenCount: number }>({
    queryKey: ["/api/alerts"],
    refetchInterval: 5000,
  });

  const { data: loggedIdsData } = useQuery<{ ids: string[] }>({
    queryKey: ["/api/journal/logged-ids"],
    refetchInterval: 10000,
  });
  const loggedTradeIds = loggedIdsData?.ids || [];

  // Strategy insights from backtesting data
  interface InsightEntry { strategy: string; totalTrades: number; wins: number; losses: number; winRate: number; totalPnL: number; avgPnLPerTrade: number; tickersBacktested: number }
  const { data: insightsData } = useQuery<{ backtest: InsightEntry[]; totalBacktestEntries: number }>({
    queryKey: ["/api/insights"],
    refetchInterval: 60000,
  });

  const scanMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/scan"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scan-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/all-results"] });
      queryClient.invalidateQueries({ queryKey: ["/api/strategy-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scan-history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/earnings"] });
    },
  });

  const markSeenMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/alerts/mark-seen", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
    },
  });

  const addToWatchlistMutation = useMutation({
    mutationFn: async (ticker: string) => {
      await apiRequest("POST", "/api/watchlist", { ticker, scoreThreshold: null });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
    },
  });

  const allResults = allData?.results || [];
  const isScanning = scanStatus?.status === "scanning";
  const watchlist = watchlistData?.watchlist || [];
  const alerts = alertsData?.alerts || [];
  const unseenCount = alertsData?.unseenCount || 0;
  const watchlistTickers = new Set(watchlist.map(w => w.ticker));

  // Filter by strategy
  const filteredResults = strategy === "all" ? allResults : allResults.filter(r => r.strategyType === strategy);

  // Sort results, with watchlist tickers pinned to top
  const sortedResults = [...filteredResults].sort((a, b) => {
    const aWatchlist = watchlistTickers.has(a.underlyingTicker) ? 1 : 0;
    const bWatchlist = watchlistTickers.has(b.underlyingTicker) ? 1 : 0;
    if (aWatchlist !== bWatchlist) return bWatchlist - aWatchlist;

    switch (sortBy) {
      case "annualizedROC": return b.annualizedROC - a.annualizedROC;
      case "deltaZScore": return Math.abs(b.deltaZScore) - Math.abs(a.deltaZScore);
      case "probabilityOfProfit": return b.probabilityOfProfit - a.probabilityOfProfit;
      case "premiumPerDay": return b.premiumPerDay - a.premiumPerDay;
      case "netCredit": return b.netCredit - a.netCredit;
      case "ivRank": return (b.ivRank ?? -1) - (a.ivRank ?? -1);
      default: return b.compositeScore - a.compositeScore;
    }
  });

  // Reset visible count when filter changes
  const prevStrategyRef = useRef(strategy);
  if (prevStrategyRef.current !== strategy) {
    prevStrategyRef.current = strategy;
    setVisibleCount(25);
  }

  const visibleResults = sortedResults.slice(0, visibleCount);
  const hasMore = visibleCount < sortedResults.length;

  // KPIs from top 5 picks
  const top5 = sortedResults.slice(0, 5);
  const avgROC = top5.length > 0 ? top5.reduce((s, p) => s + p.annualizedROC, 0) / top5.length : 0;
  const avgPOP = top5.length > 0 ? top5.reduce((s, p) => s + p.probabilityOfProfit, 0) / top5.length * 100 : 0;
  const avgDZ = top5.length > 0 ? top5.reduce((s, p) => s + Math.abs(p.deltaZScore), 0) / top5.length : 0;
  const isRedactedData = top5.length > 0 && (top5[0] as any).redacted === true;
  const totalCredit = isRedactedData ? 0 : top5.reduce((s, p) => s + p.netCredit * 100, 0);

  const scanHistory = historyData?.history || [];

  const { toast } = useToast();

  const logTradeMutation = useMutation({
    mutationFn: async (entry: InsertJournalEntry) => {
      await apiRequest("POST", "/api/journal", entry);
    },
    onSuccess: (_data, entry) => {
      queryClient.invalidateQueries({ queryKey: ["/api/journal/logged-ids"] });
      queryClient.invalidateQueries({ queryKey: ["/api/journal"] });
      queryClient.invalidateQueries({ queryKey: ["/api/journal/stats"] });
      toast({ title: "Trade logged", description: `${entry.ticker} ${STRATEGY_SHORT[entry.strategyType]} added to journal` });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to log trade", description: err.message, variant: "destructive" });
    },
  });

  const handleLogTrade = (trade: StrategyTradeWithEarnings) => {
    const entry: InsertJournalEntry = {
      ticker: trade.underlyingTicker,
      strategyType: trade.strategyType,
      legs: trade.legs,
      expirationDate: trade.expirationDate,
      entryDate: new Date().toISOString().split("T")[0],
      entryCredit: trade.netCredit,
      contracts: 1,
      underlyingPriceAtEntry: trade.underlyingPrice,
      maxLoss: trade.maxLoss,
      spreadWidth: trade.spreadWidth ?? null,
      compositeScoreAtEntry: trade.compositeScore,
      ivRankAtEntry: trade.ivRank ?? null,
      scanTradeId: trade.id,
      notes: null,
      tags: [],
    };
    logTradeMutation.mutate(entry);
  };

  const handleWatchlistAdd = (ticker: string) => {
    addToWatchlistMutation.mutate(ticker);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-label="Premium Screener">
              <rect x="2" y="2" width="28" height="28" rx="6" stroke="currentColor" strokeWidth="2" />
              <path d="M8 22L14 10L20 18L26 8" stroke="hsl(217, 91%, 60%)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="14" cy="10" r="2" fill="hsl(142, 71%, 50%)" />
              <circle cx="20" cy="18" r="2" fill="hsl(217, 91%, 60%)" />
            </svg>
            <div>
              <h1 className="text-sm font-semibold tracking-tight">Premium Screener</h1>
              <p className="text-xs text-muted-foreground">S&P 500 + NASDAQ 100 Options · {scanStatus?.totalTickers || 518} Tickers · Sell Premium</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <FreshnessIndicator
              lastUpdated={scanStatus?.lastUpdated || null}
              isScanning={isScanning}
            />
            <NotificationBell
              alerts={alerts}
              unseenCount={unseenCount}
              onMarkSeen={() => markSeenMutation.mutate()}
            />
            <Button
              size="sm"
              variant="ghost"
              className="text-xs h-8 px-2"
              onClick={() => { setShowWatchlist(!showWatchlist); if (!showWatchlist) setShowHistory(false); }}
              data-testid="button-watchlist"
            >
              <Star className={`w-3.5 h-3.5 mr-1 ${watchlist.length > 0 ? "text-yellow-500 fill-yellow-500" : ""}`} />
              <span className="hidden sm:inline">Watchlist</span>
              {watchlist.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1">{watchlist.length}</Badge>
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-xs h-8 px-2"
              onClick={() => { setShowHistory(!showHistory); if (!showHistory) setShowWatchlist(false); }}
              data-testid="button-history"
            >
              <History className="w-3.5 h-3.5 mr-1" />
              <span className="hidden sm:inline">History</span>
            </Button>
            <Link href="/journal">
              <Button size="sm" variant="ghost" className="text-xs h-8 px-2" data-testid="button-journal">
                <BookOpen className="w-3.5 h-3.5 mr-1" />
                <span className="hidden sm:inline">Journal</span>
              </Button>
            </Link>
            <Button size="sm" variant="secondary" onClick={() => scanMutation.mutate()} disabled={isScanning || scanMutation.isPending} data-testid="button-rescan">
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isScanning ? "animate-spin" : ""}`} />
              {isScanning ? `${scanStatus?.progress || 0}%` : "Rescan"}
            </Button>
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>

        {/* Scan progress bar + details */}
        {isScanning && (
          <div>
            <div className="h-0.5 bg-muted">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${scanStatus?.progress || 0}%` }}
              />
            </div>
            <div className="px-4 py-1.5 text-xs text-muted-foreground flex items-center gap-3 bg-muted/30" data-testid="text-scan-progress">
              <Activity className="w-3 h-3 animate-pulse" />
              <span>Scanning {scanStatus?.scannedTickers || 0} / {scanStatus?.totalTickers || 0} tickers</span>
              {(scanStatus?.totalTickers || 0) > 100 && (
                <span className="text-muted-foreground/60">· ~{Math.ceil(((scanStatus?.totalTickers || 0) * 0.55) / 60)} min est.</span>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-4 py-5 space-y-5">

        <UpgradeBanner />

        {/* Watchlist Panel (collapsible) */}
        {showWatchlist && (
          <WatchlistPanel onClose={() => setShowWatchlist(false)} />
        )}

        {/* Scan History Panel (collapsible) */}
        {showHistory && (
          <ScanHistoryPanel
            history={scanHistory}
            onClose={() => setShowHistory(false)}
          />
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICard icon={DollarSign} label="Avg Ann. ROC" value={isRedactedData ? "Premium" : fmtPct(avgROC)} sub="Across top picks" color="text-profit" />
          <KPICard icon={Shield} label="Avg POP" value={isRedactedData ? "Premium" : fmtPct(avgPOP)} sub="Win probability" color="text-chart-1" />
          <KPICard icon={Zap} label="Avg Delta Z" value={isRedactedData ? "Premium" : avgDZ.toFixed(1) + "σ"} sub="Above recent avg" color="text-chart-3" />
          <KPICard icon={Target} label="Total Credit" value={isRedactedData ? "Premium" : fmt$(totalCredit)} sub={`${top5.length} trades`} color="text-chart-4" />
        </div>

        {/* Strategy Summary Cards */}
        {summaryData && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {(["cash_secured_put", "put_credit_spread", "strangle", "iron_condor"] as const).map(st => {
              const s = summaryData[st];
              if (!s) return null;
              const isActive = strategy === st;
              return (
                <button
                  key={st}
                  className={`text-left rounded-md border p-3 transition-colors cursor-pointer ${
                    isActive ? "border-primary bg-primary/5" : "border-border"
                  }`}
                  onClick={() => setStrategy(strategy === st ? "all" : st)}
                  data-testid={`btn-strat-${st}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className={`text-xs ${STRATEGY_COLORS[st]}`}>
                      {STRATEGY_SHORT[st]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{s.count} found</span>
                  </div>
                  <div className="flex items-baseline gap-3 text-xs tabular-nums">
                    <span>ROC <span className="font-medium text-foreground">{fmtPct(s.avgROC)}</span></span>
                    <span>POP <span className="font-medium text-foreground">{fmtPct(parseFloat(String(s.avgPOP)))}</span></span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Filters row */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
          <Tabs value={strategy} onValueChange={(v) => setStrategy(v as FilterType)}>
            <TabsList className="flex-wrap h-auto gap-0.5">
              <TabsTrigger value="all" data-testid="tab-all" className="text-xs">All</TabsTrigger>
              <TabsTrigger value="cash_secured_put" data-testid="tab-csp" className="text-xs">
                <TrendingDown className="w-3 h-3 mr-1" />CSP
              </TabsTrigger>
              <TabsTrigger value="put_credit_spread" data-testid="tab-pcs" className="text-xs">
                <Layers className="w-3 h-3 mr-1" />PCS
              </TabsTrigger>
              <TabsTrigger value="strangle" data-testid="tab-str" className="text-xs">
                <ArrowDownUp className="w-3 h-3 mr-1" />Strangle
              </TabsTrigger>
              <TabsTrigger value="iron_condor" data-testid="tab-ic" className="text-xs">
                <Shield className="w-3 h-3 mr-1" />Iron Condor
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-3 overflow-x-auto max-w-full">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Switch
                    id="exclude-earnings"
                    checked={excludeEarnings}
                    onCheckedChange={setExcludeEarnings}
                    data-testid="switch-exclude-earnings"
                    className="scale-75 origin-right"
                  />
                  <Label
                    htmlFor="exclude-earnings"
                    className={`text-xs cursor-pointer flex items-center gap-1 ${excludeEarnings ? "text-orange-600 dark:text-orange-400 font-medium" : "text-muted-foreground"}`}
                  >
                    <CalendarX className="w-3 h-3" />
                    <span className="hidden sm:inline">Excl. Earnings</span>
                    <span className="sm:hidden">ER</span>
                  </Label>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {excludeEarnings
                  ? "Hiding trades with earnings before expiration"
                  : "Show all trades — toggle to exclude trades with upcoming earnings"}
              </TooltipContent>
            </Tooltip>

            <span className="text-xs text-muted-foreground shrink-0">Sort:</span>
            <Tabs value={sortBy} onValueChange={(v) => setSortBy(v as SortField)} className="shrink-0">
              <TabsList className="h-8">
                <TabsTrigger value="compositeScore" className="text-xs px-2 h-6">Score</TabsTrigger>
                <TabsTrigger value="annualizedROC" className="text-xs px-2 h-6">ROC</TabsTrigger>
                <TabsTrigger value="deltaZScore" className="text-xs px-2 h-6">Delta Z</TabsTrigger>
                <TabsTrigger value="probabilityOfProfit" className="text-xs px-2 h-6">POP</TabsTrigger>
                <TabsTrigger value="netCredit" className="text-xs px-2 h-6">Credit</TabsTrigger>
                <TabsTrigger value="ivRank" className="text-xs px-2 h-6">IVR</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Methodology */}
        <Card className="p-3 bg-accent/30">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-medium text-foreground">Scoring: </span>
              Delta Z-Score (35%) measures how rich premium is vs. the chain average.
              Annualized ROC (25%) = net credit / max risk, annualized.
              Probability of Profit (25%) from delta-based estimation.
              Liquidity (15%) from volume/OI ratio.
              Click any card to expand leg details. Star a ticker to add to watchlist.
            </div>
          </div>
        </Card>

        {/* Strategy Insights from backtest data */}
        {insightsData && insightsData.backtest.length > 0 && (
          <Card className="p-3" data-testid="strategy-insights">
            <div className="flex items-center gap-2 mb-2">
              <PieChart className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold">Historical Win Rates</span>
              <span className="text-[10px] text-muted-foreground ml-auto">
                {insightsData.totalBacktestEntries} backtests across {insightsData.backtest.reduce((s, b) => s + b.tickersBacktested, 0)} tickers
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {insightsData.backtest.filter(b => b.totalTrades > 0).map(b => (
                <div key={b.strategy} className="relative overflow-hidden rounded-lg border border-border p-2.5">
                  {/* Win rate bar background */}
                  <div
                    className="absolute inset-0 opacity-[0.06]"
                    style={{
                      background: b.winRate >= 60 ? "hsl(142, 71%, 45%)" : b.winRate >= 40 ? "hsl(43, 74%, 49%)" : "hsl(0, 72%, 51%)",
                      width: `${Math.min(b.winRate, 100)}%`,
                    }}
                  />
                  <div className="relative">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Badge className={`text-[10px] ${STRATEGY_COLORS[b.strategy] || "bg-muted text-muted-foreground"}`}>
                        {STRATEGY_SHORT[b.strategy] || b.strategy}
                      </Badge>
                    </div>
                    <div className={`text-lg font-bold tabular-nums ${b.winRate >= 60 ? "text-profit" : b.winRate >= 40 ? "" : "text-loss"}`}>
                      {b.winRate}%
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                      <span>{b.wins}W / {b.losses}L</span>
                      <span className="text-muted-foreground/50">·</span>
                      <span className={b.avgPnLPerTrade >= 0 ? "text-profit" : "text-loss"}>
                        avg {b.avgPnLPerTrade >= 0 ? "+" : ""}{fmt$(b.avgPnLPerTrade)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Earnings filter active banner */}
        {excludeEarnings && allData?.totalBeforeFilter && allData.totalBeforeFilter > allData.total && (
          <Card className="p-3 border-orange-500/30 bg-orange-500/5">
            <div className="flex items-center gap-2 text-xs">
              <CalendarX className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400 shrink-0" />
              <span className="text-orange-700 dark:text-orange-300">
                Earnings filter active — excluding {allData.totalBeforeFilter - allData.total} trade{allData.totalBeforeFilter - allData.total !== 1 ? "s" : ""} with earnings before expiry
              </span>
            </div>
          </Card>
        )}

        {/* All Trade Ideas */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold">
              {STRATEGY_LABELS[strategy]} Trade Ideas
            </h2>
            <span className="text-xs text-muted-foreground tabular-nums">
              {sortedResults.length} trades
            </span>
          </div>

          {allLoading ? (
            <LoadingSkeleton />
          ) : sortedResults.length === 0 ? (
            <Card className="p-8 text-center">
              <Activity className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No results for this strategy. Try a different filter or run a scan.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {visibleResults.map((trade, i) => (
                <TradeCard
                  key={trade.id}
                  trade={trade}
                  rank={i + 1}
                  expanded={expandedIds.has(trade.id)}
                  onToggle={() => toggleExpand(trade.id)}
                  watchlist={watchlist}
                  onWatchlistAdd={handleWatchlistAdd}
                  isPinned={watchlistTickers.has(trade.underlyingTicker)}
                  loggedTradeIds={loggedTradeIds}
                  onLogTrade={handleLogTrade}
                />
              ))}
              {hasMore && (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setVisibleCount(prev => prev + 25)}
                    data-testid="button-show-more"
                    className="text-xs"
                  >
                    Show More ({sortedResults.length - visibleCount} remaining)
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>



        {/* Scan summary */}
        {allData && allData.total > 0 && (
          <Card className="p-4">
            <h3 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">Scan Summary</h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
              <div>
                <div className="text-lg font-semibold tabular-nums">{allData.total}</div>
                <div className="text-xs text-muted-foreground">Total Trades</div>
              </div>
              {(["cash_secured_put", "put_credit_spread", "strangle", "iron_condor"] as const).map(st => (
                <div key={st}>
                  <div className="text-lg font-semibold tabular-nums">{allData.results.filter(r => r.strategyType === st).length}</div>
                  <div className="text-xs text-muted-foreground">{STRATEGY_SHORT[st]}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

      </main>
    </div>
  );
}
