import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import type { Logger, ProxyHeaders } from '../types'

const LINKTREE_HOST = 'https://linktr.ee'
const LINKTREE_USERNAME = Bun.env.LINKTREE_USERNAME || 'vikshan'

// Simple logger using Bun's native console
const log: Logger = {
  info: (msg: string, data?: object) =>
    console.log(`[INFO] ${msg}`, data ? JSON.stringify(data) : ''),
  error: (msg: string, data?: object) =>
    console.error(`[ERROR] ${msg}`, data ? JSON.stringify(data) : '')
}

// Rewrite HTML to fix relative URLs that would break through the proxy
function rewriteHtml(html: string): string {
  return (
    html
      // Fix the relative preconnect that breaks font loading
      .replace(
        /href="\/" crossorigin/g,
        'href="https://linktr.ee/" crossorigin'
      )
  )
  // Fix canonical URL to point to proxy (optional - comment out if you want original)
  // .replace(/<link rel="canonical" href="https:\/\/linktr\.ee\/[^"]*"/, `<link rel="canonical" href="${Bun.env.CUSTOM_DOMAIN || 'https://linktr.ee'}"`)
}

const app = new Elysia()
  .use(cors())
  .get('/*', async ({ request }) => {
    const url = new URL(request.url)
    const path = url.pathname + url.search

    // Redirect auth/admin paths to official Linktree
    if (
      path.startsWith('/admin') ||
      path === '/login' ||
      path === '/register'
    ) {
      log.info('Redirecting auth path', { path })
      return Response.redirect(`${LINKTREE_HOST}${path}`, 307)
    }

    // Build target URL - redirect root to user's profile
    const targetUrl =
      path === '/'
        ? `${LINKTREE_HOST}/${LINKTREE_USERNAME}`
        : `${LINKTREE_HOST}${path}`

    log.info('Proxying request', {
      path,
      target: path === '/' ? `${LINKTREE_HOST}/<redacted>` : targetUrl
    })

    try {
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent':
            request.headers.get('user-agent') ||
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: request.headers.get('accept') || '*/*',
          'Accept-Language':
            request.headers.get('accept-language') || 'en-US,en;q=0.9',
          'Accept-Encoding': 'identity', // Disable compression for easier HTML manipulation
          Referer: 'https://linktr.ee/', // Pretend we're coming from Linktree
          Origin: 'https://linktr.ee' // For CORS preflight
        }
      })

      // Handle 404s
      if (response.status === 404) {
        return new Response('Profile not found', { status: 404 })
      }

      const contentType = response.headers.get('content-type') || 'text/html'

      // For HTML responses, rewrite problematic URLs
      if (contentType.includes('text/html')) {
        const html = await response.text()
        const rewrittenHtml = rewriteHtml(html)

        return new Response(rewrittenHtml, {
          status: response.status,
          headers: {
            'content-type': contentType,
            'cache-control':
              response.headers.get('cache-control') || 'public, max-age=60',
            // Pass through etag for caching
            ...(response.headers.get('etag') && {
              etag: response.headers.get('etag')!
            })
          }
        })
      }

      // For non-HTML (CSS, JS, images, fonts, etc.), pass through with all relevant headers
      const responseHeaders: ProxyHeaders = {
        'content-type': contentType,
        'cache-control':
          response.headers.get('cache-control') || 'public, max-age=3600'
      }

      // Pass through CORS headers for assets
      const corsHeaders = [
        'access-control-allow-origin',
        'access-control-allow-methods',
        'access-control-allow-headers'
      ]
      for (const header of corsHeaders) {
        const value = response.headers.get(header)
        if (value) responseHeaders[header] = value
      }

      return new Response(response.body, {
        status: response.status,
        headers: responseHeaders
      })
    } catch (error) {
      log.error('Request failed', { error: String(error) })
      return new Response('Proxy error', { status: 502 })
    }
  })
  .listen(Bun.env.PORT || 3000)

console.log(`🌳 Linktree proxy running at http://localhost:${app.server?.port}`)
