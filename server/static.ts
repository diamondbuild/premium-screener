import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Hashed assets (JS/CSS) — cache forever (immutable, filename changes on rebuild)
  app.use(
    "/assets",
    express.static(path.join(distPath, "assets"), {
      maxAge: "1y",
      immutable: true,
    })
  );

  // Other static files — but NOT index.html (we handle that below with no-cache)
  app.use(express.static(distPath, {
    maxAge: "1h",
    etag: true,
    index: false, // Don't auto-serve index.html from express.static
  }));

  // All non-file routes (including /) serve index.html with no-cache
  // This ensures browsers always get the latest HTML with updated JS/CSS hashes
  app.use("/{*path}", (_req, res) => {
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
