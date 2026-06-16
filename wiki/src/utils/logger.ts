const isDev = process.env.NODE_ENV !== 'production';

function format(level: string, message: string, meta?: unknown): string {
  if (isDev) {
    const colors: Record<string, string> = {
      info: '\x1b[36m',
      warn: '\x1b[33m',
      error: '\x1b[31m',
      debug: '\x1b[90m',
    };
    const reset = '\x1b[0m';
    const color = colors[level] ?? '';
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `${color}[${level.toUpperCase()}]${reset} ${message}${metaStr}`;
  }
  return JSON.stringify({ level, message, meta, ts: new Date().toISOString() });
}

export const logger = {
  info: (message: string, meta?: unknown) => {
    process.stdout.write(format('info', message, meta) + '\n');
  },
  warn: (message: string, meta?: unknown) => {
    process.stdout.write(format('warn', message, meta) + '\n');
  },
  error: (message: string, meta?: unknown) => {
    process.stderr.write(format('error', message, meta) + '\n');
  },
  debug: (message: string, meta?: unknown) => {
    if (isDev) process.stdout.write(format('debug', message, meta) + '\n');
  },
};
