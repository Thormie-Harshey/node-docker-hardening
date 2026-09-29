# Image Analysis: node-docker-hardening

Hardened Docker image for a Node.js (Express) web app. Tested on September 29, 2026.

## Results at a glance

| | Scenario image | node-docker-hardening:1.1.0 |
|---|---|---|
| Size (compressed) | about 461 MB (node:latest) | 62.3 MB |
| Size (unpacked) | 1.2 GB | 247 MB |
| Runs as | root | appuser (UID 1001) |
| Known CVEs | 47 | 0 (Trivy 0.74.0) |
| Health check | none | /health every 30 seconds |

## 1. Image size reduction

The naive approach, `FROM node:latest`, uses a full Debian system with compilers and tools the app never needs.

| | node:latest | This image | Reduction |
|---|---|---|---|
| Compressed | about 461 MB | 62.3 MB | about 86% |
| Unpacked | about 1.1 GB (estimate) | 247 MB | about 78% |

The node:latest compressed figure comes from the layer sizes shown during a pull (see `screenshots/07-node-latest-layers.png`). The unpacked figure is an estimate. Confirm both on the official node tags page on Docker Hub.

The saving comes from three decisions:
- **Alpine base** (`node:24.21.0-alpine3.24`), a minimal Linux instead of full Debian.
- **Multi-stage build**, so build leftovers never reach the final image.
- **.dockerignore**, so local files like node_modules, .git and secrets never enter the build context.

## 2. How the multi-stage build reduces the attack surface

The **attack surface** is everything inside the image an attacker could target. Every extra package is a possible CVE and a possible tool for an attacker.

The Dockerfile has two stages:
- **Build stage**: installs production dependencies with `npm ci --omit=dev`, strictly from the lock file.
- **Runtime stage**: starts fresh and copies in only `node_modules` and `server.js`.

Only the final stage is shipped. The build stage is an **intermediate stage**, discarded after the build, so npm's cache and install leftovers never reach production. Development dependencies (such as nodemon) are never installed at all.

### Finding and removing hidden baggage

A first Trivy scan of version 1.0.0 found **12 CVEs (8 MEDIUM, 4 HIGH, 0 CRITICAL)**. All 12 were inside **npm itself**, which ships with the Node base image:

| Package (inside npm) | CVEs |
|---|---|
| ip-address | 5 |
| undici | 4 |
| brace-expansion | 2 |
| tar | 1 |

The app runs with `node server.js` and never uses npm at runtime. Version 1.1.0 removes npm, npx, corepack and yarn from the runtime stage. The rescan found **0 CVEs**, and the app still reports healthy.

**Limitation:** npm lives in the base image's layer. Deleting it in a later layer removes it from the running container (so it cannot be run or exploited), but the original bytes remain in the lower layer. This is why 1.0.0 and 1.1.0 are the same size. A fully clean option is listed under Next steps.

## 3. How running as non-root prevents privilege escalation

By default, containers run as **root**. If an attacker exploits a flaw in the app, they inherit the app's permissions. As root, they could change system files, install tools, and in the worst case attempt a **container escape** onto the host.

This image follows the **principle of least privilege**:
- A dedicated user `appuser` (UID 1001) and group `appgroup` (GID 1001). UID 1001 avoids a clash with the built-in `node` user (UID 1000).
- No home folder and no login shell (`/sbin/nologin`).
- `USER 1001:1001` uses numeric IDs, so Kubernetes (`runAsNonRoot`) can verify the user is not root.
- **Read-only application files**: code is copied without `--chown`, so it stays owned by root. appuser can read and run it, but not change it. An attacker cannot plant a backdoor in the app code.

Evidence:

```
$ docker exec hardening-test id
uid=1001(appuser) gid=1001(appgroup) groups=1001(appgroup)

$ docker exec hardening-test sh -c "echo hacked >> server.js"
sh: can't create server.js: Permission denied
```

## 4. Scanning the image in CI

**Tool:** Trivy by Aqua Security (free, open source).

**Command:**

```bash
trivy image --severity HIGH,CRITICAL --exit-code 1 node-docker-hardening:1.1.0
```

- `--severity HIGH,CRITICAL`: only serious findings count towards the result.
- `--exit-code 1`: if any are found, Trivy returns an error, which **fails the build**. This acts as a **security gate**: the image cannot be pushed until it passes.

Example GitHub Actions step, run after the image is built:

```yaml
- name: Scan image with Trivy
  run: |
    docker run --rm \
      -v /var/run/docker.sock:/var/run/docker.sock \
      aquasec/trivy:0.74.0 image \
      --severity HIGH,CRITICAL --exit-code 1 \
      node-docker-hardening:${{ github.sha }}
```

The scanner itself is **pinned** (`0.74.0`). Security tools are part of the supply chain too, and Trivy's own GitHub Action suffered a supply chain attack in 2026.

## 5. Handling a CVE in the base image with no fix available

When a CVE has no fixed version, updating is not possible. The steps are:

1. **Assess exploitability.** Check whether the app actually uses the vulnerable code. Many CVEs sit in parts of a package the app never touches.
2. **Remove the package if the app does not need it.** No package, no CVE. This is exactly what version 1.1.0 did with npm.
3. **Switch base image.** A different Alpine version, or a distroless image, may not contain the package.
4. **Rely on compensating controls.** This image already limits the damage through **defence in depth**: non-root user, read-only code, minimal Alpine base, and no package managers.
5. **Accept the risk temporarily, in writing.** Add the CVE to a `.trivyignore` file with the reason and a review date, so the pipeline passes but the decision is recorded.
6. **Monitor and rebuild.** Watch for the fix, then rebuild, rescan and redeploy.

## Next steps

- Pin the base image by **digest** (`@sha256:...`) as well as by tag, so it can never change silently.
- Build the runtime stage from bare Alpine or distroless, copying in only the Node.js binary, so npm is never in any layer.
- Add a CI schedule to rescan the image regularly, as new CVEs are published after the image is built.

## Evidence

| Screenshot | Shows |
|---|---|
| [01-build.png](screenshots/01-build.png) | Successful multi-stage build |
| [02-health-browser.png](screenshots/02-health-browser.png) | App responding at /health |
| [03-healthy-status.png](screenshots/03-healthy-status.png) | Container marked healthy |
| [04-non-root-user.png](screenshots/04-non-root-user.png) | Running as UID 1001 |
| [05-read-only-code.png](screenshots/05-read-only-code.png) | Code cannot be modified |
| [06-image-size.png](screenshots/06-image-size.png) | Image size |
| [07-node-latest-layers.png](screenshots/07-node-latest-layers.png) | node:latest layer sizes |
| [08-trivy-summary.png](screenshots/08-trivy-summary.png) | First scan summary |
| [09-trivy-findings.png](screenshots/09-trivy-findings.png) | 12 CVEs found in npm |
| [10-trivy-findings-2.png](screenshots/10-trivy-findings-2.png) | CVE details |
| [11-trivy-after-fix.png](screenshots/11-trivy-after-fix.png) | 0 CVEs after removing npm |
| [12-v1.1.0-verified.png](screenshots/12-v1.1.0-verified.png) | Healthy, npm gone, sizes compared |