"""Deploy MCP Server — remote deployment and observability for Claude Code.

Runs on the production machine, exposes MCP tools via SSE.
Claude Code connects remotely to trigger deploys and check service health.

Auth: Bearer token via DEPLOY_MCP_TOKEN env var (reuses INNER_HTTP_SECRET).
"""

import asyncio
import json
import os
import time

import httpx
import uvicorn
from fastmcp import FastMCP
from mcp.server.sse import SseServerTransport
from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Mount, Route

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DEPLOY_MCP_TOKEN = os.environ.get("DEPLOY_MCP_TOKEN") or os.environ.get(
    "INNER_HTTP_SECRET", ""
)
REPO_DIR = os.environ.get("REPO_DIR", "/data/inner_bot_server")
COMPOSE_CMD = (
    "docker compose --env-file .env"
    " -f infra/main/compose/docker-compose.infra.yml"
    " -f infra/main/compose/docker-compose.apps.yml"
)
HEALTH_ENDPOINTS = [
    ("main-server", "http://localhost:3001/api/health"),
    ("ai-service", "http://localhost:8000/health"),
]

# ---------------------------------------------------------------------------
# FastMCP — tool definitions
# ---------------------------------------------------------------------------

mcp = FastMCP("deploy")


async def run_command(
    cmd: str, timeout: int = 300, cwd: str | None = None
) -> dict:
    """Run a shell command asynchronously with timeout."""
    proc = await asyncio.create_subprocess_shell(
        cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=cwd or REPO_DIR,
    )
    try:
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(), timeout=timeout
        )
        return {
            "returncode": proc.returncode,
            "stdout": stdout.decode(errors="replace"),
            "stderr": stderr.decode(errors="replace"),
        }
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        return {
            "returncode": -1,
            "stdout": "",
            "stderr": f"Command timed out after {timeout}s",
        }


@mcp.tool()
async def deploy(timeout: int = 600) -> dict:
    """Trigger production deployment: git pull + make deploy-live, then wait for healthy.

    Args:
        timeout: Max seconds to wait for the deploy command (default 600).

    Returns:
        Dict with success status, deployed commits, build output, and health check results.
    """
    old_head_result = await run_command("git rev-parse HEAD", timeout=10)
    old_head = old_head_result["stdout"].strip()

    pull = await run_command("git pull --ff-only", timeout=60)
    if pull["returncode"] != 0:
        return {
            "success": False,
            "stage": "git_pull",
            "error": pull["stderr"] or pull["stdout"],
        }

    new_head_result = await run_command("git rev-parse HEAD", timeout=10)
    new_head = new_head_result["stdout"].strip()

    if old_head == new_head:
        return {
            "success": True,
            "stage": "no_changes",
            "message": "Already up to date, no deployment needed.",
        }

    commits_result = await run_command(
        f"git log --oneline {old_head}..HEAD", timeout=10
    )

    deploy_result = await run_command("make deploy-live", timeout=timeout)
    if deploy_result["returncode"] != 0:
        return {
            "success": False,
            "stage": "deploy",
            "commits": commits_result["stdout"],
            "error": deploy_result["stderr"][-2000:]
            or deploy_result["stdout"][-2000:],
        }

    health = await wait_for_healthy(timeout=120)

    return {
        "success": health["all_healthy"],
        "commits": commits_result["stdout"],
        "deploy_output": deploy_result["stdout"][-2000:],
        "health": health,
    }


@mcp.tool()
async def get_container_status() -> list[dict]:
    """Get running status, health, uptime, and restart count for all Docker Compose containers."""
    ps_result = await run_command(
        f"{COMPOSE_CMD} ps --format json", timeout=15
    )
    if ps_result["returncode"] != 0:
        return [{"error": ps_result["stderr"] or ps_result["stdout"]}]

    containers = []
    for line in ps_result["stdout"].strip().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            c = json.loads(line)
        except json.JSONDecodeError:
            continue

        name = c.get("Name", c.get("name", "unknown"))

        inspect_result = await run_command(
            f"docker inspect --format '{{{{.RestartCount}}}}' {name}",
            timeout=5,
        )
        restart_count = 0
        if inspect_result["returncode"] == 0:
            try:
                restart_count = int(inspect_result["stdout"].strip())
            except ValueError:
                pass

        containers.append(
            {
                "name": name,
                "state": c.get("State", c.get("state", "unknown")),
                "status": c.get("Status", c.get("status", "unknown")),
                "health": c.get("Health", c.get("health", "")),
                "restart_count": restart_count,
            }
        )

    return containers


