import fs from 'fs';
import path from 'path';

const logDir = path.resolve(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  try { fs.mkdirSync(logDir, { recursive: true }); } catch { /* ignore */ }
}

function stamp() {
  return new Date().toISOString();
}

export function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const line = `${stamp()} ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`;
    if (process.env.NODE_ENV !== 'test') {
      console.log(line);
    }
  });
  next();
}

export default requestLogger;
