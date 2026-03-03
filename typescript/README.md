# SEO Auditor (TypeScript)

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
│   (Express)     │         │                                      │
│                 │         │                                      │
│  Frontend ────────────────▶ audit_site task                      │
│                 │  SDK    │      │                               │
│  Results    ◀─────────────│      ▼                               │
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
- Node.js 20+

## Deployment

### 1. Create the workflow service

Workflows are created via the Render Dashboard (not render.yaml during early access):

1. Go to the [Render Dashboard](https://dashboard.render.com)
1. Select **New** > **Workflow**
1. Connect your repository containing this code
1. Configure:
   - **Name**: `seo-audit-workflow-ts`
   - **Root Directory**: `typescript/workflow`
   - **Build Command**: `cd .. && npm install && npm run build`
   - **Start Command**: `node ../dist/workflow/index.js`
1. Deploy the workflow

### 2. Deploy the API service

Use the included `render.yaml` blueprint:

1. Go to the [Render Dashboard](https://dashboard.render.com)
1. Select **New** > **Blueprint**
1. Connect this repository
1. Configure environment variables:
   - `RENDER_API_KEY`: Your Render API key
   - `WORKFLOW_SLUG`: The slug of your workflow (e.g., `seo-audit-workflow-ts`)
   - `WORKFLOW_ID`: The workflow ID (e.g., `wfl-xxxxx`) for task discovery in the UI

Or deploy manually:

1. Select **New** > **Web Service**
1. Connect your repository
1. Configure:
   - **Name**: `seo-audit-api-ts`
   - **Runtime**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `node dist/api/index.js`
1. Add the environment variables listed above

### 3. Deploy the frontend

See the [main README](../README.md#3-deploy-the-frontend) for frontend deployment instructions. The frontend is shared between Python and TypeScript backends.

## Local development

1. Install dependencies:

   ```sh
   npm install
   ```

1. Build the project:

   ```sh
   npm run build
   ```

1. Set environment variables:

   ```sh
   export RENDER_API_KEY=your-api-key
   export RENDER_USE_LOCAL_DEV=true
   export WORKFLOW_SLUG=seo-audit-workflow-ts
   export WORKFLOW_ID=wfl-xxxxx
   ```

1. Start the local task server (in one terminal):

   ```sh
   render workflows dev -- node dist/workflow/index.js
   ```

1. Run the API service (in another terminal):

   ```sh
   npm run dev
   ```

For more details, see the [Workflows local development guide](https://render.com/docs/workflows-local-development).

## Project structure

```
├── workflow/
│   ├── index.ts          # Workflow task definitions
│   └── analyzers.ts      # SEO analysis functions
├── api/
│   └── index.ts          # Express API
├── package.json
├── tsconfig.json
├── render.yaml           # Blueprint for API service
└── README.md
```

## How it works

1. User submits a URL via the frontend
1. API service triggers the `audit_site` workflow task using `@renderinc/sdk`
1. `audit_site` calls `crawl_pages` to discover pages (sitemap or link crawling)
1. For each discovered page, `audit_site` spawns an `analyze_page` task
1. Each `analyze_page` runs independently on its own instance
1. Results are aggregated and returned to the frontend

This demonstrates Workflows' key capability: distributing work across many instances with automatic orchestration, retries, and observability.

## API endpoints

| Method | Endpoint     | Description                                              |
| ------ | ------------ | -------------------------------------------------------- |
| `GET`  | `/`          | Health check                                             |
| `POST` | `/audit`     | Start an audit (body: `{"url": "...", "max_pages": 25}`) |
| `GET`  | `/audit/:id` | Get audit status and results                             |
| `GET`  | `/health`    | Health check                                             |

## TypeScript SDK

This demo uses the official [`@renderinc/sdk`](https://www.npmjs.com/package/@renderinc/sdk) package which provides:

- **Task Definition**: Register tasks with `task()` function
- **REST API Client**: Run and monitor tasks with `Render` client
- **Type Safety**: Full TypeScript support with IntelliSense
- **Retry Logic**: Configurable retry behavior for tasks
- **Task Spawning**: Execute tasks from within other tasks
