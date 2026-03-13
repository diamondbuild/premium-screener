# Trade Journal Page Design Spec

## Overview
A dedicated /journal page that tracks opened positions, lets users mark winners/losers, and displays real performance over time. The user sells options premium (CSPs, PCS, Strangles, Iron Condors).

## Architecture
- Route: `/#/journal`
- API base: `/api/journal`
- Data types from `@shared/schema`: JournalEntry, JournalStats, InsertJournalEntry, CloseJournalEntry
- Strategy types: cash_secured_put, put_credit_spread, strangle, iron_condor

## Page Layout (single page with sections)

### Section 1: Performance Dashboard (top)
KPI cards in a row:
- Total P&L (green if positive, red if negative)
- Win Rate (wins/total closed, show as X%)
- Open Positions (count)
- Avg Days Held
- Profit Factor (total wins / total losses)
- Premium Collected (total credit * contracts * 100)

Below KPIs: Strategy breakdown table showing per-strategy win rate and P&L.

### Section 2: Open Positions
Cards showing currently open positions. Each card shows:
- Ticker, strategy badge, entry date, expiration
- Credit received, contracts, max loss
- Score at entry, IVR at entry
- DTE remaining (calculated from today vs expiration)
- "Close Position" button that opens a dialog

### Section 3: Trade History
Table/list of closed positions. Sortable columns:
- Ticker, Strategy, Entry Date, Exit Date, Days Held
- Entry Credit, Exit Debit, P&L ($), P&L (%)
- Status badge (closed, expired, assigned, rolled)
- Notes (truncated, expandable)

Color coding: Green rows for winners, red for losers.

### Close Position Dialog
When clicking "Close Position":
- Exit debit (number input, pre-filled 0 for "expired worthless")
- Exit date (date picker, default today)
- Status selector: Closed, Expired, Assigned, Rolled
- Underlying price at exit (optional)
- Notes about the trade
- "Close Position" button

### Add Manual Trade Dialog
Accessible from a "+ Add Trade" button. Fields:
- Ticker (text input)
- Strategy type (select)
- Entry date
- Expiration date
- Entry credit per contract
- Contracts
- Underlying price at entry
- Max loss per contract
- Notes

## Integration with Scanner (dashboard.tsx)
Add a "Log Trade" button on each trade card in the scanner. When clicked:
- Auto-populates all fields from the scanner trade data
- Sends POST /api/journal
- Shows success toast
- Button changes to "Logged ✓" (disabled) if already in journal

The scanner needs to fetch GET /api/journal/logged-ids on mount to know which trades are already logged.

## Color/Style Tokens
Use the same design system as the dashboard:
- Profit: text-profit (green)
- Loss: text-loss (red) 
- Strategy badges: same STRATEGY_COLORS as dashboard
- Cards: same card style
- Dark mode support

## API Endpoints
- GET /api/journal?status=open|closed|all → { entries: JournalEntry[], total: number }
- GET /api/journal/stats → JournalStats
- GET /api/journal/logged-ids → { ids: string[] }
- GET /api/journal/:id → JournalEntry
- POST /api/journal → InsertJournalEntry → JournalEntry
- PUT /api/journal/:id/close → CloseJournalEntry → JournalEntry
- PUT /api/journal/:id/notes → { notes, tags } → JournalEntry
- DELETE /api/journal/:id → { success: true }

## Key Technical Notes
- Use `useHashLocation` from wouter for routing
- Use @tanstack/react-query for data fetching (queryClient from @lib/queryClient, use apiRequest for mutations)
- Use shadcn/ui components (Card, Badge, Dialog, Button, Input, Select, Tabs, Table)
- Import icons from lucide-react
- NEVER use localStorage/sessionStorage (blocked in iframe sandbox)
- Strategy display names: { cash_secured_put: "CSP", put_credit_spread: "PCS", strangle: "Strangle", iron_condor: "IC" }
- Format currency with $ prefix, 2 decimals
- Format percentages with 1 decimal + %

