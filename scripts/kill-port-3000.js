#!/usr/bin/env node
/** Kill any process listening on port 3000 (Windows). */
import { execSync } from 'child_process';

const PORT = process.env.PORT || '3000';

try {
  const out = execSync(`netstat -ano | findstr :${PORT}`, { encoding: 'utf8', maxBuffer: 4096 });
  const pids = new Set();
  for (const line of out.trim().split('\n').filter(Boolean)) {
    if (!line.includes('LISTENING')) continue;
    const pid = line.trim().split(/\s+/).pop();
    if (/^\d+$/.test(pid)) pids.add(pid);
  }
  for (const pid of pids) {
    execSync(`taskkill /PID ${pid} /F`, { stdio: 'inherit' });
    console.log(`Killed PID ${pid} on port ${PORT}`);
  }
  if (pids.size === 0) console.log(`Port ${PORT} is free`);
} catch (e) {
  if (e.status === 1) console.log(`Port ${PORT} is free`);
  else throw e;
}
