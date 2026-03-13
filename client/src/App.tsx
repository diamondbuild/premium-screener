import { Switch, Route, Router, Redirect, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import Dashboard from "@/pages/dashboard";
import JournalPage from "@/pages/journal";
import AuthPage from "@/pages/auth";
import LandingPage from "@/pages/landing";
import NotFound from "@/pages/not-found";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect } from "react";

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <Skeleton className="h-4 w-32" />
      </div>
    </div>
  );
}

// Temporary debug banner — remove after confirming routing works
function DebugBanner() {
  const [location] = useLocation();
  const { user, loading } = useAuth();
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999, background: "#000", color: "#0f0", padding: "4px 8px", fontSize: "11px", fontFamily: "monospace" }}>
      loc={location} | hash={hash} | user={user ? "yes" : "no"} | loading={loading ? "yes" : "no"}
    </div>
  );
}

function AppRouter() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  if (!user) {
    return (
      <Switch>
        <Route path="/" component={LandingPage} />
        <Route path="/auth" component={AuthPage} />
        <Route>{() => <Redirect to="/" />}</Route>
      </Switch>
    );
  }

  // Logged in: /auth redirects to dashboard instead of 404
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/auth">{() => <Redirect to="/" />}</Route>
      <Route path="/journal" component={JournalPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router hook={useHashLocation}>
          <DebugBanner />
          <AppRouter />
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
