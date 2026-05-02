#!/usr/bin/env node
const http = require('http');
const https = require('https');
const { URL } = require('url');

const target = process.argv[2] || process.env.WARMUP_URL || 'http://localhost:5000/readyz';
const maxAttempts = parseInt(process.env.WARMUP_MAX_ATTEMPTS, 10) || 30;
const baseDelayMs = parseInt(process.env.WARMUP_DELAY_MS, 10) || 2000;
const timeoutMs = parseInt(process.env.WARMUP_TIMEOUT_MS, 10) || 5000;

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

function checkOnce(urlStr) {
  const url = new URL(urlStr);
  const lib = url.protocol === 'https:' ? https : http;
  return new Promise((resolve) => {
    const req = lib.get(url, { timeout: timeoutMs }, (res) => {
      const { statusCode } = res;
      // consume body
      res.on('data', () => {});
      res.on('end', () => {});
      if (statusCode >= 200 && statusCode < 300) resolve({ ok: true, statusCode });
      else resolve({ ok: false, statusCode });
    });

    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
  });
}

(async () => {
  console.log(`Warmup: polling ${target} (max ${maxAttempts} attempts)`);
  for (let i = 1; i <= maxAttempts; i++) {
    const attempt = i;
    const result = await checkOnce(target);
    if (result.ok) {
      console.log(`Ready (status ${result.statusCode}) after ${attempt} attempt(s)`);
      process.exit(0);
    } else {
      console.log(`Attempt ${attempt}/${maxAttempts} failed: ${result.statusCode || result.error}`);
      const delay = Math.min(baseDelayMs * (2 ** (attempt - 1)), 30000);
      await sleep(delay);
    }
  }
  console.error(`❌ Warmup failed after ${maxAttempts} attempts`);
  process.exit(2);
})();
