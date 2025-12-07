import { inspect } from 'node:util'
import { createConsola, type ConsolaReporter, type LogObject } from 'consola'
import pc from 'picocolors'

const LOG_LEVEL_NAME = [
  'error',
  'warn',
  'log',
  'info',
  'debug',
  'success',
  'trace'
] as const

export const LOG_LEVEL = {
  error: 0,
  warn: 1,
  log: 2,
  info: 3,
  success: 3,
  fail: 3,
  ready: 3,
  start: 3,
  debug: 4,
  trace: 5
} as const

export type LogLevel = keyof typeof LOG_LEVEL
export type LogType = typeof LOG_LEVEL_NAME[number]

function indent(str: string, spaces = 2): string {
  const indent = ' '.repeat(spaces)
  return '\n' + str
    .trim()
    .split('\n')
    .map(line => indent + line)
    .join('\n')
}

function getLabelPrefix(label: string, method: LogType, logLevel: LogLevel): string {
  const index = LOG_LEVEL[logLevel]
  if (index >= 4) {
    const prefix = pc.dim(`[${label}]`)
    return `${method === 'log' ? '  ' : ''}${prefix} `
  }
  return ''
}

function getFormattedArgs(args: unknown[], type: LogType): unknown[] {
  const settings = { depth: null, colors: true, compact: false }
  return args.map(arg =>
    typeof arg === 'string'
      ? arg
      : indent(inspect(arg, settings), type === 'log' ? 4 : 6)
  )
}

// Custom reporter class
class CustomReporter implements ConsolaReporter {
  constructor(
    private label: string = '',
    private logLevel: LogLevel = 'info'
  ) {}

  log(logObj: LogObject): void {
    const type = logObj.type as LogType
    const message = logObj.args[0] as string
    const args = logObj.args.slice(1)

    const formattedArgs = getFormattedArgs(args, type)
    const prefix = getLabelPrefix(this.label, type, this.logLevel)

    // Use console methods directly with proper formatting
    const method = type === 'success' ? 'log' : type
    console[method](`${prefix}${message}`, ...formattedArgs)
  }
}

/**
 * Create a new Consola logger with prefix and log level
 *
 * @param label
 * @param logLevel
 */
export function createLogger(label = '', logLevel: LogLevel = 'info') {
  const level = LOG_LEVEL[logLevel]

  return createConsola({
    level,
    reporters: [
      new CustomReporter(label, logLevel)
    ]
  })
}

