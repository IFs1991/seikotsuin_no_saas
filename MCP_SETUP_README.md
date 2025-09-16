# Serena MCP Server with Context7 Setup Guide

## Overview
This setup integrates the Upstash Context7 MCP server with your Serena development environment, providing up-to-date documentation access for AI-powered code assistance.

## What was installed
- Context7 MCP Server by Upstash
- Node.js environment integration
- Multiple configuration files for different MCP clients

## Starting the MCP Server

### Quick Start
Run the startup script:
```bash
./start_serena_mcp.sh
```

### Manual Start
```bash
# Standard stdio mode (for most MCP clients)
npx -y @upstash/context7-mcp

# HTTP mode (for web-based integrations)
npx -y @upstash/context7-mcp --transport http --port 3001
```

## MCP Client Configuration

### For Claude Desktop
Copy the contents of `claude_desktop_config.json` to your Claude Desktop configuration file:
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/claude/claude_desktop_config.json`

### For Cursor
Copy the contents of `cursor_mcp_config.json` to:
- Windows: `%APPDATA%\Cursor\User\mcp.json`
- macOS: `~/.cursor/mcp.json`
- Linux: `~/.cursor/mcp.json`

### For VS Code
Add to your VS Code settings.json:
```json
{
  "mcp": {
    "servers": {
      "context7": {
        "command": "npx",
        "args": ["-y", "@upstash/context7-mcp"]
      }
    }
  }
}
```

## Usage
Once configured, you can use Context7 by mentioning "use context7" in your prompts to get up-to-date documentation for any library or framework.

## Files Created
- `claude_desktop_config.json` - Claude Desktop MCP configuration
- `cursor_mcp_config.json` - Cursor MCP configuration  
- `start_serena_mcp.sh` - Startup script
- `MCP_SETUP_README.md` - This setup guide

## Troubleshooting
- Ensure Node.js v18+ is installed
- Make sure the startup script has execute permissions: `chmod +x start_serena_mcp.sh`
- Check that the MCP server responds: `npx -y @upstash/context7-mcp --help`