#!/usr/bin/env node
/**
 * Decode base64-encoded asset files to binary PNG files.
 * This runs as part of the build process to generate proper binary
 * PNG files from base64 sources stored in the repo.
 * 
 * Base64 source files are in client/public/*.b64
 * Output binary files go to dist/public/*.png
 */
const fs = require('fs');
const path = require('path');

const distPublic = path.resolve(__dirname, '..', 'dist', 'public');

// Ensure dist/public exists
if (!fs.existsSync(distPublic)) {
  fs.mkdirSync(distPublic, { recursive: true });
}

// Find all .b64 files in dist/public and decode them
const files = fs.readdirSync(distPublic);
let decoded = 0;

for (const file of files) {
  if (file.endsWith('.b64')) {
    const b64Path = path.join(distPublic, file);
    const pngName = file.replace('.b64', '');
    const pngPath = path.join(distPublic, pngName);
    
    const b64Content = fs.readFileSync(b64Path, 'utf-8').trim();
    const buffer = Buffer.from(b64Content, 'base64');
    
    // Verify it's a valid PNG (magic bytes: 89 50 4E 47)
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      fs.writeFileSync(pngPath, buffer);
      console.log(`  ✓ Decoded ${pngName} (${buffer.length} bytes)`);
      decoded++;
    } else {
      console.log(`  ⚠ ${file} doesn't appear to be a valid PNG, skipping`);
    }
  }
}

// Also check if any .png files in dist/public are actually base64 text and fix them
for (const file of files) {
  if (file.endsWith('.png')) {
    const pngPath = path.join(distPublic, file);
    const content = fs.readFileSync(pngPath);
    
    // Check if the file starts with base64 characters instead of PNG magic bytes
    if (content[0] !== 0x89 || content[1] !== 0x50) {
      // This file is probably base64 text, not binary PNG
      const b64String = content.toString('utf-8').trim();
      try {
        const buffer = Buffer.from(b64String, 'base64');
        if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
          fs.writeFileSync(pngPath, buffer);
          console.log(`  ✓ Fixed base64-encoded ${file} → binary PNG (${buffer.length} bytes)`);
          decoded++;
        }
      } catch (e) {
        console.log(`  ⚠ Could not fix ${file}: ${e.message}`);
      }
    }
  }
}

if (decoded > 0) {
  console.log(`\nDecoded/fixed ${decoded} asset files.`);
} else {
  console.log('All asset files are already in correct binary format.');
}