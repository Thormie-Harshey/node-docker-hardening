# node-docker-hardening

A production-grade, security-hardened Dockerfile for a small Node.js (Express) web app.

## Results

| | Naive image | This image (1.1.0) |
|---|---|---|
| Size (compressed) | about 461 MB (node:latest) | 62.3 MB |
| Runs as | root | appuser (UID 1001) |
| Known CVEs (Trivy) | 12 in first build | 0 |
| Health check | none | /health every 30 seconds |

Full reasoning and evidence: [IMAGE-ANALYSIS.md](IMAGE-ANALYSIS.md)

## Quick start

```bash
docker build -t node-docker-hardening:1.1.0 .
docker run -d --name hardening-test -p 3000:3000 node-docker-hardening:1.1.0
curl http://localhost:3000/health
```

Check it is healthy and running as non-root:

```bash
docker ps
docker exec hardening-test id
```

Scan it:

```bash
trivy image --severity HIGH,CRITICAL --exit-code 1 node-docker-hardening:1.1.0
```

## Key decisions

- **Minimal, pinned base**: `node:24.21.0-alpine3.24` (Node.js 24 LTS), never `:latest`.
- **Multi-stage build**: dependencies installed in a build stage; only `node_modules` and `server.js` reach the runtime stage.
- **Non-root user**: `appuser` (UID 1001), no login shell, code kept read-only.
- **No package managers at runtime**: npm, npx, corepack and yarn removed, which cleared all 12 CVEs.
- **Health check**: Docker checks `/health` every 30 seconds.
- **.dockerignore**: keeps node_modules, .git, tests, secrets and logs out of the build context.

## Files

| File | Purpose |
|---|---|
| `Dockerfile` | The hardened, multi-stage build |
| `.dockerignore` | What never enters the build context |
| `IMAGE-ANALYSIS.md` | Size, security and scanning analysis |
| `server.js`, `package.json` | Minimal Express app used for testing |
| `screenshots/` | Evidence from each test |