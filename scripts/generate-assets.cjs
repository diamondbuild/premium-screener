#!/usr/bin/env node
/**
 * Pre-build asset generation step.
 * Ensures public asset directory exists and any base64-encoded
 * images are decoded to proper binary format before Vite build.
 */
const fs = require('fs');
const path = require('path');

const publicDir = path.resolve(__dirname, '..', 'client', 'public');

console.log('[generate-assets] Checking public assets...');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
  console.log('[generate-assets] Created public directory');
}

// Decode any base64-encoded PNG files to proper binary
const files = fs.readdirSync(publicDir);
let fixed = 0;

for (const file of files) {
  if (!file.endsWith('.png')) continue;

  const filePath = path.join(publicDir, file);
  try {
    const content = fs.readFileSync(filePath);
    // Check if file starts with PNG magic bytes (89 50 4E 47)
    if (content[0] === 0x89 && content[1] === 0x50) {
      continue; // Already valid PNG
    }

    // Attempt base64 decode
    const b64String = content.toString('utf-8').trim();
    const buffer = Buffer.from(b64String, 'base64');

    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      fs.writeFileSync(filePath, buffer);
      console.log(`[generate-assets] Fixed ${file}: base64 -> binary PNG (${buffer.length} bytes)`);
      fixed++;
    }
  } catch (e) {
    console.error(`[generate-assets] Error processing ${file}:`, e.message);
  }
}

console.log(`[generate-assets] Done. ${fixed} files fixed, ${files.length} total checked.`);
