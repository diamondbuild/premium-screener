import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-zinc-950">
      <Card className="w-full max-w-md mx-4 bg-zinc-900 border-zinc-800">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2 items-center">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-zinc-100">Page Not Found</h1>
          </div>

          <p className="mt-2 text-sm text-zinc-400">
            This page doesn't exist. If this keeps happening, try clearing your browser cache.
          </p>

          <div className="mt-6 flex gap-3">
            <Link href="/">
              <Button className="bg-emerald-500 hover:bg-emerald-600 text-white">
                Go to Home
              </Button>
            </Link>
            <Link href="/auth">
              <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">
                Sign In
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
