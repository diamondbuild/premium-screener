import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Shield,
  Eye,
  EyeOff,
  TrendingUp,
  BarChart3,
  Zap,
  BookOpen,
  Target,
  Bell,
} from "lucide-react";

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { login, register } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const result = mode === "login"
      ? await login(email, password)
      : await register(email, password, displayName || undefined);

    setSubmitting(false);

    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    }
  };

  const features = [
    { icon: TrendingUp, title: "497 Tickers Scanned", desc: "Full S&P 500 universe, every trading day" },
    { icon: Target, title: "4 Premium Strategies", desc: "CSPs, Put Credit Spreads, Strangles, Iron Condors" },
    { icon: BarChart3, title: "Backtesting Engine", desc: "Test strategies against historical data" },
    { icon: Zap, title: "IV Rank & Earnings", desc: "Know when volatility is elevated" },
    { icon: BookOpen, title: "Trade Journal", desc: "Track your positions, P&L, and performance" },
    { icon: Bell, title: "Watchlist & Alerts", desc: "Get notified when your tickers light up" },
  ];

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel — features/branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 text-white flex-col justify-center p-12 relative overflow-hidden">
        {/* Subtle grid background */}
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />

        <div className="relative z-10 max-w-lg">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Shield className="w-6 h-6 text-emerald-400" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Premium Screener</h1>
          </div>

          <h2 className="text-3xl font-bold mb-3 leading-tight">
            Find the highest-probability<br />options trades, daily.
          </h2>
          <p className="text-zinc-400 text-lg mb-10">
            Sell premium with confidence. Our scanner analyzes 497 tickers every morning and ranks trades by composite score.
          </p>

          <div className="grid grid-cols-2 gap-4">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex gap-3">
                <div className="mt-0.5">
                  <Icon className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="font-medium text-sm text-white">{title}</p>
                  <p className="text-xs text-zinc-500">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12 pt-8 border-t border-zinc-700/50">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold text-emerald-400">$29</span>
              <span className="text-zinc-500 text-lg">/month</span>
            </div>
            <p className="text-zinc-500 text-sm mt-1">Cancel anytime. Free preview available.</p>
          </div>
        </div>
      </div>

      {/* Right panel — auth form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-emerald-500" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Premium Screener</h1>
          </div>

          <Card className="p-6 border-border/50">
            <div className="mb-6">
              <h2 className="text-xl font-semibold">
                {mode === "login" ? "Welcome back" : "Create your account"}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {mode === "login"
                  ? "Sign in to access your screener"
                  : "Start with a free preview, upgrade anytime"}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "register" && (
                <div className="space-y-2">
                  <Label htmlFor="displayName">Display Name (optional)</Label>
                  <Input
                    id="displayName"
                    data-testid="input-display-name"
                    placeholder="Joe"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  data-testid="input-email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    data-testid="input-password"
                    placeholder={mode === "register" ? "Min 8 characters" : "••••••••"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    minLength={mode === "register" ? 8 : undefined}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full"
                data-testid="button-submit-auth"
                disabled={submitting}
              >
                {submitting
                  ? "Please wait..."
                  : mode === "login"
                    ? "Sign In"
                    : "Create Account"}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-muted-foreground">
              {mode === "login" ? (
                <>
                  Don't have an account?{" "}
                  <button
                    className="text-primary hover:underline font-medium"
                    onClick={() => setMode("register")}
                    data-testid="link-switch-to-register"
                  >
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    className="text-primary hover:underline font-medium"
                    onClick={() => setMode("login")}
                    data-testid="link-switch-to-login"
                  >
                    Sign in
                  </button>
                </>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
