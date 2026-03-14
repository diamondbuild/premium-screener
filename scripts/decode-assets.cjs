#!/usr/bin/env node
/**
 * Decode base64-encoded asset files to binary PNG files.
 * Runs at startup before the server to fix PNG files that were
 * stored as base64 text in the git repo.
 */
const fs = require('fs');
const path = require('path');

const distPublic = path.resolve(__dirname, '..', 'dist', 'public');

console.log('[decode-assets] Checking dist/public at:', distPublic);

if (!fs.existsSync(distPublic)) {
  console.log('[decode-assets] dist/public does not exist, nothing to do');
  process.exit(0);
}

const files = fs.readdirSync(distPublic);
console.log('[decode-assets] Found', files.length, 'files in dist/public');

let decoded = 0;

for (const file of files) {
  if (!file.endsWith('.png')) continue;
  
  const pngPath = path.join(distPublic, file);
  
  try {
    const content = fs.readFileSync(pngPath);
    
    // Check if file starts with PNG magic bytes (89 50 4E 47)
    if (content[0] === 0x89 && content[1] === 0x50) {
      console.log(`[decode-assets] ${file}: already valid PNG (${content.length} bytes)`);
      continue;
    }
    
    // File is probably base64 text, try to decode it
    console.log(`[decode-assets] ${file}: not a valid PNG (starts with ${content[0]} ${content[1]}), attempting base64 decode...`);
    
    const b64String = content.toString('utf-8').trim();
    const buffer = Buffer.from(b64String, 'base64');
    
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      fs.writeFileSync(pngPath, buffer);
      console.log(`[decode-assets] ${file}: FIXED! base64 text -> binary PNG (${buffer.length} bytes)`);
      decoded++;
    } else {
      console.log(`[decode-assets] ${file}: decoded content is not a valid PNG either, skipping`);
    }
  } catch (e) {
    console.error(`[decode-assets] Error processing ${file}:`, e.message);
  }
}

console.log(`[decode-assets] Done. Fixed ${decoded} files.`);
