# Code To UML platform

## Local startup

```powershell
Copy-Item .env.example .env
docker compose -f compose.code-to-uml.yml up -d --build
```

Open `http://localhost:8000`. PostgreSQL data is persisted in the `code-to-uml-postgres` Docker volume. The Kroki core and companion renderers have no host ports; all public traffic goes through the gateway.

For production, set a strong `POSTGRES_PASSWORD`, `PUBLIC_URL=https://your-domain`, and `COOKIE_SECURE=true`. Terminate TLS at a reverse proxy or load balancer. Do not expose PostgreSQL, the Kroki core, or companion ports publicly.

## Authentication

The web app uses an HttpOnly, SameSite cookie. API clients use either a personal API key or a device-flow access token:

```http
Authorization: Bearer ctu_...
```

API keys and session/access tokens are stored as SHA-256 hashes. Passwords are salted and hashed with scrypt. API keys are shown only once.

## GitHub Action

### One-command setup wizard

The public GitHub CLI extension packages installation as an interactive wizard:

```powershell
gh auth login
gh extension install PersjaVu/gh-code-to-uml
gh code-to-uml init
```

Run the command inside the target repository. The wizard detects `OWNER/REPO`, asks for Local Docker or Hosted mode, lets the user enable Markdown pre-render and/or PR semantic diff, writes the workflow files, optionally stores `CODE_TO_UML_API_KEY` with GitHub Secrets, and can commit/push after explicit confirmation.

Validate an installation with:

```powershell
gh code-to-uml doctor --server-url http://localhost:8000
```

`doctor` checks Git, GitHub authentication, Docker Engine, the Code To UML health endpoint, installed workflows and an online self-hosted runner. Release `v0.1.0` provides precompiled Windows, Linux and macOS binaries, so end users do not need Go or Node.js to run the wizard. Source and releases are available at [PersjaVu/gh-code-to-uml](https://github.com/PersjaVu/gh-code-to-uml).

Create an API key in Account, save it as the repository secret `CODE_TO_UML_API_KEY`, then use:

```yaml
- uses: your-org/code-to-uml@main
  with:
    server-url: https://uml.example.com
    api-key: ${{ secrets.CODE_TO_UML_API_KEY }}
    engine: plantuml
    format: svg
    source: docs/architecture.puml
    output: docs/architecture.svg
```

### Pull request semantic diagram diff (localhost)

The included `.github/workflows/code-to-uml-pr-diff.yml` runs on a **self-hosted GitHub runner installed on the same machine as Docker**. It connects directly to `http://localhost:8000`; no public deployment, tunnel, server URL variable or API key is required.

Start Code To UML before leaving the runner online:

```powershell
docker compose -f compose.code-to-uml.yml up -d
Invoke-WebRequest http://localhost:8000/health -UseBasicParsing
```

Register a runner from **Repository Settings → Actions → Runners → New self-hosted runner**, follow GitHub's Windows commands, and install it as a Windows service if it must receive PR jobs while no terminal is open. The workflow rejects fork PRs because self-hosted runners must not execute untrusted code.

The Action compares the PR base SHA with its head SHA, generates `artifacts/diagram-pr-diff.svg`, uploads it as the `code-to-uml-pr-diff` workflow artifact and maintains one PR summary comment. It also creates the orphan branch `diagram-artifacts`, stores SVG and PNG under `pull-requests/<number>/`, and embeds the PNG directly in the comment with Markdown image syntax. The change map uses green for added nodes, amber for modified nodes and red for removed nodes. Mermaid, PlantUML/C4, Graphviz/DOT, D2 and DBML receive semantic node/edge comparison. Markdown fenced diagrams are compared independently; other renderer files use a clearly labelled file-level fallback.

### Automatic diagrams inside GitHub Markdown

The included `.github/workflows/code-to-uml-markdown.yml` implements the pre-render strategy used when no public GitHub App is available. On every Markdown push it detects supported fenced code blocks, renders each valid block to SVG through the local service, uploads the SVG directory as a workflow artifact, and commits both the generated images under `.code-to-uml/rendered/` and the updated Markdown back to the same branch.

The Markdown displays `![title](relative-svg-path)` first. Its original diagram source remains in a collapsed `<details>` block, so the document shows an image by default while the source remains editable and detectable on the next run. The transformation is idempotent: a second run with unchanged sources creates no commit. Invalid diagrams are reported and left as source without blocking valid blocks.

`actions/upload-artifact` is kept for downloading CI output, but its authenticated ZIP URL cannot be embedded as an image. PR comments therefore use raw SVG/PNG URLs from the `diagram-artifacts` branch. Repository Markdown uses relative URLs to SVG files committed on the source branch, which makes previews work on GitHub and in repository clones.

For more than 20 guest renders per minute, set the optional `CODE_TO_UML_API_KEY` repository secret. Without it, the Action detects HTTP 429 and retries after the local Gateway rate-limit window resets.

## VS Code extension

```powershell
cd vscode-extension
npm install
npm run package
code --install-extension .\code-to-uml-0.6.1.vsix --force
```

Set `codeToUml.serverUrl` to a local or hosted service. Use **Code To UML: Open Live Preview** for render-on-change/render-on-save and **Code To UML: Export Diagram** for SVG, PNG or PDF. Authentication remains available for protected services.

Markdown files support multiple fenced diagrams. `Ctrl+Shift+V` renders supported fences in VS Code's built-in Markdown Preview. Export offers each named diagram separately and an **All diagrams** option that combines every valid diagram into one SVG while skipping and reporting invalid blocks.

## Operations

```powershell
docker compose -f compose.code-to-uml.yml ps
docker compose -f compose.code-to-uml.yml logs -f gateway
docker compose -f compose.code-to-uml.yml down
```

Do not use `down -v` unless you intentionally want to delete the PostgreSQL database.
