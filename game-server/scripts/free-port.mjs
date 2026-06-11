// Frees the dev server port before start/dev so a leftover orphaned process
// (common on Windows when the terminal is closed instead of Ctrl+C) doesn't
// cause EADDRINUSE. Cross-platform; no-op when nothing is listening.
import { execSync } from 'node:child_process';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

function pidsOnPort(port) {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano -p tcp`, { encoding: 'utf8' });
      const pids = new Set();
      for (const line of out.split('\n')) {
        // Match LISTENING rows whose local address ends with :PORT
        if (line.includes('LISTENING') && /[:.]\b/.test(line)) {
          const cols = line.trim().split(/\s+/);
          const local = cols[1] ?? '';
          if (local.endsWith(`:${port}`)) pids.add(cols[cols.length - 1]);
        }
      }
      return [...pids];
    }
    const out = execSync(`lsof -ti tcp:${port} -s tcp:LISTEN`, { encoding: 'utf8' });
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return []; // command failed or nothing matched
  }
}

const pids = pidsOnPort(PORT);
for (const pid of pids) {
  if (!pid || pid === '0') continue;
  try {
    process.platform === 'win32'
      ? execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' })
      : execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
    console.log(`[free-port] freed port ${PORT} (killed PID ${pid})`);
  } catch {
    console.warn(`[free-port] could not kill PID ${pid} on port ${PORT}`);
  }
}
