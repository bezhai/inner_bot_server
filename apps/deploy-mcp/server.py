"""Deploy MCP Server — remote deployment and observability for Claude Code.

Runs on the production machine, exposes MCP tools via SSE.
Claude Code connects remotely to trigger deploys and check service health.

Auth: Bearer token via DEPLOY_MCP_TOKEN env var (reuses INNER_HTTP_SECRET).
"""

import asyncio
import json
import os
import subprocess
import time

import httpx
import uvicorn
from fastmcp import FastMCP
from starlette.middleware import Middleware
from starlette.requests import Request
from starlette.responses import JSONResponse

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


def _get_git_commit() -> str:
    """Read the current git commit hash at startup."""
    try:
        return (
            subprocess.check_output(
                ["git", "rev-parse", "--short", "HEAD"],
                cwd=REPO_DIR,
                stderr=subprocess.DEVNULL,
            )
            .decode()
            .strip()
        )
    except Exception:
        return "unknown"


STARTUP_COMMIT = _get_git_commit()

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

    health = await _wait_for_healthy(timeout=120)

    return {
        "success": health["all_healthy"],
        "commits": commits_result["stdout"],
        "deploy_output": deploy_result["stdout"][-2000:],
        "health": health,
    }


async def _get_container_status() -> list[dict]:
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


async def _check_services_health() -> list[dict]:
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


async def _wait_for_healthy(timeout: int = 120) -> dict:
    """Poll until all services are healthy or timeout is reached."""
    deadline = time.time() + timeout
    health: list[dict] = []
    containers: list[dict] = []

    while time.time() < deadline:
        health = await _check_services_health()
        containers = await _get_container_status()

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


@mcp.tool()
async def get_container_status() -> list[dict]:
    """Get running status, health, uptime, and restart count for all Docker Compose containers."""
    return await _get_container_status()


@mcp.tool()
async def check_services_health() -> list[dict]:
    """Call health endpoints of all application services and return their status."""
    return await _check_services_health()


@mcp.tool()
async def wait_for_healthy(timeout: int = 120) -> dict:
    """Poll until all services are healthy or timeout is reached.

    Args:
        timeout: Max seconds to wait (default 120).

    Returns:
        Dict with all_healthy flag, per-service health, container status, and timeout info.
    """
    return await _wait_for_healthy(timeout=timeout)


# ---------------------------------------------------------------------------
# Custom routes
# ---------------------------------------------------------------------------


@mcp.custom_route("/health", methods=["GET"])
async def health_check(request: Request) -> JSONResponse:
    return JSONResponse({"status": "ok", "commit": STARTUP_COMMIT})


# ---------------------------------------------------------------------------
# Auth middleware
# ---------------------------------------------------------------------------


class BearerAuthMiddleware:
    """Pure ASGI middleware for Bearer token auth.

    BaseHTTPMiddleware wraps response bodies and is incompatible with SSE
    streaming. This raw ASGI implementation passes SSE through untouched.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        path = scope.get("path", "")
        if path == "/health":
            return await self.app(scope, receive, send)

        if DEPLOY_MCP_TOKEN:
            headers = dict(scope.get("headers", []))
            auth = headers.get(b"authorization", b"").decode()
            if auth != f"Bearer {DEPLOY_MCP_TOKEN}":
                response = JSONResponse(
                    {"error": "unauthorized"}, status_code=401
                )
                return await response(scope, receive, send)

        return await self.app(scope, receive, send)


# ---------------------------------------------------------------------------
# ASGI app — FastMCP handles SSE transport + tool dispatch natively
# ---------------------------------------------------------------------------

middlewares = []
if DEPLOY_MCP_TOKEN:
    middlewares.append(Middleware(BearerAuthMiddleware))

app = mcp.http_app(transport="sse", middleware=middlewares)

if __name__ == "__main__":
    port = int(os.environ.get("DEPLOY_MCP_PORT", "9099"))
    uvicorn.run(app, host="0.0.0.0", port=port)
