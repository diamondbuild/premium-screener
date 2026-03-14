import db from "./db";
import type { StrategyTrade, StrategyType, ScanStatus, ScanRecord, WatchlistItem, InsertWatchlistItem, Alert, JournalEntry, InsertJournalEntry, CloseJournalEntry, JournalStats } from "@shared/schema";

// ── Runtime scan status (not persisted — ephemeral progress tracking) ──
let scanStatus: ScanStatus = {
  status: "idle",
  progress: 0,
  totalTickers: 0,
  scannedTickers: 0,
  lastUpdated: null,
  error: null,
};

// Restore lastUpdated from most recent completed scan
const lastScan = db.prepare(
  `SELECT completed_at FROM scan_records WHERE status = 'complete' AND completed_at IS NOT NULL ORDER BY id DESC LIMIT 1`
).get() as { completed_at: string } | undefined;
if (lastScan?.completed_at) {
  scanStatus.lastUpdated = lastScan.completed_at;
  scanStatus.status = "complete";
  scanStatus.progress = 100;
}

// ── Prepared statements ──
const insertScanRecord = db.prepare(`
  INSERT INTO scan_records (scan_date, mode, total_tickers, status, universe)
  VALUES (?, ?, ?, 'scanning', ?)
`);

const updateScanRecord = db.prepare(`
  UPDATE scan_records
  SET completed_at = ?, scanned_tickers = ?, total_trades = ?,
      csp_count = ?, pcs_count = ?, strangle_count = ?, ic_count = ?,
      avg_score = ?, avg_roc = ?, avg_pop = ?,
      duration_ms = ?, status = ?, error = ?
  WHERE id = ?
`);

