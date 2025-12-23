#!/bin/bash

echo "Starting Serena MCP Server..."
echo "Note: Context7 is now configured as a remote MCP server in Claude Desktop"

# Check if uv is available
if ! command -v uv &> /dev/null; then
    echo "Error: uv is not installed. Please install uv first."
    exit 1
fi

# Activate Python virtual environment
source serena_env/bin/activate

echo "Python environment activated"
echo "Node.js version: $(node --version)"
echo "NPM version: $(npm --version)"
echo "uv version: $(uv --version)"

echo ""
echo "Starting Serena MCP Server..."
uvx --from git+https://github.com/oraios/serena serena start-mcp-server &
SERENA_PID=$!
echo "Serena MCP Server started with PID: $SERENA_PID"

echo ""
echo "Serena MCP Server started successfully!"
echo "Serena PID: $SERENA_PID"
echo ""
echo "Context7 is available as remote MCP server: https://mcp.context7.com/mcp"
echo "To stop Serena server, run:"
echo "kill $SERENA_PID"

# Wait for Serena process
wait