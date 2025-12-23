// Setup type definitions for built-in Supabase Runtime APIs
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { Hono, type Context, type Next } from 'hono'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

// Configuration
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

// SUPABASE_URL is the base URL of the Supabase project
const supabaseUrl = Deno.env.get('SUPABASE_URL')!

// For local development (Docker uses kong:8000 internally), use localhost; for production, use SUPABASE_URL
// The MCP function is served at /functions/v1/mcp
const isLocal = supabaseUrl.includes('127.0.0.1') || supabaseUrl.includes('localhost') || supabaseUrl.includes('kong:8000')
const publicUrl = isLocal
  ? 'http://localhost:54321/functions/v1/mcp'
  : `${supabaseUrl}/functions/v1/mcp`

// AUTH_SERVER_URL: The authorization server URL
// For local, use localhost; for production, use the Supabase Auth URL
const authServerUrl = isLocal
  ? 'http://localhost:54321/auth/v1'
  : `${supabaseUrl}/auth/v1`

/**
 * Helper function to construct URLs for OAuth metadata.
 */
function getUrls() {
  return {
    mcpResourceUrl: publicUrl,
    wellKnownAuthorizationServerUrl: authServerUrl,
  }
}

// Create Hono app (following Supabase tutorial structure)
const app = new Hono().basePath('/mcp')

// Create your MCP server
const server = new McpServer({
  name: 'mcp-server',
  version: '1.0.0',
})

// Register a simple addition tool
server.registerTool(
  'add',
  {
    title: 'Addition Tool',
    description: 'Add two numbers together',
    inputSchema: { a: z.number(), b: z.number() },
  },
  ({ a, b }) => ({
    content: [{ type: 'text', text: String(a + b) }],
  })
)

/**
 * OAuth Protected Resource Metadata endpoint
 * This advertises the authorization server so MCP clients can discover it
 */
app.get('/.well-known/oauth-protected-resource', (c) => {
  const { mcpResourceUrl, wellKnownAuthorizationServerUrl } = getUrls()
  return c.json({
    resource: mcpResourceUrl,
    authorization_servers: [wellKnownAuthorizationServerUrl],
    scopes_supported: ['openid', 'profile', 'email'],
  })
})

/**
 * Build WWW-Authenticate header for 401/403 responses
 * Per RFC 9728 OAuth 2.1 Protected Resource Metadata specification
 */
function buildWwwAuthenticateHeader(error?: string, errorDescription?: string): string {
  const { mcpResourceUrl } = getUrls()
  const resourceMetadataUrl = `${mcpResourceUrl}/.well-known/oauth-protected-resource`

  let header = `Bearer resource_metadata="${resourceMetadataUrl}"`

  if (error) {
    header += `, error="${error}"`
  }

  if (errorDescription) {
    header += `, error_description="${errorDescription}"`
  }

  return header
}

/**
 * Validate access token using Supabase Auth
 */
async function validateToken(token: string): Promise<{ valid: boolean; user?: unknown; error?: string }> {
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
  })

  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return { valid: false, error: error?.message || 'Invalid token' }
  }

  return { valid: true, user }
}

/**
 * OAuth authentication middleware
 * Validates Bearer tokens and returns WWW-Authenticate headers on failure
 */
async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')

  // No authorization header - return 401 with discovery info
  if (!authHeader) {
    return c.json(
      { error: 'unauthorized', error_description: 'Missing authorization header' },
      401,
      { 'WWW-Authenticate': buildWwwAuthenticateHeader() }
    )
  }

  // Check for Bearer token format
  const [scheme, token] = authHeader.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return c.json(
      { error: 'invalid_request', error_description: 'Invalid authorization header format' },
      401,
      { 'WWW-Authenticate': buildWwwAuthenticateHeader('invalid_request', 'Bearer token required') }
    )
  }

  // Validate the token
  const { valid, user, error } = await validateToken(token)

  if (!valid) {
    return c.json(
      { error: 'invalid_token', error_description: error || 'Token validation failed' },
      401,
      { 'WWW-Authenticate': buildWwwAuthenticateHeader('invalid_token', error) }
    )
  }

  // Store user in context for downstream handlers
  c.set('user', user)

  await next()
}

// Health check endpoint (no auth required)
app.get('/', (c) => {
  return c.json({
    name: 'mcp-server',
    version: '1.0.0',
    endpoints: {
      mcp: '/',
      oauthMetadata: '/.well-known/oauth-protected-resource',
    },
  })
})

// Apply auth middleware to POST requests (MCP protocol uses POST)
app.use('/', authMiddleware)

/**
 * MCP protocol endpoint - requires authentication
 * Handle MCP requests at root path
 */
app.post('/', async (c) => {
  const transport = new WebStandardStreamableHTTPServerTransport()
  await server.connect(transport)
  return transport.handleRequest(c.req.raw)
})

Deno.serve(app.fetch)