@mcp.tool()
async def check_services_health() -> list[dict]:
    """Call health endpoints of all application services and return their status."""
    results = []
    async with httpx.AsyncClient(timeout=5) as client:
        for name, url in HEALTH_ENDPOINTS:
            try:
                r = await client.get(url)
                try:
                    body = r.json()
                except Exception:
                    body = r.text[:500]
                results.append(
                    {"service": name, "status": r.status_code, "body": body}
                )
            except Exception as e:
                results.append(
                    {
                        "service": name,
                        "status": "unreachable",
                        "error": str(e),
                    }
                )
    return results


@mcp.tool()
async def get_deploy_log(lines: int = 100) -> dict:
    """Read the most recent deployment log entries.

    Args:
        lines: Number of lines to read from the end of the log (default 100).
    """
    log_files = [
        "/var/log/inner_bot_server/deploy_history.log",
        "/var/log/inner_bot_server/auto_deploy.log",
        "/var/log/inner_bot_server/cron.log",
    ]
    result = {}
    for log_file in log_files:
        name = os.path.basename(log_file)
        log_result = await run_command(
            f"tail -n {lines} {log_file}", timeout=5
        )
        if log_result["returncode"] == 0 and log_result["stdout"].strip():
            result[name] = log_result["stdout"]
        else:
            result[name] = f"(not available: {log_result['stderr'].strip()})"
    return result


@mcp.tool()
async def wait_for_healthy(timeout: int = 120) -> dict:
    """Poll until all services are healthy or timeout is reached.

    Args:
        timeout: Max seconds to wait (default 120).

    Returns:
        Dict with all_healthy flag, per-service health, container status, and timeout info.
    """
    deadline = time.time() + timeout
    health: list[dict] = []
    containers: list[dict] = []

    while time.time() < deadline:
        health = await check_services_health()
        containers = await get_container_status()

        all_services_ok = all(s.get("status") == 200 for s in health)
        all_containers_ok = all(
            c.get("state") in ("running",)
            for c in containers
            if not isinstance(c.get("error"), str)
        )

        if all_services_ok and all_containers_ok:
            return {
                "all_healthy": True,
                "services": health,
                "containers": containers,
            }

        await asyncio.sleep(5)

    return {
        "all_healthy": False,
        "timed_out": True,
        "elapsed_seconds": timeout,
        "services": health,
        "containers": containers,
    }


# ---------------------------------------------------------------------------
# Auth middleware
# ---------------------------------------------------------------------------


class BearerAuthMiddleware(BaseHTTPMiddleware):
    """Reject requests without a valid Bearer token (skips /health)."""

    async def dispatch(self, request: Request, call_next):
        if request.url.path == "/health":
            return await call_next(request)
        if DEPLOY_MCP_TOKEN:
            auth = request.headers.get("authorization", "")
            if auth != f"Bearer {DEPLOY_MCP_TOKEN}":
                return JSONResponse(
                    {"error": "unauthorized"}, status_code=401
                )
        return await call_next(request)


# ---------------------------------------------------------------------------
# ASGI app — manual SSE wiring so we can inject auth middleware
# ---------------------------------------------------------------------------

sse_transport = SseServerTransport("/messages/")


async def handle_sse(request: Request):
    """SSE endpoint: long-lived connection for MCP communication."""
    async with sse_transport.connect_sse(
        request.scope, request.receive, request._send
    ) as (read_stream, write_stream):
        await mcp._mcp_server.run(
            read_stream,
            write_stream,
            mcp._mcp_server.create_initialization_options(),
        )


async def health_check(request: Request):
    return JSONResponse({"status": "ok"})


middlewares = []
if DEPLOY_MCP_TOKEN:
    middlewares.append(Middleware(BearerAuthMiddleware))

app = Starlette(
    routes=[
        Route("/health", health_check),
        Route("/sse", handle_sse),
        Mount("/messages/", app=sse_transport.handle_post_message),
    ],
    middleware=middlewares,
)

if __name__ == "__main__":
    port = int(os.environ.get("DEPLOY_MCP_PORT", "9090"))
    uvicorn.run(app, host="0.0.0.0", port=port)
