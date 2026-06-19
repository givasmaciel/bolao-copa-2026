/**
 * Logger estruturado simples — emite JSON para stdout (Render captura).
 *
 * Uso:
 *   const logger = require('./logger');
 *   logger.info('dbMarker loaded', { marker: 'render-2026-06-19' });
 *   logger.warn('CSRF mismatch', { ip: req.ip });
 *   logger.error('DB connection failed', { error: err.message });
 *
 * Por que JSON? Ferramentas de log (Datadog, Logtail, Render log search)
 * conseguem filtrar por level/campos sem regex em texto livre.
 */

function emit(level, msg, meta) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg
  };
  if (meta) {
    // mescla campos do meta no entry (exceto se for Error — guarda msg+stack)
    if (meta instanceof Error) {
      entry.error = meta.message;
      if (meta.stack) entry.stack = meta.stack;
    } else {
      Object.assign(entry, meta);
    }
  }
  // Render/Loki/Datadog preferem uma linha por entrada (sem quebras)
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

module.exports = {
  debug: (msg, meta) => { if (process.env.LOG_LEVEL === 'debug') emit('debug', msg, meta); },
  info: (msg, meta) => emit('info', msg, meta),
  warn: (msg, meta) => emit('warn', msg, meta),
  error: (msg, meta) => emit('error', msg, meta)
};