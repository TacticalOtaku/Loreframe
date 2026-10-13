import { LOG_PREFIX } from "../constants";

let debugEnabled = false;

/** Toggle verbose diagnostics (bound to the client "debug" setting). */
export function setDebugLogging(enabled: boolean): void {
  debugEnabled = enabled;
}

export const logger = {
  debug(...args: unknown[]): void {
    if (debugEnabled) console.debug(LOG_PREFIX, ...args);
  },
  info(...args: unknown[]): void {
    console.info(LOG_PREFIX, ...args);
  },
  warn(...args: unknown[]): void {
    console.warn(LOG_PREFIX, ...args);
  },
  error(...args: unknown[]): void {
    console.error(LOG_PREFIX, ...args);
  },
};
