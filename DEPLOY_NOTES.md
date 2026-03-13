# Deploy Notes

This repo includes pre-built dist/ files. Railway only needs to run `npm install` (for native modules like better-sqlite3), then `npm start`.

## Build Locally
```bash
npm run build
```

## Start
```bash
NODE_ENV=production node dist/index.cjs
```
