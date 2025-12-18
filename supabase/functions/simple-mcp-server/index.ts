// Setup type definitions for built-in Supabase Runtime APIs
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPTransport } from '@hono/mcp'
import { Hono, type Context, type Next } from 'hono'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

// Configuration
const functionName = 'simple-mcp-server'
const rawSupabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

// Determine the public-facing base URL for both local and production
function getPublicBaseUrl(): string {
  // Local development: kong:8000 -> localhost:54321
  if (rawSupabaseUrl.includes('kong')) {
    return 'http://localhost:54321'
  }
  // Production: extract project ref from internal URL and build public URL
  // SUPABASE_URL in production is like: https://<project-ref>.supabase.co
  return rawSupabaseUrl
}

const supabaseUrl = getPublicBaseUrl()

/**
 * Helper function to construct URLs for OAuth metadata.
 * Uses supabaseUrl which is correctly resolved for both local dev and production.
 */
function getUrls() {
  const mcpResourceUrl = `${supabaseUrl}/functions/v1/${functionName}`
  const wellKnownAuthorizationServerUrl = `${supabaseUrl}/auth/v1`

  return {
    mcpResourceUrl,
    wellKnownAuthorizationServerUrl,
  }
}

// Create Hono app (following Supabase tutorial structure)
const app = new Hono().basePath(`/${functionName}`)

// Create your MCP server
const server = new McpServer({
  name: 'simple-mcp-server',
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
 * Second OAuth Protected Resource Metadata endpoint, ONLY referenced from the
 * WWW-Authenticate header's resource_metadata parameter.
 *
 * This advertises a different authorization server so you can see which
 * metadata URL MCP clients actually fetch in practice.
 */
app.get('/.well-known/oauth-protected-resource', (c) => {
  console.log('Serving HEADER resource metadata')
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
 *
 * IMPORTANT: This uses a DIFFERENT resource_metadata URL from the standard
 * well-known endpoint above so you can observe which one clients follow.
 */
function buildWwwAuthenticateHeader(error?: string, errorDescription?: string): string {
  // Clients that follow the spec will fetch THIS URL first, because it was
  // explicitly given in the 401 response. Misbehaving clients may ignore it
  // and instead construct the /.well-known/oauth-protected-resource URL.
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
    name: 'simple-mcp-server',
    version: '1.0.0',
    endpoints: {
      mcp: '/mcp',
      oauthMetadata: '/.well-known/oauth-protected-resource',
    },
  })
})

// Apply auth middleware to the MCP endpoint
app.use('/mcp', authMiddleware)

/**
 * MCP protocol endpoint - requires authentication
 * Handle MCP requests at /mcp path
 */
app.all('/mcp', async (c) => {
  const transport = new StreamableHTTPTransport()
  await server.connect(transport)
  return transport.handleRequest(c)
})

Deno.serve(app.fetch)
