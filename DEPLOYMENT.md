# MCP Server Deployment Guide

This guide explains how to deploy and test your MCP server on Supabase Edge Functions.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) installed
- [Deno](https://deno.land/) installed
- [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started) installed

## Local Development

### Step 1: Start Supabase locally

```bash
cd /Users/pedrorodrigues/my-mcp-server
supabase start
```

This will start all Supabase services locally. Wait for it to complete and note the URLs provided.

### Step 2: Serve your MCP function locally

In a separate terminal, serve your function:

```bash
cd /Users/pedrorodrigues/my-mcp-server
supabase functions serve --no-verify-jwt simple-mcp-server
```

**Note:** The `--no-verify-jwt` flag disables JWT verification at the Edge Function layer. Your MCP server has its own OAuth authentication middleware, so this is needed for local testing.

Your MCP server will be available at:
- **MCP endpoint**: `http://localhost:54321/functions/v1/simple-mcp-server/mcp`
- **OAuth metadata endpoint**: `http://localhost:54321/functions/v1/simple-mcp-server/.well-known/oauth-protected-resource`

### Step 3: Test with MCP Inspector

Start the official MCP Inspector:

```bash
npx -y @modelcontextprotocol/inspector
```

This will open a web interface. In the inspector:

1. Enter the MCP endpoint URL: `http://localhost:54321/functions/v1/simple-mcp-server/mcp`
2. **Important**: Since your server requires OAuth authentication, you'll need to:
   - First, get a valid access token from Supabase Auth
   - Or temporarily bypass auth for testing (not recommended for production)

**Note:** The MCP Inspector may not support OAuth authentication directly. You may need to:
- Use a tool like `curl` or `httpie` to test with authentication headers
- Or modify your server temporarily to allow unauthenticated access for testing

### Testing with curl

To test the OAuth metadata endpoint (no auth required):

```bash
curl http://localhost:54321/functions/v1/simple-mcp-server/.well-known/oauth-protected-resource
```

To test the MCP endpoint (requires auth):

```bash
# First, get an access token from Supabase Auth
# Then use it in the Authorization header:
curl -X POST http://localhost:54321/functions/v1/simple-mcp-server/mcp \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-06-18",
      "capabilities": {
        "elicitation": {}
      },
      "clientInfo": {
        "name": "test-client",
        "title": "Test Client",
        "version": "1.0.0"
      }
    }
  }'
```

## Deploy to Production

### Step 1: Link your project

```bash
supabase login
supabase link --project-ref <your-project-ref>
```

You can find your project ref in the Supabase Dashboard URL: `https://supabase.com/dashboard/project/<project-ref>`

### Step 2: Deploy the function

```bash
supabase functions deploy --no-verify-jwt simple-mcp-server
```

**Note:** The `--no-verify-jwt` flag is needed because your server implements its own OAuth authentication.

### Step 3: Set environment variables (if needed)

If you need to set `SUPABASE_PUBLIC_URL` for production:

```bash
supabase secrets set SUPABASE_PUBLIC_URL=https://your-project-ref.supabase.co
```

Your MCP server will be available at:
- **Production URL**: `https://<your-project-ref>.supabase.co/functions/v1/simple-mcp-server/mcp`
- **OAuth metadata**: `https://<your-project-ref>.supabase.co/functions/v1/simple-mcp-server/.well-known/oauth-protected-resource`

## Important Notes

1. **Authentication**: Your MCP server implements OAuth 2.1 authentication. Clients need to:
   - First, discover the OAuth metadata at `/.well-known/oauth-protected-resource`
   - Obtain an access token from the authorization server
   - Include the token in the `Authorization: Bearer <token>` header

2. **MCP Inspector Limitations**: The standard MCP Inspector may not support OAuth authentication. You may need to:
   - Use authenticated HTTP clients
   - Or create a test endpoint that bypasses auth (only for development)

3. **Function Configuration**: Your function is configured in `supabase/config.toml`:
   - `verify_jwt = false` - Disables Supabase's JWT verification (you handle auth)
   - `import_map` - Points to your `deno.json` with dependencies

## Troubleshooting

- **Config errors**: If you see config parsing errors, check that all sections in `config.toml` are valid
- **Function not found**: Make sure the function name matches the folder name: `simple-mcp-server`
- **Auth errors**: Verify that your access token is valid and includes the required scopes (`mcp:tools`)




