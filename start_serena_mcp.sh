#!/bin/bash

echo "Starting Serena MCP Server with Context7..."

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
echo "Starting Context7 MCP Server..."
npx -y @upstash/context7-mcp &
CONTEXT7_PID=$!
echo "Context7 MCP Server started with PID: $CONTEXT7_PID"

echo ""
echo "Both MCP servers started successfully!"
echo "Serena PID: $SERENA_PID"
echo "Context7 PID: $CONTEXT7_PID"
echo ""
echo "To stop servers, run:"
echo "kill $SERENA_PID $CONTEXT7_PID"

# Wait for both processes
wait