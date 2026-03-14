import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  TrendingUp,
  BarChart3,
  Zap,
  BookOpen,
  Bell,
  Target,
  ChevronDown,
  ChevronUp,
  Check,
  Activity,
  Crosshair,
  LineChart,
  ArrowRight,
  Star,
  Clock,
} from "lucide-react";

/* ───────────────────────── animations ───────────────────────── */
const fadeInUp = "animate-[fadeInUp_0.7s_ease-out_both]";
const fadeIn = "animate-[fadeIn_0.8s_ease-out_both]";

function useInView(threshold = 0.15) {
  const [ref, setRef] = useState<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(ref);
    return () => obs.disconnect();
  }, [ref, threshold]);
  return { setRef, visible };
}

function AnimatedSection({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const { setRef, visible } = useInView();
  return (
    <div
      ref={setRef}
      className={`${className} transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/* ───────────────────── SVG Logo ───────────────────── */
function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-label="Premium Screener logo">
      <rect x="2" y="2" width="28" height="28" rx="6" stroke="currentColor" strokeWidth="2" />
      <path d="M8 22 L13 14 L18 18 L24 8" stroke="rgb(52 211 153)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24" cy="8" r="2.5" fill="rgb(52 211 153)" />
    </svg>
  );
}

/* ─────────── CSS Mockup Dashboard (Hero) ─────────── */
function MockDashboardHero() {
  return (
    <div className="relative mx-auto w-full max-w-4xl perspective-[1200px]">
      <div
        className="rounded-xl border border-zinc-700/50 bg-zinc-900/90 backdrop-blur-sm overflow-hidden shadow-2xl shadow-emerald-500/5"
        style={{ transform: "rotateX(4deg) rotateY(-2deg)", transformOrigin: "center center" }}
      >
        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800 bg-zinc-900">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-600" />
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-600" />
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-600" />
          </div>
          <span className="text-[10px] text-zinc-500 ml-2 font-mono">Premium Screener — Dashboard</span>
        </div>

        <div className="p-4 space-y-3">
          {/* KPI row */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Avg ROC", value: "226%", color: "text-emerald-400" },
              { label: "Avg POP", value: "81%", color: "text-emerald-400" },
              { label: "Avg Δ Z-Score", value: "1.3σ", color: "text-emerald-400" },
              { label: "Trades Today", value: "47", color: "text-white" },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-lg bg-zinc-800/60 border border-zinc-700/40 p-2.5">
                <div className="text-[9px] text-zinc-500 uppercase tracking-wider">{kpi.label}</div>
                <div className={`text-lg font-bold tabular-nums ${kpi.color}`}>{kpi.value}</div>
              </div>
            ))}
          </div>

          {/* Strategy pills */}
          <div className="flex gap-2 flex-wrap">
            {[
              { name: "CSP", count: 12, color: "bg-blue-500" },
              { name: "PCS", count: 18, color: "bg-emerald-500" },
              { name: "Strangle", count: 9, color: "bg-purple-500" },
              { name: "IC", count: 8, color: "bg-amber-500" },
            ].map((s) => (
              <div key={s.name} className="flex items-center gap-1.5 rounded-md bg-zinc-800/40 border border-zinc-700/30 px-2.5 py-1.5">
                <div className={`w-2 h-2 rounded-sm ${s.color}`} />
                <span className="text-xs text-zinc-300 font-medium">{s.name}</span>
                <span className="text-xs text-zinc-500 tabular-nums">{s.count}</span>
              </div>
            ))}
          </div>

          {/* Trade cards */}
          <div className="space-y-1.5">
            {[
              { ticker: "NEM", score: 92, strategy: "PCS", stratColor: "bg-emerald-500", roc: "312%", pop: "86%", dz: "1.8σ", credit: "$2.45" },
              { ticker: "TSLA", score: 88, strategy: "IC", stratColor: "bg-amber-500", roc: "248%", pop: "79%", dz: "1.5σ", credit: "$4.10" },
              { ticker: "DOW", score: 85, strategy: "CSP", stratColor: "bg-blue-500", roc: "194%", pop: "84%", dz: "1.2σ", credit: "$1.80" },
            ].map((t) => (
              <div key={t.ticker} className="flex items-center justify-between rounded-lg bg-zinc-800/40 border border-zinc-700/30 p-2.5">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white w-10">{t.ticker}</span>
                    <div className={`text-[10px] px-1.5 py-0.5 rounded font-semibold text-white ${t.stratColor}`}>{t.strategy}</div>
                  </div>
                  <div className="hidden sm:flex items-center gap-3 ml-2">
                    <span className="text-[10px] text-zinc-500">ROC <span className="text-emerald-400 font-medium">{t.roc}</span></span>
                    <span className="text-[10px] text-zinc-500">POP <span className="text-zinc-300 font-medium">{t.pop}</span></span>
                    <span className="text-[10px] text-zinc-500">ΔZ <span className="text-zinc-300 font-medium">{t.dz}</span></span>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="text-xs text-emerald-400 font-mono font-semibold">{t.credit}</span>
                  <div className="flex items-center gap-1">
                    <div className="w-16 h-1.5 rounded-full bg-zinc-700 overflow-hidden">
                      <div className="h-full rounded-full score-bar" style={{ width: `${t.score}%` }} />
                    </div>
                    <span className="text-[10px] text-zinc-400 tabular-nums font-semibold w-5">{t.score}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Glow effect under the card */}
      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-3/4 h-24 bg-emerald-500/10 blur-3xl rounded-full pointer-events-none" />
    </div>
  );
}

/* ─────── Full Dashboard Preview (Section 5) ─────── */
function MockDashboardFull() {
  return (
    <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/90 overflow-hidden">
      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/80">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
        </div>
        <span className="text-[10px] text-zinc-500 ml-2 font-mono">premiumscreener.com/#/dashboard</span>
      </div>

      <div className="p-4 md:p-6 space-y-4">
        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Avg Annualized ROC", value: "226%", icon: TrendingUp, color: "text-emerald-400" },
            { label: "Avg Probability of Profit", value: "81%", icon: Target, color: "text-emerald-400" },
            { label: "Avg Delta Z-Score", value: "1.3σ", icon: Activity, color: "text-emerald-400" },
            { label: "S&P 500 Tickers Scanned", value: "497", icon: BarChart3, color: "text-white" },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-lg bg-zinc-800/60 border border-zinc-700/40 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <kpi.icon className="w-3 h-3 text-zinc-500" />
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{kpi.label}</span>
              </div>
              <span className={`text-2xl font-bold tabular-nums ${kpi.color}`}>{kpi.value}</span>
            </div>
          ))}
        </div>

        {/* Strategy summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { name: "Cash Secured Puts", short: "CSP", count: 12, winRate: "76%", color: "bg-blue-500" },
            { name: "Put Credit Spreads", short: "PCS", count: 18, winRate: "82%", color: "bg-emerald-500" },
            { name: "Strangles", short: "Strangle", count: 9, winRate: "71%", color: "bg-purple-500" },
            { name: "Iron Condors", short: "IC", count: 8, winRate: "91%", color: "bg-amber-500" },
          ].map((s) => (
            <div key={s.short} className="rounded-lg bg-zinc-800/40 border border-zinc-700/30 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className={`text-[10px] px-1.5 py-0.5 rounded font-semibold text-white ${s.color}`}>{s.short}</div>
                <span className="text-[10px] text-zinc-500">{s.count} trades</span>
              </div>
              <div className="text-xs text-zinc-400">{s.name}</div>
              <div className="text-xs text-zinc-500 mt-1">Win rate: <span className="text-emerald-400 font-medium">{s.winRate}</span></div>
            </div>
          ))}
        </div>

        {/* Trade list */}
        <div className="space-y-1.5">
          {[
            { ticker: "NEM", score: 92, strategy: "PCS", stratColor: "bg-emerald-500", roc: "312%", pop: "86%", dz: "1.8σ", credit: "$2.45", iv: 72 },
            { ticker: "TSLA", score: 88, strategy: "IC", stratColor: "bg-amber-500", roc: "248%", pop: "79%", dz: "1.5σ", credit: "$4.10", iv: 65 },
            { ticker: "DOW", score: 85, strategy: "CSP", stratColor: "bg-blue-500", roc: "194%", pop: "84%", dz: "1.2σ", credit: "$1.80", iv: 58 },
            { ticker: "AMZN", score: 83, strategy: "PCS", stratColor: "bg-emerald-500", roc: "186%", pop: "82%", dz: "1.1σ", credit: "$3.20", iv: 54 },
            { ticker: "META", score: 81, strategy: "Strangle", stratColor: "bg-purple-500", roc: "274%", pop: "73%", dz: "1.4σ", credit: "$5.60", iv: 61 },
          ].map((t) => (
            <div key={t.ticker} className="flex items-center justify-between rounded-lg bg-zinc-800/40 border border-zinc-700/30 px-3 py-2.5">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-white w-12 font-mono">{t.ticker}</span>
                <div className={`text-[10px] px-1.5 py-0.5 rounded font-semibold text-white ${t.stratColor}`}>{t.strategy}</div>
                <div className="hidden md:flex items-center gap-4 ml-1">
                  <span className="text-[10px] text-zinc-500">ROC <span className="text-emerald-400 font-medium">{t.roc}</span></span>
                  <span className="text-[10px] text-zinc-500">POP <span className="text-zinc-300 font-medium">{t.pop}</span></span>
                  <span className="text-[10px] text-zinc-500">ΔZ <span className="text-zinc-300 font-medium">{t.dz}</span></span>
                  <span className="text-[10px] text-zinc-500">IV Rank <span className="text-zinc-300 font-medium">{t.iv}</span></span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-emerald-400 font-mono font-semibold">{t.credit}</span>
                <div className="flex items-center gap-1.5">
                  <div className="w-20 h-1.5 rounded-full bg-zinc-700 overflow-hidden">
                    <div className="h-full rounded-full score-bar" style={{ width: `${t.score}%` }} />
                  </div>
                  <span className="text-xs text-zinc-300 tabular-nums font-bold w-6 text-right">{t.score}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ───────────────── FAQ item ───────────────── */
function FAQItem({ q, a, open, toggle }: { q: string; a: string; open: boolean; toggle: () => void }) {
  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between p-4 md:p-5 text-left hover:bg-zinc-800/30 transition-colors"
        data-testid={`faq-toggle-${q.slice(0, 20).replace(/\s/g, "-").toLowerCase()}`}
      >
        <span className="text-sm md:text-base font-medium text-white pr-4">{q}</span>
        {open ? <ChevronUp className="w-4 h-4 text-zinc-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />}
      </button>
      <div className={`overflow-hidden transition-all duration-300 ${open ? "max-h-48" : "max-h-0"}`}>
        <div className="px-4 md:px-5 pb-4 md:pb-5 text-sm text-zinc-400 leading-relaxed">{a}</div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   LANDING PAGE
   ═══════════════════════════════════════════════════ */
export default function LandingPage() {
  const [openFAQ, setOpenFAQ] = useState<number | null>(null);

  // Force dark mode on the landing page
  useEffect(() => {
    document.documentElement.classList.add("dark");
    return () => {
      // Restore user preference on unmount
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.classList.toggle("dark", prefersDark);
    };
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const features = [
    {
      icon: Shield,
      title: "4 Premium Strategies",
      desc: "Cash Secured Puts, Put Credit Spreads, Strangles, Iron Condors. Each optimized for premium sellers.",
    },
    {
      icon: Activity,
      title: "Delta Z-Score Ranking",
      desc: "Our proprietary scoring measures how rich current premiums are vs. the chain average. Higher Z = fatter premium.",
    },
    {
      icon: TrendingUp,
      title: "IV Rank & Earnings Integration",
      desc: "Know instantly if IV is elevated (ideal for selling) and whether earnings fall before expiry.",
    },
    {
      icon: Clock,
      title: "One-Click Backtesting",
      desc: "Simulate any trade over 3, 6, or 12 months of price history. See win rate, P&L curve, Sharpe ratio.",
    },
    {
      icon: LineChart,
      title: "Interactive P&L Diagrams",
      desc: "Visualize max profit, max loss, breakevens, and expected move for every trade at a glance.",
    },
    {
      icon: BookOpen,
      title: "Trade Journal & Performance",
      desc: "Log positions, track P&L, see your win rate by strategy. Know what's actually working.",
    },
    {
      icon: Bell,
      title: "Watchlist & Custom Alerts",
      desc: "Pin your favorite tickers. Get notified when they score above your threshold.",
    },
    {
      icon: Star,
      title: "Historical Win Rates",
      desc: "See real backtest-based win rates across all strategies. Our Put Credit Spreads show 80%+ historically.",
    },
  ];

  const faqs = [
    { q: "What strategies does it cover?", a: "Cash Secured Puts (CSPs), Put Credit Spreads, Strangles, and Iron Condors — the four core premium-selling strategies." },
    { q: "How is the composite score calculated?", a: "It's a weighted blend of Delta Z-Score (35%), Annualized ROC (25%), Probability of Profit (25%), and Liquidity (15%). Each factor is normalized across the full scan universe before weighting." },
    { q: "How often is data updated?", a: "Every trading day. Scans run during market hours so you get fresh ranked trade ideas by market open." },
    { q: "Can I try it for free?", a: "Yes. Create a free account to see limited results with some details redacted. Upgrade anytime to unlock everything." },
    { q: "What's your refund policy?", a: "Cancel anytime, no questions asked. You keep access through the end of your billing period." },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white overflow-x-hidden">
      {/* ============ HERO ============ */}
      <section className="relative min-h-screen flex flex-col justify-center overflow-hidden">
        {/* Grid background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(39,39,42,.4) 1px, transparent 1px), linear-gradient(90deg, rgba(39,39,42,.4) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-950 via-zinc-950/80 to-zinc-950 pointer-events-none" />
        {/* Radial glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* Nav */}
        <nav className="relative z-10 flex items-center justify-between px-4 md:px-8 py-4 max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-2.5">
            <Logo />
            <span className="font-semibold text-sm text-white tracking-tight">Premium Screener</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/auth">
              <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white" data-testid="link-sign-in">
                Sign In
              </Button>
            </Link>
            <Link href="/auth">
              <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600" data-testid="link-sign-up-nav">
                Get Started
              </Button>
            </Link>
          </div>
        </nav>

        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 pt-8 pb-16 md:pb-24">
          <div className="text-center max-w-3xl mx-auto mb-12 md:mb-16">
            <div className={fadeInUp}>
              <Badge className="mb-6 bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10 px-3 py-1 text-xs font-medium">
                <Zap className="w-3 h-3 mr-1" /> 497 S&P 500 tickers scanned daily
              </Badge>
            </div>
            <h1 className={`text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] mb-6 ${fadeInUp}`} style={{ animationDelay: "100ms" }}>
              Stop Guessing.
              <br />
              <span className="text-emerald-400">Start Screening.</span>
            </h1>
            <p className={`text-base md:text-lg text-zinc-400 max-w-2xl mx-auto leading-relaxed mb-8 ${fadeInUp}`} style={{ animationDelay: "200ms" }}>
              Our engine scans 497 S&P 500 tickers every morning and ranks the highest-probability options trades by composite score.
            </p>
            <div className={`flex flex-col sm:flex-row items-center justify-center gap-3 mb-5 ${fadeInUp}`} style={{ animationDelay: "300ms" }}>
              <Link href="/auth">
                <Button size="lg" className="bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600 px-8 w-full sm:w-auto" data-testid="button-hero-cta">
                  Start Free Preview <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
              <Button
                size="lg"
                variant="outline"
                className="text-zinc-300 border-zinc-700 hover:bg-zinc-800 w-full sm:w-auto"
                onClick={() => scrollTo("how-it-works")}
                data-testid="button-hero-how"
              >
                See How It Works
              </Button>
            </div>
            <p className={`text-xs text-zinc-500 ${fadeIn}`} style={{ animationDelay: "500ms" }}>
              No credit card required · Free preview available · Cancel anytime
            </p>
          </div>

          {/* Dashboard mockup */}
          <div className={`w-full max-w-4xl mx-auto ${fadeInUp}`} style={{ animationDelay: "400ms" }}>
            <MockDashboardHero />
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 animate-bounce">
          <ChevronDown className="w-5 h-5 text-zinc-500" />
        </div>
      </section>

      {/* ============ THE PROBLEM ============ */}
      <section className="relative py-20 md:py-28 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <AnimatedSection>
            <p className="text-xl md:text-2xl font-medium text-zinc-200 leading-relaxed mb-4">
              Most traders waste hours scanning chains manually. Premium levels are often mispriced — but only briefly.
            </p>
          </AnimatedSection>
          <AnimatedSection delay={150}>
            <p className="text-lg md:text-xl text-zinc-500 leading-relaxed">
              By the time you find it, the edge is gone.
            </p>
          </AnimatedSection>
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      <section id="how-it-works" className="relative py-20 md:py-28 px-4">
        <div className="max-w-5xl mx-auto">
          <AnimatedSection>
            <div className="text-center mb-14">
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">How It Works</h2>
              <p className="text-zinc-400 text-sm md:text-base">Three steps. Zero manual chain scanning.</p>
            </div>
          </AnimatedSection>

          <div className="grid md:grid-cols-3 gap-6 md:gap-8">
            {[
              {
                step: "01",
                icon: Crosshair,
                title: "We Scan",
                desc: "Every trading day, our engine analyzes options chains across the entire S&P 500 — every expiry, every strike.",
              },
              {
                step: "02",
                icon: BarChart3,
                title: "We Score",
                desc: "Each trade is ranked by a composite of Delta Z-Score, Annualized ROC, Probability of Profit, and Liquidity.",
              },
              {
                step: "03",
                icon: Target,
                title: "You Trade",
                desc: "Get ranked trade ideas with full leg details, P&L diagrams, and backtesting. Enter with confidence.",
              },
            ].map((s, i) => (
              <AnimatedSection key={s.step} delay={i * 150}>
                <Card className="bg-zinc-900/50 border-zinc-800 p-6 md:p-8 h-full">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-xs font-mono font-bold text-emerald-400">{s.step}</span>
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <s.icon className="w-4 h-4 text-emerald-400" />
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{s.title}</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">{s.desc}</p>
                </Card>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* ============ FEATURES GRID ============ */}
      <section id="features" className="relative py-20 md:py-28 px-4">
        <div className="max-w-5xl mx-auto">
          <AnimatedSection>
            <div className="text-center mb-14">
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">Built for Premium Sellers</h2>
              <p className="text-zinc-400 text-sm md:text-base">Every feature designed to find, evaluate, and execute high-probability premium trades.</p>
            </div>
          </AnimatedSection>

          <div className="grid md:grid-cols-2 gap-4 md:gap-5">
            {features.map((f, i) => (
              <AnimatedSection key={f.title} delay={(i % 2) * 100}>
                <div className="flex gap-4 p-5 rounded-xl border border-zinc-800/60 bg-zinc-900/30 hover:bg-zinc-900/60 transition-colors h-full">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <f.icon className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-1">{f.title}</h3>
                    <p className="text-sm text-zinc-400 leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* ============ DASHBOARD PREVIEW ============ */}
      <section className="relative py-20 md:py-28 px-4">
        <div className="max-w-5xl mx-auto">
          <AnimatedSection>
            <div className="text-center mb-10">
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">Your Trading Command Center</h2>
              <p className="text-zinc-400 text-sm md:text-base">Real data. Updated every trading day.</p>
            </div>
          </AnimatedSection>
          <AnimatedSection delay={100}>
            <MockDashboardFull />
          </AnimatedSection>
        </div>
      </section>

      {/* ============ STATS ============ */}
      <section className="relative py-20 md:py-28 px-4">
        <div className="max-w-5xl mx-auto">
          <AnimatedSection>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
              {[
                { value: "497", label: "Tickers Scanned Daily" },
                { value: "2,600+", label: "Trade Ideas Generated" },
                { value: "80%+", label: "Historical Win Rate (PCS)" },
                { value: "90%+", label: "Historical Win Rate (IC)" },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="text-3xl md:text-5xl font-bold text-emerald-400 tabular-nums mb-2">{stat.value}</div>
                  <div className="text-xs md:text-sm text-zinc-500">{stat.label}</div>
                </div>
              ))}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ============ PRICING ============ */}
      <section id="pricing" className="relative py-20 md:py-28 px-4">
        <div className="max-w-md mx-auto">
          <AnimatedSection>
            <div className="text-center mb-10">
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">Simple Pricing</h2>
              <p className="text-zinc-400 text-sm md:text-base">One plan. Everything included.</p>
            </div>
          </AnimatedSection>

          <AnimatedSection delay={100}>
            <Card className="bg-zinc-900/60 border-zinc-700/50 p-6 md:p-8 relative overflow-hidden">
              {/* Subtle glow */}
              <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-40 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="relative">
                <div className="text-center mb-6">
                  <div className="flex items-baseline justify-center gap-1 mb-1">
                    <span className="text-4xl md:text-5xl font-bold text-white">$29</span>
                    <span className="text-zinc-400 text-sm">/month</span>
                  </div>
                </div>

                <div className="space-y-3 mb-8">
                  {[
                    "Full S&P 500 scans every trading day",
                    "All 4 premium strategies",
                    "Backtesting engine",
                    "P&L diagrams",
                    "Trade journal",
                    "Watchlist & alerts",
                    "IV Rank & earnings data",
                  ].map((item) => (
                    <div key={item} className="flex items-start gap-3">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span className="text-sm text-zinc-300">{item}</span>
                    </div>
                  ))}
                </div>

                <Link href="/auth">
                  <Button className="w-full bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600" size="lg" data-testid="button-pricing-cta">
                    Start Free Preview <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
                <p className="text-xs text-zinc-500 text-center mt-4">
                  Free preview shows limited data. No credit card required to start.
                </p>
              </div>
            </Card>
          </AnimatedSection>
        </div>
      </section>

      {/* ============ FAQ ============ */}
      <section id="faq" className="relative py-20 md:py-28 px-4">
        <div className="max-w-2xl mx-auto">
          <AnimatedSection>
            <div className="text-center mb-10">
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">Frequently Asked Questions</h2>
            </div>
          </AnimatedSection>

          <div className="space-y-2">
            {faqs.map((faq, i) => (
              <AnimatedSection key={i} delay={i * 80}>
                <FAQItem
                  q={faq.q}
                  a={faq.a}
                  open={openFAQ === i}
                  toggle={() => setOpenFAQ(openFAQ === i ? null : i)}
                />
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* ============ FINAL CTA ============ */}
      <section className="relative py-20 md:py-28 px-4">
        <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/5 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-2xl mx-auto text-center relative">
          <AnimatedSection>
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">Ready to find better trades?</h2>
            <p className="text-zinc-400 mb-8">
              Join traders who save hours every day with systematic, data-driven premium selling.
            </p>
            <Link href="/auth">
              <Button size="lg" className="bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600 px-8" data-testid="button-final-cta">
                Start Free Preview <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </AnimatedSection>
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="border-t border-zinc-800/50 py-10 px-4">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <Logo className="h-6 w-6" />
            <span className="text-sm font-medium text-zinc-300">Premium Screener</span>
          </div>

          <div className="flex items-center gap-6 text-sm text-zinc-500">
            <Link href="/auth">
              <span className="hover:text-zinc-300 transition-colors cursor-pointer" data-testid="link-footer-sign-in">Sign In</span>
            </Link>
            <Link href="/auth">
              <span className="hover:text-zinc-300 transition-colors cursor-pointer" data-testid="link-footer-sign-up">Sign Up</span>
            </Link>
            <button onClick={() => scrollTo("pricing")} className="hover:text-zinc-300 transition-colors" data-testid="link-footer-pricing">
              Pricing
            </button>
          </div>

          <div className="flex flex-col items-center md:items-end gap-2 text-xs text-zinc-600">
            <span>© 2026 Premium Screener. Not financial advice.</span>
          </div>
        </div>
      </footer>

      {/* ─── Global keyframe styles ─── */}
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
