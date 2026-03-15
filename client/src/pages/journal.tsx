import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  BookOpen, TrendingUp, TrendingDown, Trophy, Clock, DollarSign,
  Target, Plus, X, Check, ChevronDown, ChevronUp, ArrowLeft,
  Calendar, Trash2, Edit3, BarChart3, Layers, Shield, ArrowDownUp,
  Activity, Percent, Gauge, Crosshair
} from "lucide-react";
import { BarChart, Bar, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip as RechartsTooltip } from "recharts";
import { Link } from "wouter";
import type { JournalEntry, JournalStats, StrategyType } from "@shared/schema";

// ── Constants ──
const STRATEGY_SHORT: Record<string, string> = {
  cash_secured_put: "CSP", put_credit_spread: "PCS",
  strangle: "Strangle", iron_condor: "IC",
};
const STRATEGY_COLORS: Record<string, string> = {
  cash_secured_put: "bg-blue-600 hover:bg-blue-700 text-white",
  put_credit_spread: "bg-emerald-600 hover:bg-emerald-700 text-white",
  strangle: "bg-orange-500 hover:bg-orange-600 text-white",
  iron_condor: "bg-purple-600 hover:bg-purple-700 text-white",
};
const STRATEGY_ICONS: Record<string, typeof TrendingDown> = {
  cash_secured_put: TrendingDown, put_credit_spread: Layers,
  strangle: ArrowDownUp, iron_condor: Shield,
};
const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
  closed: "bg-muted text-muted-foreground border-border",
  expired: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  assigned: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30",
  rolled: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30",
};

const fmt$ = (n: number) => `$${Math.abs(n).toFixed(2)}`;
const fmtPnL = (n: number) => (n >= 0 ? `+$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`);
const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

function daysUntil(dateStr: string): number {
  const exp = new Date(dateStr + "T16:00:00");
  const now = new Date();
  return Math.max(0, Math.ceil((exp.getTime() - now.getTime()) / 86400000));
}

function daysBetween(d1: string, d2: string): number {
  return Math.max(0, Math.round((new Date(d2).getTime() - new Date(d1).getTime()) / 86400000));
}

// ── Portfolio Greeks types ──
interface PortfolioGreeks {
  totalDelta: number;
  totalTheta: number;
  totalGamma: number;
  totalVega: number;
  avgPOP: number;
  positions: { ticker: string; strategyType: string; contracts: number; delta: number; theta: number; gamma: number; vega: number; daysToExpiration: number; pop: number; entryCredit: number; maxLoss: number; ivRankAtEntry: number | null; compositeScore: number | null }[];
  bySector: Record<string, { delta: number; theta: number; count: number }>;
}

