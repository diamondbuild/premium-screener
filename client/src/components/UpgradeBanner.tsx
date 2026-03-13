import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Lock, Zap, Crown } from "lucide-react";

// Banner shown at top of dashboard for free users
export function UpgradeBanner() {
  const { user, isPremium, startCheckout } = useAuth();

  if (!user || isPremium) return null;

  return (
    <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20 rounded-lg p-4 mb-6 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
          <Crown className="w-5 h-5 text-amber-500" />
        </div>
        <div>
          <p className="font-medium text-sm">You're viewing limited data</p>
          <p className="text-xs text-muted-foreground">
            Upgrade to Pro for full access to all 2,600+ trades, real-time data, backtesting, trade journal, and alerts.
          </p>
        </div>
      </div>
      <Button
        size="sm"
        className="shrink-0 bg-amber-500 hover:bg-amber-600 text-black font-semibold"
        onClick={startCheckout}
        data-testid="button-upgrade-banner"
      >
        <Zap className="w-4 h-4 mr-1" />
        Upgrade — $29/mo
      </Button>
    </div>
  );
}

// Overlay shown on locked content sections
export function LockedOverlay({ feature }: { feature: string }) {
  const { startCheckout } = useAuth();

  return (
    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm rounded-lg flex flex-col items-center justify-center z-10">
      <Lock className="w-8 h-8 text-muted-foreground mb-3" />
      <p className="font-medium text-sm mb-1">Premium Feature</p>
      <p className="text-xs text-muted-foreground mb-4 text-center px-4">{feature} requires a Pro subscription</p>
      <Button
        size="sm"
        variant="outline"
        className="border-amber-500/50 text-amber-500 hover:bg-amber-500/10"
        onClick={startCheckout}
        data-testid="button-upgrade-locked"
      >
        <Zap className="w-3 h-3 mr-1" />
        Upgrade to Pro
      </Button>
    </div>
  );
}

// Inline badge for redacted fields
export function RedactedValue({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground/50">
      <Lock className="w-3 h-3" />
      <span className="text-xs">{label || "Pro"}</span>
    </span>
  );
}

// User menu with subscription status
export function UserMenu() {
  const { user, isPremium, logout, startCheckout, manageSubscription } = useAuth();

  if (!user) return null;

  return (
    <div className="flex items-center gap-3">
      {isPremium ? (
        <button
          onClick={manageSubscription}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors"
          data-testid="badge-pro"
        >
          <Crown className="w-3 h-3" />
          Pro
        </button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
          onClick={startCheckout}
          data-testid="button-upgrade-header"
        >
          <Zap className="w-3 h-3 mr-1" />
          Upgrade
        </Button>
      )}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground truncate max-w-[140px]">{user.email}</span>
        <button
          onClick={logout}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-logout"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
