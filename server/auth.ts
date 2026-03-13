import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import createMemoryStore from "memorystore";
import bcrypt from "bcryptjs";
import db from "./db";
import type { Express, Request, Response, NextFunction } from "express";

// ── Types ──
export interface User {
  id: number;
  email: string;
  passwordHash: string;
  displayName: string | null;
  subscriptionStatus: "free" | "active" | "past_due" | "canceled";
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  subscriptionEndsAt: string | null;
  createdAt: string;
}

declare global {
  namespace Express {
    interface User {
      id: number;
      email: string;
      passwordHash: string;
      displayName: string | null;
      subscriptionStatus: "free" | "active" | "past_due" | "canceled";
      stripeCustomerId: string | null;
      stripeSubscriptionId: string | null;
      stripePriceId: string | null;
      subscriptionEndsAt: string | null;
      createdAt: string;
    }
  }
}

// ── DB Setup ──
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    subscription_status TEXT NOT NULL DEFAULT 'free',
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    stripe_price_id TEXT,
    subscription_ends_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id);
`);

// ── Prepared Statements ──
const findUserByEmail = db.prepare(`SELECT * FROM users WHERE email = ?`);
const findUserById = db.prepare(`SELECT * FROM users WHERE id = ?`);
const insertUser = db.prepare(`
  INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)
`);
const updateStripeCustomer = db.prepare(`
  UPDATE users SET stripe_customer_id = ? WHERE id = ?
`);
const updateSubscription = db.prepare(`
  UPDATE users SET subscription_status = ?, stripe_subscription_id = ?, stripe_price_id = ?, subscription_ends_at = ? WHERE id = ?
`);
const updateSubscriptionByCustomerId = db.prepare(`
  UPDATE users SET subscription_status = ?, stripe_subscription_id = ?, stripe_price_id = ?, subscription_ends_at = ? WHERE stripe_customer_id = ?
`);
const findUserByStripeCustomer = db.prepare(`SELECT * FROM users WHERE stripe_customer_id = ?`);

function rowToUser(row: any): User | null {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    displayName: row.display_name,
    subscriptionStatus: row.subscription_status || "free",
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    stripePriceId: row.stripe_price_id,
    subscriptionEndsAt: row.subscription_ends_at,
    createdAt: row.created_at,
  };
}

// ── Exported user helpers ──
export function getUserByEmail(email: string): User | null {
  return rowToUser(findUserByEmail.get(email));
}

export function getUserById(id: number): User | null {
  return rowToUser(findUserById.get(id));
}

export function getUserByStripeCustomerId(customerId: string): User | null {
  return rowToUser(findUserByStripeCustomer.get(customerId));
}

export function createUser(email: string, password: string, displayName?: string): User {
  const hash = bcrypt.hashSync(password, 10);
  const result = insertUser.run(email, hash, displayName || null);
  return getUserById(result.lastInsertRowid as number)!;
}

export function setStripeCustomerId(userId: number, customerId: string) {
  updateStripeCustomer.run(customerId, userId);
}

export function updateUserSubscription(
  userId: number,
  status: string,
  subscriptionId: string | null,
  priceId: string | null,
  endsAt: string | null
) {
  updateSubscription.run(status, subscriptionId, priceId, endsAt, userId);
}

export function updateUserSubscriptionByCustomerId(
  customerId: string,
  status: string,
  subscriptionId: string | null,
  priceId: string | null,
  endsAt: string | null
) {
  updateSubscriptionByCustomerId.run(status, subscriptionId, priceId, endsAt, customerId);
}

// ── Passport Config ──
passport.use(
  new LocalStrategy(
    { usernameField: "email", passwordField: "password" },
    (email, password, done) => {
      const user = getUserByEmail(email);
      if (!user) return done(null, false, { message: "Invalid email or password" });
      if (!bcrypt.compareSync(password, user.passwordHash)) {
        return done(null, false, { message: "Invalid email or password" });
      }
      return done(null, user);
    }
  )
);

passport.serializeUser((user: Express.User, done) => {
  done(null, user.id);
});

passport.deserializeUser((id: number, done) => {
  const user = getUserById(id);
  done(null, user || undefined);
});

// ── Session + Passport Setup ──
export function setupAuth(app: Express) {
  const MemoryStore = createMemoryStore(session);

  app.use(
    session({
      secret: process.env.SESSION_SECRET || "premium-screener-dev-secret-change-in-prod",
      resave: false,
      saveUninitialized: false,
      store: new MemoryStore({ checkPeriod: 86400000 }), // prune expired entries every 24h
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        httpOnly: true,
        sameSite: "lax",
        secure: false, // Set to true in production with HTTPS
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  // ── Auth Routes ──

  // POST /api/auth/register
  app.post("/api/auth/register", (req: Request, res: Response, next: NextFunction) => {
    const { email, password, displayName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const existing = getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    try {
      const user = createUser(email, password, displayName);

      // Auto-login after registration
      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json({
          user: sanitizeUser(user),
        });
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to create account" });
    }
  });

  // POST /api/auth/login
  app.post("/api/auth/login", (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate("local", (err: any, user: Express.User | false, info: any) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({ error: info?.message || "Invalid credentials" });
      }
      req.login(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        res.json({ user: sanitizeUser(user) });
      });
    })(req, res, next);
  });

  // POST /api/auth/logout
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ error: "Logout failed" });
      res.json({ success: true });
    });
  });

  // GET /api/auth/me — current user info
  app.get("/api/auth/me", (req: Request, res: Response) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.json({ user: null });
    }
    // Refresh user from DB to get latest subscription status
    const freshUser = getUserById(req.user.id);
    if (!freshUser) return res.json({ user: null });
    res.json({ user: sanitizeUser(freshUser) });
  });
}

// Strip password hash before sending to client
function sanitizeUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    subscriptionStatus: user.subscriptionStatus,
    subscriptionEndsAt: user.subscriptionEndsAt,
    createdAt: user.createdAt,
  };
}

// ── Middleware ──

// Require authentication
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

// Require active subscription
export function requireSubscription(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  const user = getUserById(req.user.id);
  if (!user || (user.subscriptionStatus !== "active" && user.subscriptionStatus !== "past_due")) {
    return res.status(403).json({ error: "Active subscription required", subscriptionStatus: user?.subscriptionStatus || "free" });
  }
  next();
}

// Check if user is premium (doesn't block — just annotates request)
export function checkSubscription(req: Request, _res: Response, next: NextFunction) {
  (req as any).isPremium = false;
  if (req.isAuthenticated() && req.user) {
    const user = getUserById(req.user.id);
    if (user && (user.subscriptionStatus === "active" || user.subscriptionStatus === "past_due")) {
      (req as any).isPremium = true;
    }
  }
  next();
}
