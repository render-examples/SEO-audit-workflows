# SEO Auditor

A website SEO analysis tool demonstrating [Render Workflows](https://render.com/docs/workflows) for distributed task execution.

Enter a URL and the app crawls your site, spawning parallel analysis tasks across multiple instances to check:

- **Meta tags**: Title, description, Open Graph tags
- **Broken links**: HTTP status validation
- **Heading structure**: H1-H6 hierarchy
- **Image accessibility**: Alt text presence
- **Performance**: Page size, load time, resource count

## Architecture

```
┌─────────────────┐         ┌──────────────────────────────────────┐
│   API Service   │         │          Workflow Service            │
│                 │         │                                      │
│  HTML Form ───────────────▶ audit_site task                      │
│                 │  SDK    │      │                               │
│  Results UI ◀─────────────│      ▼                               │
│                 │         │  crawl_pages task                    │
└─────────────────┘         │      │                               │
                            │      ▼                               │
                            │  ┌───────────────────────────────┐   │
                            │  │ analyze_page  analyze_page    │   │
                            │  │ analyze_page  analyze_page    │   │
                            │  │     ... (parallel tasks)      │   │
                            │  └───────────────────────────────┘   │
                            └──────────────────────────────────────┘
```

## Prerequisites

- A Render account with Workflows access (request at [render.com/workflows](https://render.com/workflows))
- A Render API key
- Python 3.10+

## Deployment

### 1. Create the workflow service

Workflows are created via the Render Dashboard (not render.yaml during early access):

1. Go to the [Render Dashboard](https://dashboard.render.com)
1. Select **New** > **Workflow**
1. Connect your repository containing this code
1. Configure:
   - **Name**: `seo-audit-workflow`
   - **Root Directory**: `python/workflow`
   - **Build Command**: `cd .. && pip install -r requirements.txt`
   - **Start Command**: `render-workflows main:app`
1. Deploy the workflow

### 2. Deploy the API service

Use the included `render.yaml` blueprint:

1. Go to the [Render Dashboard](https://dashboard.render.com)
1. Select **New** > **Blueprint**
1. Connect this repository
1. Configure environment variables:
   - `RENDER_API_KEY`: Your Render API key
   - `WORKFLOW_SLUG`: The slug of your workflow (e.g., `seo-audit-workflow`)
   - `WORKFLOW_ID`: The workflow ID (e.g., `wfl-xxxxx`) for task discovery in the UI

Or deploy manually:

1. Select **New** > **Web Service**
1. Connect your repository
1. Configure:
   - **Name**: `seo-audit-api`
   - **Root Directory**: `python`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn --chdir api app:app`
1. Add the environment variables listed above

### 3. Deploy the frontend

See the [main README](../README.md#3-deploy-the-frontend) for frontend deployment instructions. The frontend is shared between Python and TypeScript backends.

## Local development

1. Create and activate a virtual environment:

   ```sh
   python3 -m venv .venv
   source .venv/bin/activate
   ```

1. Upgrade pip:

   ```sh
   pip install --upgrade pip
   ```

1. Install dependencies:

   ```sh
   pip install -r requirements.txt
   ```

1. Create a `.env` file:

   ```sh
   cat > .env << 'EOF'
   RENDER_USE_LOCAL_DEV=true
   WORKFLOW_SLUG=seo-audit-workflow
   WORKFLOW_ID=wfl-xxxxx
   EOF
   ```

1. Start the local task server (in one terminal):

   ```sh
   render workflows dev -- render-workflows workflow.main:app
   ```

   The `render-workflows` CLI discovers tasks from the `app` instance in `workflow/main.py`.

1. Run the API service (in another terminal):

   ```sh
   cd api && flask run
   ```

   The app loads settings from `.env` automatically.

For more details, see the [Workflows local development guide](https://render.com/docs/workflows-local-development).

## Project structure

```
├── workflow/
│   ├── main.py           # Workflow task definitions
│   └── analyzers.py      # SEO analysis functions
├── api/
│   └── app.py            # Flask API
├── requirements.txt
├── render.yaml           # Blueprint for API service
└── README.md
```

## How it works

1. User submits a URL via the frontend
1. API service triggers the `audit_site` workflow task
1. `audit_site` calls `crawl_pages` to discover pages (sitemap or link crawling)
1. For each discovered page, `audit_site` spawns an `analyze_page` task
1. Each `analyze_page` runs independently on its own instance
1. Results are aggregated and returned to the frontend

This demonstrates Workflows' key capability: distributing work across many instances with automatic orchestration, retries, and observability.

## API endpoints

| Method | Endpoint      | Description                                              |
| ------ | ------------- | -------------------------------------------------------- |
| `GET`  | `/`           | Health check                                             |
| `POST` | `/audit`      | Start an audit (body: `{"url": "...", "max_pages": 25}`) |
| `GET`  | `/audit/<id>` | Get audit status and results                             |
| `GET`  | `/health`     | Health check                                             |
