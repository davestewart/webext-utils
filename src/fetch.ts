// @see https://claude.ai/chat/1e9a4654-8b28-4035-a3e0-fd67a9339d31

interface HandlerPayload {
  data: any
  url: string
  params: Record<string, string>
  response: Response
}

type HandlerFunction = (payload: HandlerPayload) => void

interface HandlerConfig {
  pattern: string | RegExp
  handler: HandlerFunction
  verb: string
  requiredHeaders: string[]
  matchPattern: (url: string, pattern: string | RegExp) => false | { params: Record<string, string> }
}

interface CachedRequest {
  url: string
  method: string
  headers: Record<string, string>
  body?: any
}

interface FetchInterceptorCache {
  requests: Map<string, CachedRequest>
  headers: Record<string, string>
  accessedEndpoints: Set<string>
  isPatched: boolean
  originalFetch: typeof fetch | null
  originalJson: typeof Response.prototype.json | null
  allHandlers: Map<string, HandlerConfig>
}

interface FetchInterceptorOptions {
  headers?: Record<string, string>
  requiredHeaders?: string[]
}

declare global {
  interface Window {
    __fetchInterceptorCache?: FetchInterceptorCache
  }
}

/**
 * Composable for intercepting and handling fetch responses
 */
export function useFetchInterceptor (basePath = '', options: FetchInterceptorOptions = {}) {
  const handlers = new Map<string, HandlerConfig>()

  // get or initialize global cache
  if (!window.__fetchInterceptorCache) {
    window.__fetchInterceptorCache = {
      requests: new Map(),
      headers: {},
      accessedEndpoints: new Set(),
      isPatched: false,
      originalFetch: null,
      originalJson: null,
      allHandlers: new Map()
    }
  }

  const cache = window.__fetchInterceptorCache
  const cachedRequests = cache.requests

  // merge default headers from options and global cache
  const defaultHeaders: Record<string, string> = {
    ...cache.headers,
    ...(options.headers || {})
  }

  // default required headers for all requests from this instance
  const defaultRequiredHeaders = options.requiredHeaders || []

  /**
   * Normalize base path
   */
  function normalizeBasePath (path: string): string {
    return path.endsWith('/') ? path.slice(0, -1) : path
  }

  const normalizedBasePath = normalizeBasePath(basePath)

  /**
   * Patch fetch and Response.json if not already patched
   */
  function ensurePatched () {
    if (cache.isPatched) return

    cache.originalFetch = window.fetch
    cache.originalJson = Response.prototype.json

    // patch fetch to store URL and cache request info
    window.fetch = async function (...args: Parameters<typeof fetch>): Promise<Response> {
      const input = args[0]
      const url = typeof input === 'string' ? input : (input as Request).url
      const init = args[1] || {}
      const method = (init.method || 'GET').toUpperCase()

      // track this endpoint
      cache.accessedEndpoints.add(`${method} ${url}`)

      const response = await cache.originalFetch!.apply(this, args)

        // store metadata on response
      ;(response as any).__url = url
      ;(response as any).__method = method
      ;(response as any).__options = init

      return response
    }

    // patch Response.json to call handlers and cache requests
    const originalJson = cache.originalJson
    ;(Response.prototype as any).json = async function <T = any>(): Promise<T> {
      const data = await originalJson!.call(this)
      const url = (this as any).__url || this.url
      const method = (this as any).__method || 'GET'
      const options = (this as any).__options || {}

      // check all handlers from all instances
      for (const [key, config] of cache.allHandlers) {
        // match both pattern and verb
        if (config.verb !== method) continue

        const match = config.matchPattern(url, config.pattern)
        if (match) {
          // cache this request if not already cached
          if (!cachedRequests.has(key)) {
            cachedRequests.set(key, {
              url,
              method,
              headers: options.headers || {},
              body: options.body
            })

            // also update global headers cache
            cache.headers = {
              ...cache.headers,
              ...(options.headers || {})
            }
          }

          config.handler({
            data,
            url,
            params: match.params,
            response: this
          })
        }
      }

      return data
    }

    cache.isPatched = true
  }

  /**
   * Check if URL matches pattern and extract params
   * Returns false or { params: {...} }
   */
  function matchPattern (url: string, pattern: string | RegExp): false | { params: Record<string, string> } {
    // strip base path from url if present
    const urlToMatch = url.startsWith(normalizedBasePath)
      ? url.slice(normalizedBasePath.length)
      : url

    // strip query string for matching
    const [urlPath] = urlToMatch.split('?')

    // regex pattern
    if (pattern instanceof RegExp) {
      return pattern.test(urlPath) ? { params: {} } : false
    }

    const [patternPath] = pattern.split('?')

    // tokenized string pattern like '/user/:id'
    if (patternPath.includes(':')) {
      const patternParts = patternPath.split('/')
      const urlParts = urlPath.split('/')

      if (patternParts.length !== urlParts.length) {
        return false
      }

      const params: Record<string, string> = {}

      for (let i = 0; i < patternParts.length; i++) {
        const patternPart = patternParts[i]
        const urlPart = urlParts[i]

        if (patternPart.startsWith(':')) {
          // extract token name and store value
          const tokenName = patternPart.slice(1)
          params[tokenName] = urlPart
        }
        else if (patternPart !== urlPart) {
          return false
        }
      }

      return { params }
    }

    // simple string match
    return urlPath.includes(patternPath) ? { params: {} } : false
  }

  /**
   * Parse key to extract verb and ensure it's valid
   */
  function parseKey (key: string): { verb: string; name: string } {
    const colonIndex = key.indexOf(':')

    if (colonIndex === -1) {
      return { verb: 'GET', name: key }
    }

    const verb = key.slice(0, colonIndex).toUpperCase()
    const name = key.slice(colonIndex + 1)

    return { verb, name }
  }

  /**
   * Build full URL from pattern and params
   */
  function buildUrl (pattern: string, params: Record<string, any> = {}): string {
    let url = normalizedBasePath + pattern
    const queryParams = { ...params }

    // replace path tokens
    url = url.replace(/:(\w+)/g, (match, token) => {
      if (queryParams[token] !== undefined) {
        const value = queryParams[token]
        delete queryParams[token]
        return value
      }
      return match
    })

    // remaining params become query string
    const remainingParams = Object.keys(queryParams)
    if (remainingParams.length > 0) {
      const queryString = remainingParams
        .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(queryParams[key])}`)
        .join('&')
      url += (url.includes('?') ? '&' : '?') + queryString
    }

    return url
  }

  /**
   * Add handler for URL pattern
   */
  function add (
    key: string,
    pattern: string | RegExp,
    handler: HandlerFunction,
    requiredHeaders: string[] = []
  ): string {
    ensurePatched()

    const { verb, name } = parseKey(key)
    const fullKey = `${verb}:${name}`

    // merge default required headers with handler-specific ones
    const allRequiredHeaders = [...defaultRequiredHeaders, ...requiredHeaders]

    const config: HandlerConfig = {
      pattern,
      handler,
      verb,
      requiredHeaders: allRequiredHeaders,
      matchPattern
    }

    handlers.set(fullKey, config)
    cache.allHandlers.set(fullKey, config)

    return fullKey
  }

  /**
   * Remove handler by key
   */
  function remove (key: string): void {
    const { verb, name } = parseKey(key)
    const fullKey = `${verb}:${name}`

    handlers.delete(fullKey)
    cache.allHandlers.delete(fullKey)
    cachedRequests.delete(fullKey)
  }

  /**
   * Call an endpoint by handler name
   */
  async function call (
    key: string,
    params: Record<string, any> = {},
    options: RequestInit & { headers?: Record<string, string> } = {}
  ): Promise<HandlerPayload> {
    const { verb, name } = parseKey(key)
    const fullKey = `${verb}:${name}`

    const handler = handlers.get(fullKey)
    if (!handler) {
      throw new Error(`No handler found for key: ${fullKey}`)
    }

    // only try to build URL if pattern is a string
    if (typeof handler.pattern !== 'string') {
      throw new Error(`Cannot call handler with RegExp pattern: ${fullKey}`)
    }

    const cached = cachedRequests.get(fullKey)

    // merge headers: defaults < cached < options
    const headers: Record<string, string> = {
      ...defaultHeaders,
      ...(cached?.headers || {}),
      ...(options.headers || {})
    }

    // check required headers
    if (handler.requiredHeaders.length > 0) {
      const missing = handler.requiredHeaders.filter(h => !headers[h])
      if (missing.length > 0) {
        throw new Error(
          `Missing required headers for ${fullKey}: ${missing.join(', ')}\n` +
          `Either call this endpoint naturally first, or provide default headers via options.`
        )
      }
    }

    // build URL from pattern and params
    const url = buildUrl(handler.pattern, { ...params })

    // build fetch options
    const fetchOptions: RequestInit = {
      method: verb,
      headers,
      mode: 'cors',
      credentials: 'omit',
      ...(options.body && { body: options.body }),
      ...(cached?.body && !options.body && { body: cached.body })
    }

    // make the request
    const response = await fetch(url, fetchOptions)
    const data = await response.json()

    // return same payload structure as handler
    return {
      data,
      url,
      params,
      response
    }
  }

  /**
   * Get all registered handlers
   */
  function getHandlers (): string[] {
    return Array.from(handlers.keys())
  }

  /**
   * Get cached headers for debugging
   */
  function getCachedHeaders (): Record<string, string> {
    return { ...cache.headers }
  }

  /**
   * Remove all handlers and restore original fetch
   */
  function restore (): void {
    // remove this instance's handlers from global
    for (const key of handlers.keys()) {
      cache.allHandlers.delete(key)
    }
    handlers.clear()

    // only unpatch if no handlers remain
    if (cache.allHandlers.size === 0 && cache.isPatched) {
      window.fetch = cache.originalFetch!
      Response.prototype.json = cache.originalJson!
      cache.isPatched = false
    }
  }

  return {
    add,
    remove,
    call,
    getHandlers,
    getCachedHeaders,
    restore
  }
}

/**
 * Composable for tracking all fetch requests
 */
export function useFetchTracker () {
  // ensure the cache exists
  if (!window.__fetchInterceptorCache) {
    window.__fetchInterceptorCache = {
      requests: new Map(),
      headers: {},
      accessedEndpoints: new Set(),
      isPatched: false,
      originalFetch: null,
      originalJson: null,
      allHandlers: new Map()
    }
  }

  const cache = window.__fetchInterceptorCache

  /**
   * Get all accessed endpoints
   */
  function getEndpoints (grouped?: false): Record<string, string[]>
  function getEndpoints (grouped: true): Record<string, string[]>
  function getEndpoints (grouped = false): Record<string, string[]> {
    const endpoints = Array.from(cache.accessedEndpoints)

    if (grouped) {
      // return { url: [verbs] }
      return endpoints.reduce((acc, endpoint) => {
        const spaceIndex = endpoint.indexOf(' ')
        const verb = endpoint.slice(0, spaceIndex)
        const url = endpoint.slice(spaceIndex + 1)
        if (!acc[url]) {
          acc[url] = []
        }
        acc[url].push(verb)
        return acc
      }, {} as Record<string, string[]>)
    }

    // return { verb: [urls] }
    return endpoints.reduce((acc, endpoint) => {
      const spaceIndex = endpoint.indexOf(' ')
      const verb = endpoint.slice(0, spaceIndex)
      const url = endpoint.slice(spaceIndex + 1)
      if (!acc[verb]) {
        acc[verb] = []
      }
      acc[verb].push(url)
      return acc
    }, {} as Record<string, string[]>)
  }

  /**
   * Clear all tracked endpoints
   */
  function clear (): void {
    cache.accessedEndpoints.clear()
  }

  return {
    getEndpoints,
    clear
  }
}
