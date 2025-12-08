import type { Logger } from 'wxt'
import { inspect } from 'node:util'
import pc from 'picocolors'

const LOG_METHODS = {
  error: 0,
  warn: 1,
  log: 2,
  info: 3,
  success: 3,
  fail: 3,
  ready: 3,
  start: 3,
  debug: 4,
  trace: 5,
} as const

type LogMethod = keyof typeof LOG_METHODS

export type LogLevel = 'error' | 'warn' | 'log' | 'info' | 'debug'

function indent (str: string, spaces = 2): string {
  const indent = ' '.repeat(spaces)
  return '\n' + str
    .trim()
    .split('\n')
    .map(line => indent + line)
    .join('\n')
}

function getPrefix (label: string, method: LogMethod, level: LogLevel): string {
  const index = LOG_METHODS[level]
  if (index >= 4) {
    const gutter = method === 'log' ? '  ' : ''
    const prefix = pc.dim(`[${label}]`)
    return `${gutter}${prefix} `
  }
  return ''
}

function getFormattedArgs (args: unknown[], method: LogMethod): unknown[] {
  const settings = { depth: null, colors: true, compact: false }
  return args.map(arg =>
    typeof arg === 'string'
      ? arg
      : indent(inspect(arg, settings), method === 'log' ? 4 : 6),
  )
}

/**
 * Clones WXT's logger with debug label prefix and formatted object output
 *
 * > **Note**: only `'debug'` log level will output an the additional `[label]` prefix
 * >
 * > As a developer, use `info` and `log` for top-level user feedback, and `debug` for when you want to output richer information
 *
 *
 * @param logger  The WXT logger instance, i.e. `wxt.logger`
 * @param label   The label to prefix `debug` level messages with
 * @param level   An optional log level, over which, logs will be skipped, defaults to `'info'`
 */
export function makeLogger (logger: Logger, label: string, level: LogLevel = 'info'): Logger {
  function wrapLoggerMethod (logger: any, method: LogMethod): void {
    const originalFn = logger[method].bind(logger)
    logger[method] = (message: string, ...args: unknown[]) => {
      const formattedArgs = getFormattedArgs(args, method)
      const prefix = getPrefix(label, method, level)
      originalFn(`${prefix}${message}`, ...formattedArgs)
    }
  }

  const wrapper: Logger = (logger as any).create({ level: level })
  Object.keys(LOG_METHODS).forEach(method => {
    wrapLoggerMethod(wrapper, method as LogMethod)
  })

  return wrapper
}
