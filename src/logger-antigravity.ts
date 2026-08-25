import type { Logger } from './types-antigravity.js';

const noopLogger: Logger = {
  debug: () => {},
  error: () => {},
  info: () => {},
  warn: () => {},
};

// Console output is only enabled when the consumer opts into verbose logging.
/* eslint-disable no-console */
const consoleLogger: Logger = {
  debug: (message) => console.debug(`[antigravity-cli] ${message}`),
  error: (message) => console.error(`[antigravity-cli] ${message}`),
  info: (message) => console.info(`[antigravity-cli] ${message}`),
  warn: (message) => console.warn(`[antigravity-cli] ${message}`),
};
/* eslint-enable no-console */

export function resolveLogger(logger: Logger | false | undefined, verbose: boolean): Logger {
  if (logger === false) return noopLogger;
  const target = logger ?? consoleLogger;
  if (verbose) return target;
  return { ...noopLogger, error: target.error.bind(target), warn: target.warn.bind(target) };
}
