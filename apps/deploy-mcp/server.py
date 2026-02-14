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

_CONFIG_PATH = os.environ.get(
    "DEPLOY_MCP_CONFIG",
    os.path.join(os.path.dirname(__file__), "environments.json"),
)


def _load_environments() -> dict:
    with open(_CONFIG_PATH) as f:
        return json.load(f)


ENVIRONMENTS = _load_environments()
DEFAULT_ENV = "prod"


def get_env_config(env: str) -> dict:
    """Get config for a named environment, raise ValueError if not found."""
    if env not in ENVIRONMENTS:
        raise ValueError(
            f"Unknown environment '{env}'. Available: {list(ENVIRONMENTS.keys())}"
        )
    return ENVIRONMENTS[env]


def _get_git_commit(repo_dir: str) -> str:
    """Read the current git commit hash."""
    try:
        return (
            subprocess.check_output(
                ["git", "rev-parse", "--short", "HEAD"],
                cwd=repo_dir,
                stderr=subprocess.DEVNULL,
            )
            .decode()
            .strip()
        )
    except Exception:
        return "unknown"


STARTUP_COMMIT = _get_git_commit(get_env_config(DEFAULT_ENV)["repo_dir"])

# ---------------------------------------------------------------------------
# FastMCP — tool definitions
# ---------------------------------------------------------------------------

mcp = FastMCP("deploy")