// ── Portfolio Greeks Dashboard ──
function PortfolioGreeksPanel({ greeks }: { greeks: PortfolioGreeks }) {
  if (greeks.positions.length === 0) return null;

  // Build chart data: delta exposure by ticker
  const deltaChart = Object.entries(greeks.bySector)
    .map(([ticker, data]) => ({ ticker, delta: +data.delta.toFixed(1) }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  // Net position assessment
  const deltaDir = greeks.totalDelta > 5 ? "bullish" : greeks.totalDelta < -5 ? "bearish" : "neutral";

  return (
    <Card className="p-4" data-testid="portfolio-greeks">
      <div className="flex items-center gap-2 mb-3">
        <Gauge className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Portfolio Greeks</h3>
        <Badge variant="outline" className="text-xs ml-auto">
          {greeks.positions.length} position{greeks.positions.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {/* Aggregate Greeks Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
        <div className="bg-muted/50 rounded-lg p-2.5 text-center">
          <div className="text-xs text-muted-foreground mb-0.5">Net Delta (Δ)</div>
          <div className={`text-base font-bold tabular-nums ${deltaDir === "bullish" ? "text-profit" : deltaDir === "bearish" ? "text-loss" : ""}`}>
            {greeks.totalDelta > 0 ? "+" : ""}{greeks.totalDelta.toFixed(1)}
          </div>
          <div className="text-[10px] text-muted-foreground capitalize">{deltaDir} bias</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-2.5 text-center">
          <div className="text-xs text-muted-foreground mb-0.5">Net Theta (Θ)</div>
          <div className={`text-base font-bold tabular-nums ${greeks.totalTheta > 0 ? "text-profit" : "text-loss"}`}>
            {greeks.totalTheta > 0 ? "+" : ""}{fmt$(greeks.totalTheta)}
          </div>
          <div className="text-[10px] text-muted-foreground">{greeks.totalTheta > 0 ? "collecting" : "paying"} /day</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-2.5 text-center">
          <div className="text-xs text-muted-foreground mb-0.5">Net Gamma (Γ)</div>
          <div className="text-base font-bold tabular-nums">
            {greeks.totalGamma > 0 ? "+" : ""}{greeks.totalGamma.toFixed(2)}
          </div>
          <div className="text-[10px] text-muted-foreground">{greeks.totalGamma < 0 ? "short gamma" : "long gamma"}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-2.5 text-center">
          <div className="text-xs text-muted-foreground mb-0.5">Net Vega (ν)</div>
          <div className={`text-base font-bold tabular-nums ${greeks.totalVega < 0 ? "text-profit" : "text-loss"}`}>
            {greeks.totalVega > 0 ? "+" : ""}{fmt$(greeks.totalVega)}
          </div>
          <div className="text-[10px] text-muted-foreground">{greeks.totalVega < 0 ? "short vol" : "long vol"}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-2.5 text-center">
          <div className="text-xs text-muted-foreground mb-0.5">Avg POP</div>
          <div className={`text-base font-bold tabular-nums ${greeks.avgPOP >= 60 ? "text-profit" : greeks.avgPOP >= 45 ? "" : "text-loss"}`}>
            {greeks.avgPOP.toFixed(0)}%
          </div>
          <div className="text-[10px] text-muted-foreground">weighted avg</div>
        </div>
      </div>

      {/* Delta Exposure by Ticker chart */}
      {deltaChart.length > 1 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1.5">Delta Exposure by Ticker</div>
          <div className="h-32 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deltaChart} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <XAxis dataKey="ticker" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <RechartsTooltip
                  contentStyle={{ fontSize: 11, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                  formatter={(val: number) => [val.toFixed(1), "Delta"]}
                />
                <Bar dataKey="delta" radius={[3, 3, 0, 0]}>
                  {deltaChart.map((d, i) => (
                    <Cell key={i} fill={d.delta >= 0 ? "hsl(142, 71%, 45%)" : "hsl(0, 72%, 51%)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Position-level greeks table */}
      <div className="mt-3">
        <div className="text-xs font-medium text-muted-foreground mb-1.5">Position Details</div>
        <div className="max-h-48 overflow-y-auto overflow-x-auto rounded border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="text-left py-1.5 px-2 font-medium">Ticker</th>
                <th className="text-center py-1.5 px-2 font-medium">Strategy</th>
                <th className="text-right py-1.5 px-2 font-medium">Qty</th>
                <th className="text-right py-1.5 px-2 font-medium">POP</th>
                <th className="text-right py-1.5 px-2 font-medium">Delta</th>
                <th className="text-right py-1.5 px-2 font-medium">Theta</th>
                <th className="text-right py-1.5 px-2 font-medium">Gamma</th>
                <th className="text-right py-1.5 px-2 font-medium">Vega</th>
                <th className="text-right py-1.5 px-2 font-medium">IVR</th>
                <th className="text-right py-1.5 px-2 font-medium">DTE</th>
              </tr>
            </thead>
            <tbody>
              {greeks.positions.map((p, i) => (
                <tr key={i} className="border-t border-border/50 hover:bg-muted/30">
                  <td className="py-1 px-2 font-medium">{p.ticker}</td>
                  <td className="py-1 px-2 text-center">
                    <Badge className={`text-[10px] ${STRATEGY_COLORS[p.strategyType]}`}>
                      {STRATEGY_SHORT[p.strategyType]}
                    </Badge>
                  </td>
                  <td className="py-1 px-2 text-right tabular-nums">{p.contracts}</td>
                  <td className={`py-1 px-2 text-right tabular-nums ${p.pop >= 60 ? "text-profit" : p.pop >= 45 ? "" : "text-loss"}`}>
                    {p.pop > 0 ? `${p.pop.toFixed(0)}%` : "—"}
                  </td>
                  <td className={`py-1 px-2 text-right tabular-nums ${p.delta >= 0 ? "text-profit" : "text-loss"}`}>
                    {p.delta > 0 ? "+" : ""}{p.delta.toFixed(1)}
                  </td>
                  <td className={`py-1 px-2 text-right tabular-nums ${p.theta > 0 ? "text-profit" : "text-loss"}`}>
                    {p.theta > 0 ? "+" : ""}{fmt$(p.theta)}
                  </td>
                  <td className="py-1 px-2 text-right tabular-nums">
                    {p.gamma.toFixed(2)}
                  </td>
                  <td className="py-1 px-2 text-right tabular-nums">
                    {p.vega > 0 ? "+" : ""}{fmt$(p.vega)}
                  </td>
                  <td className="py-1 px-2 text-right tabular-nums text-muted-foreground">
                    {p.ivRankAtEntry != null ? `${Math.round(p.ivRankAtEntry)}%` : "—"}
                  </td>
                  <td className={`py-1 px-2 text-right tabular-nums ${p.daysToExpiration <= 7 ? "text-loss font-medium" : ""}`}>
                    {p.daysToExpiration}d
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

// ── KPI Card ──
function KPICard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string; icon: typeof DollarSign; color?: string;
}) {
  return (
    <Card className="p-3" data-testid={`kpi-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className={`text-lg font-bold tabular-nums ${color || ""}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}

// ── Close Position Dialog ──
function CloseDialog({ entry, open, onClose }: {
  entry: JournalEntry | null; open: boolean; onClose: () => void;
}) {
  const { toast } = useToast();
  const [exitDebit, setExitDebit] = useState("0");
  const [exitDate, setExitDate] = useState(new Date().toISOString().split("T")[0]);
  const [exitPrice, setExitPrice] = useState("");
  const [status, setStatus] = useState<string>("closed");
  const [notes, setNotes] = useState("");

  const closeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/journal/${entry!.id}/close`, {
        exitDebit: parseFloat(exitDebit),
        exitDate,
        underlyingPriceAtExit: exitPrice ? parseFloat(exitPrice) : undefined,
        status,
        notes: notes || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/journal"] });
      queryClient.invalidateQueries({ queryKey: ["/api/journal/stats"] });
      toast({ title: "Position closed", description: `${entry?.ticker} marked as ${status}` });
      onClose();
    },
    onError: () => toast({ title: "Error", description: "Failed to close position", variant: "destructive" }),
  });

  if (!entry) return null;
  const estimatedPnL = (entry.entryCredit - parseFloat(exitDebit || "0")) * 100 * entry.contracts;

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md" data-testid="dialog-close-position">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Close {entry.ticker}
            <Badge className={`text-xs ${STRATEGY_COLORS[entry.strategyType]}`}>
              {STRATEGY_SHORT[entry.strategyType]}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Exit Debit (per contract)</Label>
              <Input type="number" step="0.01" min="0" value={exitDebit}
                onChange={e => setExitDebit(e.target.value)} data-testid="input-exit-debit" />
              <div className="text-xs text-muted-foreground mt-0.5">0 = expired worthless</div>
            </div>
            <div>
              <Label className="text-xs">Exit Date</Label>
              <Input type="date" value={exitDate}
                onChange={e => setExitDate(e.target.value)} data-testid="input-exit-date" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger data-testid="select-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="closed">Closed</SelectItem>
                  <SelectItem value="expired">Expired Worthless</SelectItem>
                  <SelectItem value="assigned">Assigned</SelectItem>
                  <SelectItem value="rolled">Rolled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Underlying Price (optional)</Label>
              <Input type="number" step="0.01" value={exitPrice}
                onChange={e => setExitPrice(e.target.value)} data-testid="input-exit-price" />
            </div>
          </div>

          <div>
            <Label className="text-xs">Close Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Why did you close? What did you learn?" rows={2}
              data-testid="input-close-notes" />
          </div>

          <Card className="p-3 bg-accent/30">
            <div className="text-xs text-muted-foreground mb-1">Estimated P&L</div>
            <div className={`text-lg font-bold tabular-nums ${estimatedPnL >= 0 ? "text-profit" : "text-loss"}`}>
              {fmtPnL(estimatedPnL)}
            </div>
            <div className="text-xs text-muted-foreground">
              Entry: {fmt$(entry.entryCredit)} · Exit: {fmt$(parseFloat(exitDebit || "0"))} · {entry.contracts} contract{entry.contracts > 1 ? "s" : ""}
            </div>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => closeMutation.mutate()} disabled={closeMutation.isPending} data-testid="button-confirm-close">
            {closeMutation.isPending ? "Closing..." : "Close Position"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Add Manual Trade Dialog ──
function AddTradeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [ticker, setTicker] = useState("");
  const [strategyType, setStrategyType] = useState<string>("cash_secured_put");
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split("T")[0]);
  const [expDate, setExpDate] = useState("");
  const [credit, setCredit] = useState("");
  const [contracts, setContracts] = useState("1");
  const [price, setPrice] = useState("");
  const [maxLoss, setMaxLoss] = useState("");
  const [notes, setNotes] = useState("");

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/journal", {
        ticker: ticker.toUpperCase(),
        strategyType,
        legs: [],
        expirationDate: expDate,
        entryDate,
        entryCredit: parseFloat(credit),
        contracts: parseInt(contracts),
        underlyingPriceAtEntry: price ? parseFloat(price) : null,
        maxLoss: parseFloat(maxLoss),
        notes: notes || null,
        tags: [],
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/journal"] });
      queryClient.invalidateQueries({ queryKey: ["/api/journal/stats"] });
      toast({ title: "Trade logged", description: `${ticker.toUpperCase()} added to journal` });
      onClose();
      // Reset
      setTicker(""); setCredit(""); setPrice(""); setMaxLoss(""); setNotes("");
      setExpDate(""); setContracts("1");
    },
    onError: () => toast({ title: "Error", description: "Failed to add trade", variant: "destructive" }),
  });

  const valid = ticker && expDate && credit && maxLoss;

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md" data-testid="dialog-add-trade">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-4 h-4" /> Log Manual Trade
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Ticker</Label>
              <Input value={ticker} onChange={e => setTicker(e.target.value)}
                placeholder="AAPL" data-testid="input-ticker" />
            </div>
            <div>
              <Label className="text-xs">Strategy</Label>
              <Select value={strategyType} onValueChange={setStrategyType}>
                <SelectTrigger data-testid="select-strategy"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash_secured_put">Cash Secured Put</SelectItem>
                  <SelectItem value="put_credit_spread">Put Credit Spread</SelectItem>
                  <SelectItem value="strangle">Strangle</SelectItem>
                  <SelectItem value="iron_condor">Iron Condor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Entry Date</Label>
              <Input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)}
                data-testid="input-entry-date" />
            </div>
            <div>
              <Label className="text-xs">Expiration Date</Label>
              <Input type="date" value={expDate} onChange={e => setExpDate(e.target.value)}
                data-testid="input-exp-date" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Credit (per contract)</Label>
              <Input type="number" step="0.01" value={credit}
                onChange={e => setCredit(e.target.value)} placeholder="1.25" data-testid="input-credit" />
            </div>
            <div>
              <Label className="text-xs">Contracts</Label>
              <Input type="number" min="1" value={contracts}
                onChange={e => setContracts(e.target.value)} data-testid="input-contracts" />
            </div>
            <div>
              <Label className="text-xs">Max Loss (per)</Label>
              <Input type="number" step="0.01" value={maxLoss}
                onChange={e => setMaxLoss(e.target.value)} placeholder="5.00" data-testid="input-max-loss" />
            </div>
          </div>

          <div>
            <Label className="text-xs">Underlying Price at Entry (optional)</Label>
            <Input type="number" step="0.01" value={price}
              onChange={e => setPrice(e.target.value)} placeholder="150.00" data-testid="input-underlying" />
          </div>

          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Trade thesis, setup notes..." rows={2} data-testid="input-notes" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => addMutation.mutate()} disabled={!valid || addMutation.isPending}
            data-testid="button-add-trade">
            {addMutation.isPending ? "Logging..." : "Log Trade"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Entry Dialog ──
function EditEntryDialog({ entry, open, onClose }: {
  entry: JournalEntry | null; open: boolean; onClose: () => void;
}) {
  const { toast } = useToast();
  const [credit, setCredit] = useState("");
  const [contracts, setContracts] = useState("");
  const [lastEntryId, setLastEntryId] = useState<number | null>(null);

  // Sync fields when a new entry opens
  if (entry && entry.id !== lastEntryId) {
    setCredit(entry.entryCredit.toFixed(2));
    setContracts(String(entry.contracts));
    setLastEntryId(entry.id);
  }

  const editMutation = useMutation({
    mutationFn: async () => {
      const body: { entryCredit?: number; contracts?: number } = {};
      const newCredit = parseFloat(credit);
      const newContracts = parseInt(contracts);
      if (!isNaN(newCredit) && newCredit >= 0) body.entryCredit = newCredit;
      if (!isNaN(newContracts) && newContracts >= 1) body.contracts = newContracts;
      await apiRequest("PUT", `/api/journal/${entry!.id}/entry`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/journal"] });
      queryClient.invalidateQueries({ queryKey: ["/api/journal/stats"] });
      toast({ title: "Updated", description: `${entry?.ticker} fill price & contracts saved` });
      onClose();
      setCredit(""); setContracts(""); setLastEntryId(null);
    },
    onError: () => toast({ title: "Error", description: "Failed to update entry", variant: "destructive" }),
  });

  if (!entry) return null;

  const newCredit = parseFloat(credit) || 0;
  const newContracts = parseInt(contracts) || 1;
  const totalPremium = newCredit * 100 * newContracts;

  return (
    <Dialog open={open} onOpenChange={() => { onClose(); setCredit(""); setContracts(""); setLastEntryId(null); }}>
      <DialogContent className="max-w-sm" data-testid="dialog-edit-entry">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit3 className="w-4 h-4" /> Edit {entry.ticker}
            <Badge className={`text-xs ${STRATEGY_COLORS[entry.strategyType]}`}>
              {STRATEGY_SHORT[entry.strategyType]}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Fill Price (per contract)</Label>
              <Input type="number" step="0.01" min="0" value={credit}
                onChange={e => setCredit(e.target.value)} data-testid="input-edit-credit" />
              <div className="text-xs text-muted-foreground mt-0.5">Credit received at fill</div>
            </div>
            <div>
              <Label className="text-xs">Contracts</Label>
              <Input type="number" min="1" step="1" value={contracts}
                onChange={e => setContracts(e.target.value)} data-testid="input-edit-contracts" />
            </div>
          </div>

          <Card className="p-3 bg-accent/30">
            <div className="text-xs text-muted-foreground mb-1">Total Premium</div>
            <div className="text-lg font-bold tabular-nums">
              ${totalPremium.toFixed(2)}
            </div>
            <div className="text-xs text-muted-foreground">
              {fmt$(newCredit)} × 100 × {newContracts} contract{newContracts > 1 ? "s" : ""}
            </div>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); setCredit(""); setContracts(""); setLastEntryId(null); }}>Cancel</Button>
          <Button onClick={() => editMutation.mutate()} disabled={editMutation.isPending}
            data-testid="button-save-edit">
            {editMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Journal Payoff Diagram ──
// Uses geometric keypoints instead of point-by-point computation.
// A PCS always has the same shape: flat max-loss → diagonal → flat max-profit.
// We just plug in the trade's actual values.
function JournalPayoffDiagram({ entry }: { entry: JournalEntry }) {
  const W = 340;
  const H = 160;
  const pad = { top: 16, right: 16, bottom: 28, left: 44 };
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top - pad.bottom;

  const price = entry.underlyingPriceAtEntry != null ? Number(entry.underlyingPriceAtEntry) : null;
  const legs = entry.legs;
  if (!legs || legs.length === 0) return null;

  // Extract key trade parameters with explicit number coercion
  const allStrikes = legs.map(l => Number(l.strikePrice));
  const minStrike = Math.min(...allStrikes);
  const maxStrike = Math.max(...allStrikes);
  const spreadWidth = maxStrike - minStrike || maxStrike * 0.05;

  // Compute max profit & max loss from the entry's own credit/maxLoss
  const credit = Number(entry.entryCredit);
  const maxProfit = Math.round(credit * 100);
  const maxLoss = Math.round(Number(entry.maxLoss)); // already negative

  // Break-even: for PCS = sell strike - credit
  const sellStrike = allStrikes.find((_, i) => legs[i].action === "sell") ?? maxStrike;
  const buyStrike = allStrikes.find((_, i) => legs[i].action === "buy") ?? minStrike;
  const breakEven = sellStrike - credit; // PCS break-even

  // Build 4 keypoints: the universal PCS shape
  // [far left = max loss] → [buy strike = max loss] → [sell strike = max profit] → [far right = max profit]
  // Price range: enough padding around strikes + include underlying
  const rangeMargin = spreadWidth * 3;
  let lo = Math.min(buyStrike - rangeMargin, price != null ? price * 0.85 : buyStrike - rangeMargin);
  let hi = Math.max(sellStrike + rangeMargin, price != null ? price * 1.15 : sellStrike + rangeMargin);
  lo = Math.max(0, lo);

  const keyPoints: { price: number; pnl: number }[] = [
    { price: lo, pnl: maxLoss },
    { price: buyStrike, pnl: maxLoss },
    { price: sellStrike, pnl: maxProfit },
    { price: hi, pnl: maxProfit },
  ];

  const minPnl = maxLoss;
  const maxPnl = maxProfit;
  const pnlRange = maxPnl - minPnl || 1;
  const pnlPad = pnlRange * 0.1;
  const yMin = minPnl - pnlPad;
  const yMax = maxPnl + pnlPad;

  const toX = (px: number) => pad.left + ((px - lo) / (hi - lo)) * cW;
  const toY = (pnl: number) => pad.top + (1 - (pnl - yMin) / (yMax - yMin)) * cH;
  const zeroY = Math.max(pad.top, Math.min(pad.top + cH, toY(0)));

  // Build the payoff line path from keypoints
  const pathD = keyPoints.map((pt, i) =>
    `${i === 0 ? "M" : "L"}${toX(pt.price).toFixed(1)},${toY(pt.pnl).toFixed(1)}`
  ).join(" ");

  // Fill areas: profit above zero, loss below zero
  // Green fill: from zero line up to payoff line where pnl > 0
  const profitStartX = toX(breakEven);
  const profitY = toY(maxProfit);
  const fillAbove = `M${profitStartX.toFixed(1)},${zeroY.toFixed(1)} L${toX(sellStrike).toFixed(1)},${profitY.toFixed(1)} L${toX(hi).toFixed(1)},${profitY.toFixed(1)} L${toX(hi).toFixed(1)},${zeroY.toFixed(1)} Z`;

  // Red fill: from zero line down to payoff line where pnl < 0
  const lossY = toY(maxLoss);
  const fillBelow = `M${toX(lo).toFixed(1)},${zeroY.toFixed(1)} L${toX(lo).toFixed(1)},${lossY.toFixed(1)} L${toX(buyStrike).toFixed(1)},${lossY.toFixed(1)} L${profitStartX.toFixed(1)},${zeroY.toFixed(1)} Z`;

  // Expected move from IV
  const soldLegs = legs.filter(l => l.action === "sell");
  const avgIV = soldLegs.length > 0
    ? soldLegs.reduce((sum, l) => sum + (Number(l.impliedVolatility) || 0), 0) / soldLegs.length
    : legs.reduce((sum, l) => sum + (Number(l.impliedVolatility) || 0), 0) / legs.length;
  const dte = daysUntil(entry.expirationDate);
  const em = price != null ? price * avgIV * Math.sqrt(Math.max(dte, 1) / 365) : 0;
  const emLo = price != null ? price - em : 0;
  const emHi = price != null ? price + em : 0;

  // Y-axis ticks
  const yTicks: number[] = [];
  const yStep = Math.ceil(pnlRange / 4 / 50) * 50 || 100;
  const yStart = Math.ceil(yMin / yStep) * yStep;
  for (let v = yStart; v <= yMax; v += yStep) {
    yTicks.push(v);
  }
  if (!yTicks.includes(0) && yMin < 0 && yMax > 0) yTicks.push(0);
  yTicks.sort((a, b) => a - b);

  return (
    <div className="mt-3" data-testid="journal-payoff-diagram">
      <div className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
        <Crosshair className="w-3 h-3" />
        P&L at Expiration
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
        {/* Expected move shading (clamp to visible range) */}
        {price != null && emLo < hi && emHi > lo && (
          <rect
            x={toX(Math.max(emLo, lo))} y={pad.top}
            width={toX(Math.min(emHi, hi)) - toX(Math.max(emLo, lo))} height={cH}
            fill="hsl(217, 91%, 60%)" opacity={0.06} rx={2}
          />
        )}

        {/* Grid lines */}
        {yTicks.map((v) => (
          <line key={v}
            x1={pad.left} x2={W - pad.right}
            y1={toY(v)} y2={toY(v)}
            stroke="hsl(var(--border))"
            strokeWidth={v === 0 ? 1 : 0.5}
            strokeDasharray={v === 0 ? "none" : "2 2"}
          />
        ))}

        {/* Profit / Loss fills */}
        <path d={fillAbove} fill="hsl(142, 71%, 45%)" opacity={0.15} />
        <path d={fillBelow} fill="hsl(0, 72%, 51%)" opacity={0.15} />

        {/* Payoff line */}
        <path d={pathD} fill="none" stroke="hsl(var(--foreground))" strokeWidth={1.5} />

        {/* Underlying price line */}
        {price != null && (
          <>
            <line
              x1={toX(price)} y1={pad.top} x2={toX(price)} y2={pad.top + cH}
              stroke="hsl(var(--muted-foreground))" strokeWidth={0.75} strokeDasharray="3 3"
            />
            <text x={toX(price)} y={pad.top + cH + 12} textAnchor="middle" fontSize={9} fill="hsl(var(--muted-foreground))">
              {fmt$(price)}
            </text>
          </>
        )}

        {/* Expected move range labels */}
        {price != null && emLo > lo && (
          <>
            <line x1={toX(emLo)} y1={pad.top} x2={toX(emLo)} y2={pad.top + cH} stroke="hsl(217, 91%, 60%)" strokeWidth={0.5} strokeDasharray="2 2" />
            <text x={toX(emLo)} y={pad.top - 3} textAnchor="middle" fontSize={8} fill="hsl(217, 91%, 60%)">
              EM {fmt$(emLo)}
            </text>
          </>
        )}
        {price != null && emHi < hi && (
          <>
            <line x1={toX(emHi)} y1={pad.top} x2={toX(emHi)} y2={pad.top + cH} stroke="hsl(217, 91%, 60%)" strokeWidth={0.5} strokeDasharray="2 2" />
            <text x={toX(emHi)} y={pad.top - 3} textAnchor="middle" fontSize={8} fill="hsl(217, 91%, 60%)">
              EM {fmt$(emHi)}
            </text>
          </>
        )}

        {/* Break-even marker */}
        {breakEven > lo && breakEven < hi && (
          <g>
            <line x1={toX(breakEven)} y1={zeroY - 4} x2={toX(breakEven)} y2={zeroY + 4} stroke="hsl(43, 74%, 49%)" strokeWidth={2} />
            <text x={toX(breakEven)} y={pad.top + cH + 22} textAnchor="middle" fontSize={8} fill="hsl(43, 74%, 49%)">
              BE {fmt$(breakEven)}
            </text>
          </g>
        )}

        {/* Strike markers */}
        {legs.filter(l => l.action === "sell").map((leg, i) => Number(leg.strikePrice) > lo && Number(leg.strikePrice) < hi && (
          <g key={`s${i}`}>
            <line x1={toX(Number(leg.strikePrice))} y1={pad.top + cH - 2} x2={toX(Number(leg.strikePrice))} y2={pad.top + cH + 3} stroke="hsl(142, 71%, 45%)" strokeWidth={1.5} />
          </g>
        ))}
        {legs.filter(l => l.action === "buy").map((leg, i) => Number(leg.strikePrice) > lo && Number(leg.strikePrice) < hi && (
          <g key={`b${i}`}>
            <line x1={toX(Number(leg.strikePrice))} y1={pad.top + cH - 2} x2={toX(Number(leg.strikePrice))} y2={pad.top + cH + 3} stroke="hsl(0, 72%, 51%)" strokeWidth={1.5} />
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
            Max {fmt$(Math.abs(minPnl))}
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
          Entry Price
        </span>
      </div>
    </div>
  );
}

// ── Compute position-level greeks from legs ──
function computePositionGreeks(entry: JournalEntry) {
  let delta = 0, theta = 0, gamma = 0, vega = 0, pop = 0;
  const legs = entry.legs ?? [];

  let hasGreeks = false;
  for (const leg of legs) {
    const mult = leg.action === "sell" ? -1 : 1;
    const d = Number(leg.delta) || 0;
    const t = Number(leg.theta) || 0;
    const g = Number(leg.gamma) || 0;
    const v = Number(leg.vega) || 0;
    if (d !== 0 || t !== 0 || g !== 0 || v !== 0) hasGreeks = true;
    delta += d * mult;
    theta += t * mult;
    gamma += g * mult;
    vega += v * mult;
  }

  // Estimate greeks when legs are empty or all greeks are zero
  if (!hasGreeks && entry.entryCredit > 0 && Math.abs(entry.maxLoss) > 0) {
    const expDate = new Date(entry.expirationDate);
    const dte = Math.max(1, Math.ceil((expDate.getTime() - Date.now()) / 86400000));
    const spreadW = entry.spreadWidth ?? (Math.abs(entry.maxLoss) + entry.entryCredit);
    const creditRatio = entry.entryCredit / spreadW;
    const estShortDelta = -(creditRatio + 0.20);
    const estLongDelta = estShortDelta * 0.5;

    if (entry.strategyType === "cash_secured_put") {
      delta = estShortDelta * -1;
      theta = entry.entryCredit / dte;
      gamma = -0.01;
      vega = -0.05;
    } else if (entry.strategyType === "put_credit_spread" || entry.strategyType === "call_credit_spread") {
      delta = (estShortDelta * -1) + (estLongDelta * 1);
      theta = entry.entryCredit / dte;
      gamma = -0.005;
      vega = -0.03;
    } else {
      delta = 0;
      theta = entry.entryCredit / dte;
      gamma = -0.008;
      vega = -0.04;
    }
    hasGreeks = true;
  }

  if (!hasGreeks) return null;

  // POP estimate: for credit spreads, use the short leg delta
  const sellLegs = legs.filter(l => l.action === "sell");
  if (sellLegs.length > 0) {
    const totalShortDelta = sellLegs.reduce((s, l) => s + Math.abs(Number(l.delta) || 0), 0);
    if (totalShortDelta > 0) {
      pop = (1 - totalShortDelta / sellLegs.length) * 100;
    }
  }
  // Estimate POP when legs are missing or have no delta
  if (pop === 0 && entry.entryCredit > 0 && Math.abs(entry.maxLoss) > 0) {
    const spreadW = entry.spreadWidth ?? (Math.abs(entry.maxLoss) + entry.entryCredit);
    pop = (1 - entry.entryCredit / spreadW) * 100;
  }

  return {
    delta: +delta.toFixed(4),
    theta: +theta.toFixed(4),
    gamma: +gamma.toFixed(6),
    vega: +vega.toFixed(4),
    pop: +pop.toFixed(1),
  };
}

// ── Greeks stat badge ──
function GreekBadge({ label, value, suffix, positive, className }: {
  label: string; value: string; suffix?: string; positive?: boolean | null; className?: string;
}) {
  const colorClass = positive === true ? "text-emerald-400" : positive === false ? "text-red-400" : "text-foreground";
  return (
    <div className={`rounded-md bg-muted/60 px-2 py-1 text-center min-w-[60px] ${className ?? ""}`}>
      <div className="text-[10px] text-muted-foreground leading-tight">{label}</div>
      <div className={`text-xs font-semibold tabular-nums leading-tight ${colorClass}`}>
        {value}{suffix && <span className="text-[10px] text-muted-foreground font-normal">{suffix}</span>}
      </div>
    </div>
  );
}

// ── Open Position Card ──
function OpenPositionCard({ entry, onClose, onEdit, onDelete }: { entry: JournalEntry; onClose: (e: JournalEntry) => void; onEdit: (e: JournalEntry) => void; onDelete: (id: number) => void }) {
  const [showPayoff, setShowPayoff] = useState(false);
  const dte = daysUntil(entry.expirationDate);
  const Icon = STRATEGY_ICONS[entry.strategyType] || TrendingDown;
  const greeks = computePositionGreeks(entry);
  const maxProfit = entry.entryCredit * 100;
  const maxLossAbs = Math.abs(entry.maxLoss) * 100;
  const isSeller = (entry.legs ?? []).some(l => l.action === "sell");

  return (
    <div style={showPayoff ? { gridColumn: '1 / -1' } : undefined}>
    <Card className="p-3 hover:shadow-sm transition-shadow" data-testid={`card-open-${entry.id}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm">{entry.ticker}</span>
          <Badge className={`text-xs ${STRATEGY_COLORS[entry.strategyType]}`}>
            <Icon className="w-3 h-3 mr-1" />{STRATEGY_SHORT[entry.strategyType]}
          </Badge>
          <Badge variant="outline" className={`${STATUS_COLORS.open} ${dte <= 7 ? "!border-orange-500/50 !text-orange-400" : ""}`}>
            <Clock className="w-3 h-3 mr-1" />{dte}d left
          </Badge>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <Button size="sm" variant={showPayoff ? "secondary" : "ghost"}
            onClick={() => setShowPayoff(!showPayoff)}
            className="text-xs h-7 px-2" data-testid={`button-payoff-${entry.id}`}>
            <Crosshair className="w-3 h-3 mr-1" /> P&L
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onEdit(entry)}
            className="text-xs h-7 px-2" data-testid={`button-edit-${entry.id}`}>
            <Edit3 className="w-3 h-3 mr-1" /> Edit
          </Button>
          <Button size="sm" variant="outline" onClick={() => onClose(entry)}
            className="text-xs" data-testid={`button-close-${entry.id}`}>
            Close
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDelete(entry.id)}
            className="text-xs text-destructive hover:text-destructive" data-testid={`button-delete-open-${entry.id}`}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Core trade info */}
      <div className="grid grid-cols-4 gap-2 text-xs mb-2">
        <div>
          <div className="text-muted-foreground">Credit</div>
          <div className="font-medium tabular-nums">{fmt$(entry.entryCredit)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Contracts</div>
          <div className="font-medium tabular-nums">{entry.contracts}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Max Profit</div>
          <div className="font-medium tabular-nums text-emerald-400">{fmt$(maxProfit)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Max Loss</div>
          <div className="font-medium tabular-nums text-red-400">{entry.maxLoss === -999999 ? "Undef." : fmt$(maxLossAbs)}</div>
        </div>
      </div>

      {/* Greeks & key metrics badges */}
      {greeks && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {greeks.pop > 0 && (
            <GreekBadge label="POP" value={`${greeks.pop.toFixed(0)}%`}
              positive={greeks.pop >= 60} />
          )}
          <GreekBadge label="Delta (Δ)" value={greeks.delta.toFixed(2)}
            positive={null} />
          <GreekBadge label="Theta (Θ)" value={`$${(greeks.theta * entry.contracts * 100).toFixed(0)}`} suffix="/day"
            positive={isSeller ? greeks.theta < 0 : greeks.theta > 0} />
          <GreekBadge label="Gamma (Γ)" value={greeks.gamma.toFixed(4)}
            positive={null} />
          <GreekBadge label="Vega (ν)" value={greeks.vega.toFixed(2)}
            positive={null} />
          {entry.ivRankAtEntry != null && (
            <GreekBadge label="IVR Entry" value={`${Math.round(entry.ivRankAtEntry)}%`}
              positive={entry.ivRankAtEntry >= 30} />
          )}
          <GreekBadge label="DTE" value={`${dte}`} suffix="d"
            positive={dte > 14 ? true : dte > 7 ? null : false} />
          {entry.compositeScoreAtEntry != null && (
            <GreekBadge label="Score" value={entry.compositeScoreAtEntry.toFixed(1)}
              positive={entry.compositeScoreAtEntry >= 70} />
          )}
        </div>
      )}

      {/* Leg details */}
      {(entry.legs ?? []).length > 0 && (
        <div className="text-[10px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
          {(entry.legs ?? []).map((leg, i) => (
            <span key={i} className={leg.action === "sell" ? "text-emerald-400/80" : "text-red-400/80"}>
              {leg.action === "sell" ? "S" : "B"} {leg.strikePrice} {leg.contractType?.charAt(0).toUpperCase() ?? "?"} @ {fmt$(Number(leg.midpoint) || 0)}
            </span>
          ))}
          <span>Exp {entry.expirationDate}</span>
        </div>
      )}

      {showPayoff && entry.legs?.length > 0 && (
        <JournalPayoffDiagram entry={entry} />
      )}

      {entry.notes && (
        <div className="text-xs text-muted-foreground mt-2 border-t border-border pt-1.5 line-clamp-2">
          {entry.notes}
        </div>
      )}
    </Card>
    </div>
  );
}

// ── Closed Trade Row ──
function ClosedTradeRow({ entry, onDelete, onEdit }: { entry: JournalEntry; onDelete: (id: number) => void; onEdit: (e: JournalEntry) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [showPayoff, setShowPayoff] = useState(false);
  const pnl = entry.pnlTotal ?? 0;
  const isWin = pnl > 0;
  const daysHeld = entry.exitDate ? daysBetween(entry.entryDate, entry.exitDate) : 0;

  return (
    <div data-testid={`row-closed-${entry.id}`}>
      <div
        className={`flex items-center gap-3 px-3 py-2 text-xs cursor-pointer hover:bg-accent/50 transition-colors rounded ${
          isWin ? "border-l-2 border-l-profit" : "border-l-2 border-l-loss"
        }`}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="font-semibold w-14">{entry.ticker}</div>
        <Badge className={`text-xs ${STRATEGY_COLORS[entry.strategyType]}`}>
          {STRATEGY_SHORT[entry.strategyType]}
        </Badge>
        <Badge variant="outline" className={`text-xs ${STATUS_COLORS[entry.status]}`}>
          {entry.status}
        </Badge>
        <div className="text-muted-foreground tabular-nums hidden sm:block">{entry.entryDate}</div>
        <div className="text-muted-foreground tabular-nums hidden sm:block">→ {entry.exitDate}</div>
        <div className="text-muted-foreground tabular-nums hidden sm:block">{daysHeld}d</div>
        <div className="ml-auto flex items-center gap-3">
          <span className={`font-semibold tabular-nums ${isWin ? "text-profit" : "text-loss"}`}>
            {fmtPnL(pnl)}
          </span>
          <span className={`tabular-nums ${isWin ? "text-profit" : "text-loss"}`}>
            {entry.pnlPercent != null ? fmtPct(entry.pnlPercent) : ""}
          </span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </div>

      {expanded && (() => {
        const greeks = computePositionGreeks(entry);
        return (
        <div className="px-3 py-2 bg-accent/20 rounded-b text-xs space-y-1.5 mb-1">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div><span className="text-muted-foreground">Entry Credit:</span> {fmt$(entry.entryCredit)}</div>
            <div><span className="text-muted-foreground">Exit Debit:</span> {fmt$(entry.exitDebit ?? 0)}</div>
            <div><span className="text-muted-foreground">Contracts:</span> {entry.contracts}</div>
            <div><span className="text-muted-foreground">P&L/Contract:</span> <span className={isWin ? "text-profit" : "text-loss"}>{fmtPnL(entry.pnlPerContract ?? 0)}</span></div>
            {entry.underlyingPriceAtEntry != null && <div><span className="text-muted-foreground">Entry Price:</span> {fmt$(entry.underlyingPriceAtEntry)}</div>}
            {entry.underlyingPriceAtExit != null && <div><span className="text-muted-foreground">Exit Price:</span> {fmt$(entry.underlyingPriceAtExit)}</div>}
            {entry.compositeScoreAtEntry != null && <div><span className="text-muted-foreground">Score:</span> {entry.compositeScoreAtEntry.toFixed(1)}</div>}
            {entry.ivRankAtEntry != null && <div><span className="text-muted-foreground">IVR:</span> {Math.round(entry.ivRankAtEntry)}%</div>}
          </div>
          {/* Greeks snapshot at entry */}
          {greeks && (
            <div className="border-t border-border pt-1.5">
              <div className="text-[10px] text-muted-foreground mb-1 font-medium">Greeks at Entry</div>
              <div className="flex flex-wrap gap-1.5">
                {greeks.pop > 0 && <GreekBadge label="POP" value={`${greeks.pop.toFixed(0)}%`} positive={greeks.pop >= 60} />}
                <GreekBadge label="Delta" value={greeks.delta.toFixed(2)} positive={null} />
                <GreekBadge label="Theta" value={`$${(greeks.theta * entry.contracts * 100).toFixed(0)}`} suffix="/day" positive={null} />
                <GreekBadge label="Gamma" value={greeks.gamma.toFixed(4)} positive={null} />
                <GreekBadge label="Vega" value={greeks.vega.toFixed(2)} positive={null} />
              </div>
            </div>
          )}
          {/* Leg details */}
          {entry.legs?.length > 0 && (
            <div className="border-t border-border pt-1.5">
              <div className="text-[10px] text-muted-foreground mb-1 font-medium">Legs</div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
                {entry.legs.map((leg, i) => (
                  <span key={i} className={leg.action === "sell" ? "text-emerald-400/80" : "text-red-400/80"}>
                    {leg.action === "sell" ? "Sell" : "Buy"} {leg.strikePrice} {leg.contractType?.charAt(0).toUpperCase() ?? "?"} @ {fmt$(Number(leg.midpoint) || 0)}
                    {(leg.delta != null || leg.theta != null) && ` (Δ${(Number(leg.delta) || 0).toFixed(2)} Θ${(Number(leg.theta) || 0).toFixed(3)})`}
                  </span>
                ))}
              </div>
            </div>
          )}
          {entry.notes && (
            <div className="text-muted-foreground border-t border-border pt-1.5 whitespace-pre-wrap">{entry.notes}</div>
          )}
          {showPayoff && entry.legs?.length > 0 && (
            <JournalPayoffDiagram entry={entry} />
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant={showPayoff ? "secondary" : "ghost"} size="sm" className="text-xs"
              onClick={(e) => { e.stopPropagation(); setShowPayoff(!showPayoff); }}
              data-testid={`button-payoff-closed-${entry.id}`}>
              <Crosshair className="w-3 h-3 mr-1" /> P&L
            </Button>
            <Button variant="ghost" size="sm" className="text-xs"
              onClick={(e) => { e.stopPropagation(); onEdit(entry); }}
              data-testid={`button-edit-closed-${entry.id}`}>
              <Edit3 className="w-3 h-3 mr-1" /> Edit
            </Button>
            <Button variant="ghost" size="sm" className="text-xs text-destructive hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }}
              data-testid={`button-delete-${entry.id}`}>
              <Trash2 className="w-3 h-3 mr-1" /> Delete
            </Button>
          </div>
        </div>
        );
      })()}
    </div>
  );
}

// ── Main Journal Page ──
export default function JournalPage() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const [closingEntry, setClosingEntry] = useState<JournalEntry | null>(null);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const journalUrl = statusFilter !== "all" ? `/api/journal?status=${statusFilter}` : "/api/journal";
  const { data: journalData, isLoading, isError: journalError } = useQuery<{ entries: JournalEntry[]; total: number }>({
    queryKey: ["/api/journal", statusFilter],
    queryFn: async () => {
      const res = await apiRequest("GET", journalUrl);
      return res.json();
    },
  });

  const { data: stats, isError: statsError } = useQuery<JournalStats>({
    queryKey: ["/api/journal/stats"],
  });

  const { data: greeksData, isError: greeksError } = useQuery<PortfolioGreeks>({
    queryKey: ["/api/journal/greeks"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/journal/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/journal"] });
      queryClient.invalidateQueries({ queryKey: ["/api/journal/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/journal/greeks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/journal/logged-ids"] });
      toast({ title: "Deleted", description: "Trade removed from journal" });
      setDeleteConfirmId(null);
    },
  });

  const entries = journalData?.entries ?? [];
  const openEntries = entries.filter(e => e.status === "open");
  const closedEntries = entries.filter(e => e.status !== "open");

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-1.5" data-testid="button-back">
                <ArrowLeft className="w-4 h-4" /> Scanner
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              <h1 className="text-sm font-semibold">Trade Journal</h1>
            </div>
          </div>
          <Button size="sm" onClick={() => setShowAddDialog(true)} data-testid="button-add-manual">
            <Plus className="w-4 h-4 mr-1" /> Add Trade
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-4 space-y-4">
        {/* Performance KPIs */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2" data-testid="kpi-section">
            <KPICard label="Total P&L" value={fmtPnL(stats.totalPnL)} icon={DollarSign}
              color={stats.totalPnL >= 0 ? "text-profit" : "text-loss"}
              sub={`${stats.closedTrades} closed`} />
            <KPICard label="Win Rate" value={`${stats.winRate.toFixed(1)}%`} icon={Trophy}
              color={stats.winRate >= 50 ? "text-profit" : "text-loss"}
              sub={`${stats.wins}W – ${stats.losses}L`} />
            <KPICard label="Open" value={String(stats.openTrades)} icon={Clock}
              sub={`of ${stats.totalTrades} total`} />
            <KPICard label="Avg Days Held" value={stats.avgDaysHeld.toFixed(0)} icon={Calendar}
              sub="per trade" />
            <KPICard label="Profit Factor" value={stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2)}
              icon={BarChart3} color={stats.profitFactor >= 1 ? "text-profit" : "text-loss"}
              sub="win$ / loss$" />
            <KPICard label="Premium Collected" value={`$${stats.totalPremiumCollected.toFixed(0)}`}
              icon={DollarSign} sub="total credit" />
          </div>
        )}

        {/* Strategy Breakdown */}
        {stats && Object.keys(stats.byStrategy).length > 0 && (
          <Card className="p-3" data-testid="strategy-breakdown">
            <div className="text-xs font-medium mb-2">Performance by Strategy</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Object.entries(stats.byStrategy).map(([key, s]) => (
                <div key={key} className="flex items-center justify-between text-xs p-2 rounded bg-accent/30">
                  <div className="flex items-center gap-1.5">
                    <Badge className={`text-xs ${STRATEGY_COLORS[key]}`}>
                      {STRATEGY_SHORT[key]}
                    </Badge>
                    <span className="text-muted-foreground">{s.trades} trades</span>
                  </div>
                  <div className="text-right">
                    <div className={`font-medium tabular-nums ${s.totalPnL >= 0 ? "text-profit" : "text-loss"}`}>
                      {fmtPnL(s.totalPnL)}
                    </div>
                    <div className="text-muted-foreground">{s.winRate.toFixed(0)}% WR</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Portfolio Greeks Dashboard */}
        {greeksData && greeksData.positions.length > 0 && (
          <PortfolioGreeksPanel greeks={greeksData} />
        )}

        {/* Open Positions */}
        {openEntries.length > 0 && (
          <div data-testid="section-open">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-blue-500" />
              <h2 className="text-sm font-semibold">Open Positions</h2>
              <Badge variant="outline" className="text-xs">{openEntries.length}</Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {openEntries.map(e => (
                <OpenPositionCard key={e.id} entry={e} onClose={setClosingEntry} onEdit={setEditingEntry} onDelete={setDeleteConfirmId} />
              ))}
            </div>
          </div>
        )}

        {/* Trade History */}
        <div data-testid="section-history">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Trade History</h2>
            </div>
            <Tabs value={statusFilter} onValueChange={setStatusFilter}>
              <TabsList className="h-7">
                <TabsTrigger value="all" className="text-xs px-2 h-5">All</TabsTrigger>
                <TabsTrigger value="open" className="text-xs px-2 h-5">Open</TabsTrigger>
                <TabsTrigger value="closed" className="text-xs px-2 h-5">Closed</TabsTrigger>
                <TabsTrigger value="expired" className="text-xs px-2 h-5">Expired</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {journalError ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Failed to load journal entries. Please refresh the page.
            </Card>
          ) : isLoading ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">Loading journal...</Card>
          ) : entries.length === 0 ? (
            <Card className="p-8 text-center" data-testid="empty-state">
              <BookOpen className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <div className="text-sm font-medium mb-1">No trades logged yet</div>
              <div className="text-xs text-muted-foreground mb-3">
                Log trades from the scanner or add them manually to start tracking your performance.
              </div>
              <Button size="sm" onClick={() => setShowAddDialog(true)}>
                <Plus className="w-4 h-4 mr-1" /> Log Your First Trade
              </Button>
            </Card>
          ) : (
            <Card className="divide-y divide-border" data-testid="trade-history-list">
              {/* Column headers for desktop */}
              <div className="hidden sm:flex items-center gap-3 px-3 py-1.5 text-xs text-muted-foreground font-medium">
                <div className="w-14">Ticker</div>
                <div className="w-12">Type</div>
                <div className="w-16">Status</div>
                <div>Entry</div>
                <div>Exit</div>
                <div>Held</div>
                <div className="ml-auto flex items-center gap-3">
                  <span>P&L</span>
                  <span>Return</span>
                  <span className="w-3.5" />
                </div>
              </div>
              {entries.map(e => (
                e.status === "open" ? (
                  <div key={e.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                    <div className="font-semibold w-14">{e.ticker}</div>
                    <Badge className={`text-xs ${STRATEGY_COLORS[e.strategyType]}`}>
                      {STRATEGY_SHORT[e.strategyType]}
                    </Badge>
                    <Badge variant="outline" className={`text-xs ${STATUS_COLORS.open}`}>open</Badge>
                    <div className="text-muted-foreground tabular-nums hidden sm:block">{e.entryDate}</div>
                    <div className="text-muted-foreground hidden sm:block">—</div>
                    <div className="text-muted-foreground tabular-nums hidden sm:block">{daysUntil(e.expirationDate)}d left</div>
                    <div className="ml-auto flex gap-1.5">
                      <Button size="sm" variant="ghost" className="text-xs h-6"
                        onClick={() => setEditingEntry(e)}><Edit3 className="w-3 h-3 mr-1" />Edit</Button>
                      <Button size="sm" variant="outline" className="text-xs h-6"
                        onClick={() => setClosingEntry(e)}>Close</Button>
                      <Button size="sm" variant="ghost" className="text-xs h-6 text-destructive hover:text-destructive"
                        onClick={() => setDeleteConfirmId(e.id)} data-testid={`button-delete-hist-${e.id}`}>
                        <Trash2 className="w-3 h-3" /></Button>
                    </div>
                  </div>
                ) : (
                  <ClosedTradeRow key={e.id} entry={e} onDelete={setDeleteConfirmId} onEdit={setEditingEntry} />
                )
              ))}
            </Card>
          )}
        </div>
      </main>

      {/* Dialogs */}
      <CloseDialog entry={closingEntry} open={!!closingEntry} onClose={() => setClosingEntry(null)} />
      <EditEntryDialog entry={editingEntry} open={!!editingEntry} onClose={() => setEditingEntry(null)} />
      <AddTradeDialog open={showAddDialog} onClose={() => setShowAddDialog(false)} />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteConfirmId !== null} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Trade</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this trade? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteConfirmId !== null) deleteMutation.mutate(deleteConfirmId); }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