const insertTrade = db.prepare(`
  INSERT OR REPLACE INTO trades (
    id, scan_id, strategy_type, underlying_ticker, underlying_price,
    legs_json, expiration_date, days_to_expiration,
    net_credit, max_profit, max_loss, break_even_low, break_even_high,
    risk_reward_ratio, probability_of_profit,
    net_delta, net_theta, net_vega, avg_iv,
    delta_z_score, annualized_roc, premium_per_day, composite_score,
    min_open_interest, total_volume, spread_width
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const deleteScanTrades = db.prepare(`DELETE FROM trades WHERE scan_id = ?`);

// ── Helper: DB row → StrategyTrade ──
function rowToTrade(row: any): StrategyTrade {
  return {
    id: row.id,
    strategyType: row.strategy_type,
    underlyingTicker: row.underlying_ticker,
    underlyingPrice: row.underlying_price,
    legs: JSON.parse(row.legs_json),
    expirationDate: row.expiration_date,
    daysToExpiration: row.days_to_expiration,
    netCredit: row.net_credit,
    maxProfit: row.max_profit,
    maxLoss: row.max_loss,
    breakEvenLow: row.break_even_low,
    breakEvenHigh: row.break_even_high,
    riskRewardRatio: row.risk_reward_ratio,
    probabilityOfProfit: row.probability_of_profit,
    netDelta: row.net_delta,
    netTheta: row.net_theta,
    netVega: row.net_vega,
    avgIV: row.avg_iv,
    deltaZScore: row.delta_z_score,
    annualizedROC: row.annualized_roc,
    premiumPerDay: row.premium_per_day,
    compositeScore: row.composite_score,
    minOpenInterest: row.min_open_interest,
    totalVolume: row.total_volume,
    spreadWidth: row.spread_width,
  };
}

function rowToScanRecord(row: any): ScanRecord {
  return {
    id: row.id,
    scanDate: row.scan_date,
    completedAt: row.completed_at,
    mode: row.mode,
    totalTickers: row.total_tickers,
    scannedTickers: row.scanned_tickers,
    totalTrades: row.total_trades,
    cspCount: row.csp_count,
    pcsCount: row.pcs_count,
    strangleCount: row.strangle_count,
    icCount: row.ic_count,
    avgScore: row.avg_score,
    avgROC: row.avg_roc,
    avgPOP: row.avg_pop,
    durationMs: row.duration_ms,
    status: row.status,
    error: row.error,
    universe: row.universe || "sp500",
  };
}

// ── Helper: DB row → Alert ──
function rowToAlert(row: any): Alert {
  return {
    id: row.id,
    watchlistId: row.watchlist_id,
    ticker: row.ticker,
    strategyType: row.strategy_type,
    tradeId: row.trade_id,
    compositeScore: row.composite_score,
    threshold: row.threshold,
    scanId: row.scan_id,
    triggeredAt: row.triggered_at,
    seen: !!row.seen,
    netCredit: row.net_credit,
    annualizedROC: row.annualized_roc,
    probabilityOfProfit: row.probability_of_profit,
    daysToExpiration: row.days_to_expiration,
    expirationDate: row.expiration_date,
  };
}

// ── Get the latest scan ID ──
function getLatestScanId(): number | null {
  const row = db.prepare(
    `SELECT id FROM scan_records WHERE status = 'complete' AND completed_at IS NOT NULL ORDER BY id DESC LIMIT 1`
  ).get() as { id: number } | undefined;
  return row?.id ?? null;
}

// ── Public storage interface ──
export const storage = {
  // ── Trade queries (always from latest scan) ──
  async getTopPicks(strategyType: StrategyType | "all", topN: number): Promise<StrategyTrade[]> {
    const scanId = getLatestScanId();
    if (!scanId) return [];

    let sql = `SELECT * FROM trades WHERE scan_id = ?`;
    const params: any[] = [scanId];

    if (strategyType !== "all") {
      sql += ` AND strategy_type = ?`;
      params.push(strategyType);
    }
    sql += ` ORDER BY composite_score DESC LIMIT ?`;
    params.push(topN);

    return db.prepare(sql).all(...params).map(rowToTrade);
  },

  async getAllResults(scanId?: number): Promise<StrategyTrade[]> {
    const id = scanId ?? getLatestScanId();
    if (!id) return [];
    return db.prepare(
      `SELECT * FROM trades WHERE scan_id = ? ORDER BY composite_score DESC`
    ).all(id).map(rowToTrade);
  },

  // ── Begin a new scan (returns scan_id) ──
  beginScan(mode: "scheduled" | "manual" | "startup", totalTickers: number, universe: string = "sp500"): number {
    const result = insertScanRecord.run(
      new Date().toISOString(),
      mode,
      totalTickers,
      universe
    );
    return Number(result.lastInsertRowid);
  },

  // ── Save results for a scan (transactional bulk insert) ──
  async saveResults(results: StrategyTrade[], scanId?: number): Promise<void> {
    // If no scanId, create one (backward-compat for demo data)
    const id = scanId ?? this.beginScan("manual", results.length);

    const insertMany = db.transaction((trades: StrategyTrade[]) => {
      deleteScanTrades.run(id); // Clear any partial results
      for (const t of trades) {
        insertTrade.run(
          t.id, id, t.strategyType, t.underlyingTicker, t.underlyingPrice,
          JSON.stringify(t.legs), t.expirationDate, t.daysToExpiration,
          t.netCredit, t.maxProfit, t.maxLoss, t.breakEvenLow, t.breakEvenHigh,
          t.riskRewardRatio, t.probabilityOfProfit,
          t.netDelta, t.netTheta, t.netVega, t.avgIV,
          t.deltaZScore, t.annualizedROC, t.premiumPerDay, t.compositeScore,
          t.minOpenInterest, t.totalVolume, t.spreadWidth
        );
      }
    });
    insertMany(results);
  },

  // ── Complete a scan with summary stats ──
  completeScan(scanId: number, results: StrategyTrade[], durationMs: number, error?: string): void {
    const csp = results.filter(r => r.strategyType === "cash_secured_put");
    const pcs = results.filter(r => r.strategyType === "put_credit_spread");
    const str = results.filter(r => r.strategyType === "strangle");
    const ic = results.filter(r => r.strategyType === "iron_condor");

    const avgScore = results.length > 0
      ? +(results.reduce((s, r) => s + r.compositeScore, 0) / results.length).toFixed(1) : 0;
    const avgROC = results.length > 0
      ? +(results.reduce((s, r) => s + r.annualizedROC, 0) / results.length).toFixed(1) : 0;
    const avgPOP = results.length > 0
      ? +(results.reduce((s, r) => s + r.probabilityOfProfit, 0) / results.length * 100).toFixed(1) : 0;

    // Look up total_tickers from the scan record instead of hardcoding
    const scanRow = db.prepare(`SELECT total_tickers FROM scan_records WHERE id = ?`).get(scanId) as any;
    const scannedTickers = scanRow?.total_tickers ?? 0;

    updateScanRecord.run(
      new Date().toISOString(),
      scannedTickers,
      results.length,
      csp.length, pcs.length, str.length, ic.length,
      avgScore, avgROC, avgPOP,
      durationMs,
      error ? "failed" : "complete",
      error || null,
      scanId
    );
  },

  async clearResults(): Promise<void> {
    // No-op for DB — we keep history
  },

  // ── Scan status (ephemeral) ──
  getScanStatus(): ScanStatus {
    return { ...scanStatus };
  },

  setScanStatus(status: Partial<ScanStatus>): void {
    scanStatus = { ...scanStatus, ...status };
  },

  // ── Scan history queries ──
  getScanHistory(limit: number = 30): ScanRecord[] {
    return db.prepare(
      `SELECT * FROM scan_records WHERE status IN ('complete', 'failed') ORDER BY id DESC LIMIT ?`
    ).all(limit).map(rowToScanRecord);
  },

  getScanById(scanId: number): ScanRecord | null {
    const row = db.prepare(`SELECT * FROM scan_records WHERE id = ?`).get(scanId);
    return row ? rowToScanRecord(row) : null;
  },

  getLatestScanId,

  // ── Watchlist ──
  getWatchlist(): WatchlistItem[] {
    return db.prepare(`SELECT * FROM watchlist ORDER BY added_at DESC`).all().map((row: any) => ({
      id: row.id,
      ticker: row.ticker,
      addedAt: row.added_at,
      scoreThreshold: row.score_threshold,
      notes: row.notes,
    }));
  },

  addToWatchlist(item: InsertWatchlistItem): WatchlistItem {
    const result = db.prepare(
      `INSERT INTO watchlist (ticker, added_at, score_threshold, notes) VALUES (?, ?, ?, ?)`
    ).run(item.ticker.toUpperCase(), new Date().toISOString(), item.scoreThreshold, item.notes);
    const row = db.prepare(`SELECT * FROM watchlist WHERE id = ?`).get(Number(result.lastInsertRowid)) as any;
    return { id: row.id, ticker: row.ticker, addedAt: row.added_at, scoreThreshold: row.score_threshold, notes: row.notes };
  },

  updateWatchlistItem(id: number, updates: { scoreThreshold?: number | null; notes?: string | null }): WatchlistItem | null {
    const existing = db.prepare(`SELECT * FROM watchlist WHERE id = ?`).get(id) as any;
    if (!existing) return null;
    db.prepare(
      `UPDATE watchlist SET score_threshold = ?, notes = ? WHERE id = ?`
    ).run(
      updates.scoreThreshold !== undefined ? updates.scoreThreshold : existing.score_threshold,
      updates.notes !== undefined ? updates.notes : existing.notes,
      id
    );
    const row = db.prepare(`SELECT * FROM watchlist WHERE id = ?`).get(id) as any;
    return { id: row.id, ticker: row.ticker, addedAt: row.added_at, scoreThreshold: row.score_threshold, notes: row.notes };
  },

  removeFromWatchlist(id: number): boolean {
    const result = db.prepare(`DELETE FROM watchlist WHERE id = ?`).run(id);
    return result.changes > 0;
  },

  isOnWatchlist(ticker: string): boolean {
    const row = db.prepare(`SELECT id FROM watchlist WHERE ticker = ?`).get(ticker.toUpperCase());
    return !!row;
  },

  // ── Alerts ──
  getAlerts(limit: number = 50, unseenOnly: boolean = false): Alert[] {
    const where = unseenOnly ? `WHERE seen = 0` : ``;
    return db.prepare(
      `SELECT * FROM alerts ${where} ORDER BY triggered_at DESC LIMIT ?`
    ).all(limit).map(rowToAlert);
  },

  getUnseenAlertCount(): number {
    const row = db.prepare(`SELECT COUNT(*) as cnt FROM alerts WHERE seen = 0`).get() as { cnt: number };
    return row.cnt;
  },

  markAlertsSeen(alertIds?: number[]): void {
    if (alertIds && alertIds.length > 0) {
      const placeholders = alertIds.map(() => "?").join(",");
      db.prepare(`UPDATE alerts SET seen = 1 WHERE id IN (${placeholders})`).run(...alertIds);
    } else {
      db.prepare(`UPDATE alerts SET seen = 1 WHERE seen = 0`).run();
    }
  },

  deleteAlert(id: number): boolean {
    return db.prepare(`DELETE FROM alerts WHERE id = ?`).run(id).changes > 0;
  },

  // Check for alert triggers after a scan and insert matching alerts
  checkAlerts(scanId: number): Alert[] {
    const watchlist = this.getWatchlist();
    const triggered: Alert[] = [];

    for (const item of watchlist) {
      if (item.scoreThreshold == null) continue;

      // Find trades for this ticker in the latest scan that exceed the threshold
      const matchingTrades = db.prepare(
        `SELECT * FROM trades WHERE scan_id = ? AND underlying_ticker = ? AND composite_score >= ? ORDER BY composite_score DESC`
      ).all(scanId, item.ticker, item.scoreThreshold) as any[];

      for (const trade of matchingTrades) {
        // Check if we already alerted on this exact trade in this scan
        const exists = db.prepare(
          `SELECT id FROM alerts WHERE trade_id = ? AND scan_id = ?`
        ).get(trade.id, scanId);
        if (exists) continue;

        const result = db.prepare(
          `INSERT INTO alerts (watchlist_id, ticker, strategy_type, trade_id, composite_score, threshold, scan_id, triggered_at, seen, net_credit, annualized_roc, probability_of_profit, days_to_expiration, expiration_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`
        ).run(
          item.id, item.ticker, trade.strategy_type, trade.id,
          trade.composite_score, item.scoreThreshold, scanId,
          new Date().toISOString(),
          trade.net_credit, trade.annualized_roc, trade.probability_of_profit,
          trade.days_to_expiration, trade.expiration_date
        );

        const alertRow = db.prepare(`SELECT * FROM alerts WHERE id = ?`).get(Number(result.lastInsertRowid)) as any;
        if (alertRow) triggered.push(rowToAlert(alertRow));
      }
    }

    return triggered;
  },

  // ── Trade Journal ──
  _rowToJournal(row: any): JournalEntry {
    return {
      id: row.id,
      ticker: row.ticker,
      strategyType: row.strategy_type,
      legs: JSON.parse(row.legs_json),
      expirationDate: row.expiration_date,
      entryDate: row.entry_date,
      entryCredit: row.entry_credit,
      contracts: row.contracts,
      underlyingPriceAtEntry: row.underlying_price_at_entry,
      status: row.status,
      exitDate: row.exit_date,
      exitDebit: row.exit_debit,
      pnlPerContract: row.pnl_per_contract,
      pnlTotal: row.pnl_total,
      pnlPercent: row.pnl_percent,
      underlyingPriceAtExit: row.underlying_price_at_exit,
      maxLoss: row.max_loss,
      spreadWidth: row.spread_width,
      compositeScoreAtEntry: row.composite_score_at_entry,
      ivRankAtEntry: row.iv_rank_at_entry,
      scanTradeId: row.scan_trade_id,
      notes: row.notes,
      tags: JSON.parse(row.tags_json || '[]'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  },

  getJournalEntries(status?: string): JournalEntry[] {
    let sql = `SELECT * FROM journal_entries`;
    const params: any[] = [];
    if (status && status !== 'all') {
      sql += ` WHERE status = ?`;
      params.push(status);
    }
    sql += ` ORDER BY entry_date DESC, created_at DESC`;
    return db.prepare(sql).all(...params).map((r: any) => this._rowToJournal(r));
  },

  getJournalEntry(id: number): JournalEntry | null {
    const row = db.prepare(`SELECT * FROM journal_entries WHERE id = ?`).get(id);
    return row ? this._rowToJournal(row) : null;
  },

  addJournalEntry(entry: InsertJournalEntry): JournalEntry {
    const now = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO journal_entries (
        ticker, strategy_type, legs_json, expiration_date,
        entry_date, entry_credit, contracts, underlying_price_at_entry,
        status, max_loss, spread_width,
        composite_score_at_entry, iv_rank_at_entry, scan_trade_id,
        notes, tags_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.ticker.toUpperCase(),
      entry.strategyType,
      JSON.stringify(entry.legs),
      entry.expirationDate,
      entry.entryDate,
      entry.entryCredit,
      entry.contracts,
      entry.underlyingPriceAtEntry,
      entry.maxLoss,
      entry.spreadWidth,
      entry.compositeScoreAtEntry,
      entry.ivRankAtEntry,
      entry.scanTradeId,
      entry.notes,
      JSON.stringify(entry.tags),
      now, now
    );
    return this.getJournalEntry(Number(result.lastInsertRowid))!;
  },

  closeJournalEntry(id: number, close: CloseJournalEntry): JournalEntry | null {
    const existing = this.getJournalEntry(id);
    if (!existing) return null;

    const exitDebit = close.exitDebit;
    const pnlPerContract = (existing.entryCredit - exitDebit) * 100;
    const pnlTotal = pnlPerContract * existing.contracts;
    // % return on max risk
    const maxRiskTotal = Math.abs(existing.maxLoss) * 100 * existing.contracts;
    const pnlPercent = maxRiskTotal > 0 ? (pnlTotal / maxRiskTotal) * 100 : 0;

    const exitDate = close.exitDate || new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

    // Merge notes if provided
    let notes = existing.notes || '';
    if (close.notes) {
      notes = notes ? `${notes}\n---\n${close.notes}` : close.notes;
    }

    db.prepare(`
      UPDATE journal_entries SET
        status = ?, exit_date = ?, exit_debit = ?,
        pnl_per_contract = ?, pnl_total = ?, pnl_percent = ?,
        underlying_price_at_exit = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `).run(
      close.status || 'closed',
      exitDate,
      exitDebit,
      pnlPerContract,
      pnlTotal,
      pnlPercent,
      close.underlyingPriceAtExit || null,
      notes,
      now,
      id
    );

    return this.getJournalEntry(id);
  },

  updateJournalNotes(id: number, notes: string | null, tags?: string[]): JournalEntry | null {
    const now = new Date().toISOString();
    const updates: string[] = ['notes = ?', 'updated_at = ?'];
    const params: any[] = [notes, now];
    if (tags !== undefined) {
      updates.push('tags_json = ?');
      params.push(JSON.stringify(tags));
    }
    params.push(id);
    db.prepare(`UPDATE journal_entries SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    return this.getJournalEntry(id);
  },

  updateJournalEntry(id: number, updates: { entryCredit?: number; contracts?: number }): JournalEntry | null {
    const now = new Date().toISOString();
    const sets: string[] = ['updated_at = ?'];
    const params: any[] = [now];
    if (updates.entryCredit !== undefined) {
      sets.push('entry_credit = ?');
      params.push(updates.entryCredit);
    }
    if (updates.contracts !== undefined) {
      sets.push('contracts = ?');
      params.push(updates.contracts);
    }
    params.push(id);
    db.prepare(`UPDATE journal_entries SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    return this.getJournalEntry(id);
  },

  deleteJournalEntry(id: number): boolean {
    return db.prepare(`DELETE FROM journal_entries WHERE id = ?`).run(id).changes > 0;
  },

  isTradeLogged(scanTradeId: string): boolean {
    const row = db.prepare(`SELECT id FROM journal_entries WHERE scan_trade_id = ?`).get(scanTradeId);
    return !!row;
  },

  getLoggedTradeIds(): string[] {
    const rows = db.prepare(`SELECT scan_trade_id FROM journal_entries WHERE scan_trade_id IS NOT NULL`).all() as any[];
    return rows.map(r => r.scan_trade_id);
  },

  getPortfolioGreeks(): {
    totalDelta: number; totalTheta: number; totalGamma: number; totalVega: number;
    positions: { ticker: string; strategyType: string; contracts: number; delta: number; theta: number; gamma: number; vega: number; daysToExpiration: number }[];
    bySector: Record<string, { delta: number; theta: number; count: number }>;
  } {
    const open = this.getJournalEntries('open');
    const positions = open.map(e => {
      let delta = 0, theta = 0, gamma = 0, vega = 0;
      for (const leg of e.legs) {
        const mult = leg.action === 'sell' ? -1 : 1;
        delta += leg.delta * mult * e.contracts * 100;
        theta += leg.theta * mult * e.contracts * 100;
        gamma += leg.gamma * mult * e.contracts * 100;
        vega += leg.vega * mult * e.contracts * 100;
      }
      const expDate = new Date(e.expirationDate);
      const dte = Math.max(0, Math.ceil((expDate.getTime() - Date.now()) / 86400000));
      return {
        ticker: e.ticker,
        strategyType: e.strategyType,
        contracts: e.contracts,
        delta: +delta.toFixed(2),
        theta: +theta.toFixed(2),
        gamma: +gamma.toFixed(4),
        vega: +vega.toFixed(2),
        daysToExpiration: dte,
      };
    });

    const totalDelta = +positions.reduce((s, p) => s + p.delta, 0).toFixed(2);
    const totalTheta = +positions.reduce((s, p) => s + p.theta, 0).toFixed(2);
    const totalGamma = +positions.reduce((s, p) => s + p.gamma, 0).toFixed(4);
    const totalVega = +positions.reduce((s, p) => s + p.vega, 0).toFixed(2);

    // Group by ticker for a pseudo-sector view
    const bySector: Record<string, { delta: number; theta: number; count: number }> = {};
    for (const p of positions) {
      if (!bySector[p.ticker]) bySector[p.ticker] = { delta: 0, theta: 0, count: 0 };
      bySector[p.ticker].delta += p.delta;
      bySector[p.ticker].theta += p.theta;
      bySector[p.ticker].count++;
    }

    return { totalDelta, totalTheta, totalGamma, totalVega, positions, bySector };
  },

  getJournalStats(): JournalStats {
    const all = this.getJournalEntries('all');
    const closed = all.filter(e => e.status !== 'open');
    const open = all.filter(e => e.status === 'open');
    const wins = closed.filter(e => (e.pnlTotal ?? 0) > 0);
    const losses = closed.filter(e => (e.pnlTotal ?? 0) <= 0);

    const totalPnL = closed.reduce((s, e) => s + (e.pnlTotal ?? 0), 0);
    const totalWinPnL = wins.reduce((s, e) => s + (e.pnlTotal ?? 0), 0);
    const totalLossPnL = Math.abs(losses.reduce((s, e) => s + (e.pnlTotal ?? 0), 0));

    // Days held for closed trades
    const daysHeld = closed.map(e => {
      if (!e.exitDate) return 0;
      const entry = new Date(e.entryDate);
      const exit = new Date(e.exitDate);
      return Math.max(0, Math.round((exit.getTime() - entry.getTime()) / 86400000));
    });
    const avgDaysHeld = daysHeld.length > 0 ? daysHeld.reduce((a, b) => a + b, 0) / daysHeld.length : 0;

    // By strategy breakdown
    const byStrategy: JournalStats['byStrategy'] = {};
    for (const e of closed) {
      if (!byStrategy[e.strategyType]) {
        byStrategy[e.strategyType] = { trades: 0, wins: 0, losses: 0, winRate: 0, totalPnL: 0 };
      }
      const s = byStrategy[e.strategyType];
      s.trades++;
      if ((e.pnlTotal ?? 0) > 0) s.wins++;
      else s.losses++;
      s.totalPnL += e.pnlTotal ?? 0;
      s.winRate = s.trades > 0 ? (s.wins / s.trades) * 100 : 0;
    }

    // Monthly P&L
    const monthlyMap = new Map<string, { pnl: number; trades: number; wins: number }>();
    for (const e of closed) {
      const month = (e.exitDate || e.entryDate).substring(0, 7); // YYYY-MM
      if (!monthlyMap.has(month)) monthlyMap.set(month, { pnl: 0, trades: 0, wins: 0 });
      const m = monthlyMap.get(month)!;
      m.pnl += e.pnlTotal ?? 0;
      m.trades++;
      if ((e.pnlTotal ?? 0) > 0) m.wins++;
    }
    const monthlyPnL = Array.from(monthlyMap.entries())
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Equity curve (cumulative by exit date)
    const sortedClosed = [...closed]
      .filter(e => e.exitDate)
      .sort((a, b) => (a.exitDate || '').localeCompare(b.exitDate || ''));
    let cumPnL = 0;
    const equityCurve = sortedClosed.map(e => {
      cumPnL += e.pnlTotal ?? 0;
      return { date: e.exitDate!, cumPnL };
    });

    return {
      totalTrades: all.length,
      openTrades: open.length,
      closedTrades: closed.length,
      wins: wins.length,
      losses: losses.length,
      winRate: closed.length > 0 ? (wins.length / closed.length) * 100 : 0,
      totalPnL,
      avgPnL: closed.length > 0 ? totalPnL / closed.length : 0,
      avgWin: wins.length > 0 ? totalWinPnL / wins.length : 0,
      avgLoss: losses.length > 0 ? -(totalLossPnL / losses.length) : 0,
      largestWin: wins.length > 0 ? Math.max(...wins.map(e => e.pnlTotal ?? 0)) : 0,
      largestLoss: losses.length > 0 ? Math.min(...losses.map(e => e.pnlTotal ?? 0)) : 0,
      profitFactor: totalLossPnL > 0 ? totalWinPnL / totalLossPnL : totalWinPnL > 0 ? Infinity : 0,
      totalPremiumCollected: all.reduce((s, e) => s + e.entryCredit * e.contracts * 100, 0),
      avgDaysHeld,
      byStrategy,
      monthlyPnL,
      equityCurve,
    };
  },
};
