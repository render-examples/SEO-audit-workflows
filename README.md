# SEO Auditor - Render Workflows Demo

A website SEO analysis tool demonstrating [Render Workflows](https://render.com/docs/workflows) for distributed task execution.

> [!WARNING]
> Render Workflows is currently in **early access**. The API and SDK may introduce breaking changes. Public beta coming soon.

Enter a URL and the app crawls your site, spawning parallel analysis tasks across multiple instances to check:

- **Meta tags**: Title, description, Open Graph tags
- **Broken links**: HTTP status validation
- **Heading structure**: H1-H6 hierarchy
- **Image accessibility**: Alt text presence
- **Performance**: Page size, load time, resource count

## Architecture

This demo consists of three services:

```
┌─────────────────┐     ┌─────────────────┐     ┌──────────────────────────────┐
│    Frontend     │     │   API Service   │     │      Workflow Service        │
│  (Static Site)  │     │ (Python or TS)  │     │                              │
│                 │     │                 │     │                              │
│  React + Vite  ──────▶│  POST /audit   ──────▶│  audit_site task             │
│                 │     │                 │ SDK │      │                       │
│  Results UI  ◀────────│  GET /audit/:id ◀──── │      ▼                       │
│                 │     │                 │     │  crawl_pages task            │
└─────────────────┘     └─────────────────┘     │      │                       │
                                                │      ▼                       │
                                                │  ┌────────────────────────┐  │
                                                │  │ analyze_page (×N)      │  │
                                                │  │ ... parallel tasks     │  │
                                                │  └────────────────────────┘  │
                                                └──────────────────────────────┘
```

## Repository structure

```
├── frontend/           # React frontend (shared by both backends)
│   ├── src/
│   └── render.yaml     # Blueprint for static site
├── python/             # Python implementation
│   ├── api/            # Flask API
│   ├── workflows/      # Workflow tasks
│   └── render.yaml     # Blueprint for API service
└── typescript/         # TypeScript implementation
    ├── api/            # Express API
    ├── workflows/      # Workflow tasks
    └── render.yaml     # Blueprint for API service
```

## Deployment

You need to deploy **3 services**:

### 1. Deploy the Workflow service

Workflows are created via the Render Dashboard (not render.yaml):

1. Go to the [Render Dashboard](https://dashboard.render.com)
1. Select **New** > **Workflow**
1. Connect your repository
1. Configure:
   - **Name**: `seo-audit-workflow` (this becomes your workflow slug)
   - **Root Directory**: `python` or `typescript`
   - **Build Command**: See language-specific README
   - **Start Command**: See language-specific README
1. Deploy the workflow

### 2. Deploy the API service

Choose Python or TypeScript:

| Language   | Root Directory | Build Command                     | Start Command                  |
| ---------- | -------------- | --------------------------------- | ------------------------------ |
| Python     | `python`       | `pip install -r requirements.txt` | `gunicorn --chdir api app:app` |
| TypeScript | `typescript`   | `npm install && npm run build`    | `node dist/api/index.js`       |

1. Go to the [Render Dashboard](https://dashboard.render.com)
1. Select **New** > **Web Service**
1. Connect your repository
1. Configure using the table above
1. Add environment variables:
   - `RENDER_API_KEY`: Your [Render API key](https://render.com/docs/api#1-create-an-api-key)
   - `WORKFLOW_SLUG`: The name of your workflow (e.g., `seo-audit-workflow`)
   - `WORKFLOW_ID`: The workflow ID (e.g., `wfl-xxxxx`) for task discovery in the UI
1. Deploy and note the service URL (e.g., `https://seo-audit-api-py.onrender.com`)

### 3. Deploy the Frontend

1. Go to the [Render Dashboard](https://dashboard.render.com)
1. Select **New** > **Static Site**
1. Connect your repository
1. Configure:
   - **Name**: `seo-audit-frontend`
   - **Root Directory**: `frontend`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
1. Add environment variable:
   - `VITE_API_URL`: Auto-populated from the API service host in `render.yaml`
     - You can override it with a full URL if needed
1. Deploy

## Local development

### Frontend

```sh
cd frontend
npm install

npm run dev
```

### Backend

See the language-specific READMEs for backend setup:

- [Python README](python/README.md)
- [TypeScript README](typescript/README.md)

## How it works

1. User submits a URL via the frontend
1. Frontend calls the API service (`POST /audit`)
1. API triggers the `audit_site` workflow task
1. `audit_site` spawns `crawl_pages` to discover pages (via sitemap or link crawling)
1. For each discovered page, `audit_site` spawns an `analyze_page` task
1. Each `analyze_page` runs independently on its own compute instance
1. Results are aggregated and returned via the API to the frontend

This demonstrates Workflows' key capability: distributing work across many instances with automatic orchestration, retries, and observability.

> [!NOTE]
> Workflow concurrency limits vary by plan: Hobby (5), Pro (25), Org (100). These limits may change after beta.

## API endpoints

| Method | Endpoint     | Description                                                     |
| ------ | ------------ | --------------------------------------------------------------- |
| `GET`  | `/`          | Health check                                                    |
| `POST` | `/audit`     | Start an audit (body: `{"url": "...", "max_pages": 25}`)        |
| `GET`  | `/audit/:id` | Get audit status and results                                    |
| `GET`  | `/health`    | Health check                                                    |