async def run_command(
    cmd: str, timeout: int = 300, cwd: str | None = None
) -> dict:
    """Run a shell command asynchronously with timeout."""
    default_cwd = get_env_config(DEFAULT_ENV)["repo_dir"]
    proc = await asyncio.create_subprocess_shell(
        cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=cwd or default_cwd,
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


async def _run_deploy_live(cfg: dict, timeout: int) -> dict:
    """Replicate Makefile deploy-live logic with the environment's compose command."""
    compose = cfg["compose_cmd"]
    repo_dir = cfg["repo_dir"]

    steps = [
        f"{compose} build",
        f"{compose} up -d --no-deps --no-recreate redis mongo postgres elasticsearch meme qdrant rabbitmq",
        "sleep 5",
        f"{compose} up -d --no-deps --no-recreate logstash kibana",
        "sleep 5",
        f"{compose} up -d --no-deps ai-app app ai-service-arq-worker vectorize-worker recall-worker monitor-dashboard",
    ]

    full_cmd = " && ".join(steps)
    return await run_command(full_cmd, timeout=timeout, cwd=repo_dir)


@mcp.tool()
async def deploy(env: str = "prod", timeout: int = 600) -> dict:
    """Trigger deployment: git pull + deploy, then wait for healthy.

    Args:
        env: Target environment name (default "prod").
        timeout: Max seconds to wait for the deploy command (default 600).

    Returns:
        Dict with success status, deployed commits, build output, and health check results.
    """
    cfg = get_env_config(env)
    repo_dir = cfg["repo_dir"]

    old_head_result = await run_command(
        "git rev-parse HEAD", timeout=10, cwd=repo_dir
    )
    old_head = old_head_result["stdout"].strip()

    pull = await run_command("git pull --ff-only", timeout=60, cwd=repo_dir)
    if pull["returncode"] != 0:
        return {
            "success": False,
            "stage": "git_pull",
            "error": pull["stderr"] or pull["stdout"],
        }

    new_head_result = await run_command(
        "git rev-parse HEAD", timeout=10, cwd=repo_dir
    )
    new_head = new_head_result["stdout"].strip()

    if old_head == new_head:
        return {
            "success": True,
            "stage": "no_changes",
            "message": "Already up to date, no deployment needed.",
        }

    commits_result = await run_command(
        f"git log --oneline {old_head}..HEAD", timeout=10, cwd=repo_dir
    )

    deploy_result = await _run_deploy_live(cfg, timeout)
    if deploy_result["returncode"] != 0:
        return {
            "success": False,
            "stage": "deploy",
            "commits": commits_result["stdout"],
            "error": deploy_result["stderr"][-2000:]
            or deploy_result["stdout"][-2000:],
        }

    health = await _wait_for_healthy(env=env, timeout=120)

    return {
        "success": health["all_healthy"],
        "commits": commits_result["stdout"],
        "deploy_output": deploy_result["stdout"][-2000:],
        "health": health,
    }


@mcp.tool()
async def deploy_branch(
    branch: str, env: str = "staging", timeout: int = 600
) -> dict:
    """Checkout a specific branch and deploy to an environment.

    Args:
        branch: Git branch name to deploy.
        env: Target environment (must have allow_branch_deploy=true, default "staging").
        timeout: Max seconds for deployment.

    Returns:
        Dict with success status, branch info, deploy output, and health check results.
    """
    cfg = get_env_config(env)
    if not cfg.get("allow_branch_deploy"):
        return {
            "success": False,
            "error": f"Branch deploy not allowed for '{env}'",
        }

    repo_dir = cfg["repo_dir"]

    fetch = await run_command("git fetch --all", timeout=60, cwd=repo_dir)
    if fetch["returncode"] != 0:
        return {
            "success": False,
            "stage": "git_fetch",
            "error": fetch["stderr"] or fetch["stdout"],
        }

    checkout = await run_command(
        f"git checkout {branch}", timeout=30, cwd=repo_dir
    )
    if checkout["returncode"] != 0:
        return {
            "success": False,
            "stage": "git_checkout",
            "error": checkout["stderr"] or checkout["stdout"],
        }

    pull = await run_command("git pull --ff-only", timeout=60, cwd=repo_dir)
    if pull["returncode"] != 0:
        return {
            "success": False,
            "stage": "git_pull",
            "error": pull["stderr"] or pull["stdout"],
        }

    deploy_result = await _run_deploy_live(cfg, timeout)
    if deploy_result["returncode"] != 0:
        return {
            "success": False,
            "stage": "deploy",
            "branch": branch,
            "error": deploy_result["stderr"][-2000:]
            or deploy_result["stdout"][-2000:],
        }

    health = await _wait_for_healthy(env=env, timeout=120)

    head_result = await run_command(
        "git rev-parse --short HEAD", timeout=10, cwd=repo_dir
    )

    return {
        "success": health["all_healthy"],
        "branch": branch,
        "commit": head_result["stdout"].strip(),
        "deploy_output": deploy_result["stdout"][-2000:],
        "health": health,
    }


async def _get_container_status(env: str = "prod") -> list[dict]:
    """Get running status, health, uptime, and restart count for all Docker Compose containers."""
    cfg = get_env_config(env)
    compose = cfg["compose_cmd"]
    repo_dir = cfg["repo_dir"]

    ps_result = await run_command(
        f"{compose} ps --format json", timeout=15, cwd=repo_dir
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
            cwd=repo_dir,
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


async def _check_services_health(env: str = "prod") -> list[dict]:
    """Call health endpoints of all application services and return their status."""
    cfg = get_env_config(env)
    endpoints = cfg["health_endpoints"]

    results = []
    async with httpx.AsyncClient(timeout=5) as client:
        for name, url in endpoints:
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
async def get_deploy_log(env: str = "prod", lines: int = 100) -> dict:
    """Read the most recent deployment log entries.

    Args:
        env: Target environment name (default "prod").
        lines: Number of lines to read from the end of the log (default 100).
    """
    cfg = get_env_config(env)
    log_dir = cfg["log_dir"]

    log_files = [
        f"{log_dir}/deploy_history.log",
        f"{log_dir}/auto_deploy.log",
        f"{log_dir}/cron.log",
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


async def _wait_for_healthy(env: str = "prod", timeout: int = 120) -> dict:
    """Poll until all services are healthy or timeout is reached."""
    deadline = time.time() + timeout
    health: list[dict] = []
    containers: list[dict] = []

    while time.time() < deadline:
        health = await _check_services_health(env=env)
        containers = await _get_container_status(env=env)

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
async def get_container_status(env: str = "prod") -> list[dict]:
    """Get running status, health, uptime, and restart count for all Docker Compose containers.

    Args:
        env: Target environment name (default "prod").
    """
    return await _get_container_status(env=env)


@mcp.tool()
async def check_services_health(env: str = "prod") -> list[dict]:
    """Call health endpoints of all application services and return their status.

    Args:
        env: Target environment name (default "prod").
    """
    return await _check_services_health(env=env)


@mcp.tool()
async def wait_for_healthy(env: str = "prod", timeout: int = 120) -> dict:
    """Poll until all services are healthy or timeout is reached.

    Args:
        env: Target environment name (default "prod").
        timeout: Max seconds to wait (default 120).

    Returns:
        Dict with all_healthy flag, per-service health, container status, and timeout info.
    """
    return await _wait_for_healthy(env=env, timeout=timeout)


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
