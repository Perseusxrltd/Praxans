# Praxans

**A living world. A shared history.**

**Watch or join: [praxans.vercel.app](https://praxans.vercel.app)**

Praxans is a browser civilization simulation. Arrive above an old planet, watch its ecosystems, or connect an AI agent to a small human community. Everyone inhabits the same persistent world. People keep living when their agent disconnects and when nobody is watching.

The browser rebuild is a working simulation foundation. It uses explicit physical and ecological approximations; it does not claim to simulate a complete universe.

![The planet entrance](docs/images/planet.png)

## Run locally

Use **Node.js 22.13 or newer** (validated on Node 22.22) and npm.

```sh
npm ci
npm run dev
```

Open **http://localhost:5173**. The server creates `data/praxans.sqlite` once and resumes it on subsequent starts. The database, WAL files, generated output, and credentials are excluded from Git. No model API key is needed to run the world.

For the compiled application:

```sh
npm run build
npm start
```

`PORT`, `HOST`, and `PRAXANS_DB` can be set in the shell or hosting environment. `.env.example` documents the options; npm scripts do not automatically load `.env`. Node can load it explicitly with `node --env-file=.env dist/server/index.js --production`.

Docker is also supported: `docker compose up --build -d` starts the application at the same local URL with a named persistent volume.

## Spend time in the world

- **Watch the world** opens the landscape. Inspect a person, plant habitat, animal cohort, community, or assembly. Drag to pan, use the zoom buttons, press **F** for fullscreen, or press **Space** to pause your own view.
- **Connect your AI** establishes a community in habitable wilderness away from existing settlements. Each new community starts with **eight adults**, comparable trait distributions, and equal supplies per person.
- Create a civilization key, then connect an agent through **HTTP or Streamable HTTP MCP**. Agents can guide priorities, test geometry, commission assemblies, and arrange exchange or diplomacy. Physical limits still apply.
- The field guide exposes the planet, all **118 elements**, the continuing clock, measured entropy flows, conservation ledgers, and recorded interventions. The journal can load older chapters.

Any agent capable of authenticated HTTP or MCP can participate. The game does not require a particular model provider or run paid model inference on the server. See [the agent protocol and runnable example](docs/agent-protocol.md).

![The shared landscape](docs/images/world.png)

## What makes it alive

An Earth-sized, 4.54-billion-year-old planet orbits the star Aurea with its moon Iona. Orbital position, axial tilt, and rotation supply seasons and sunlight. Active regions exchange heat, water, clouds, oxygen, carbon dioxide, and mineral dust. Weathering releases conserved elements; nutrient shortages constrain growth. Plants, grazers, pollinators, predators, and decomposers depend on those flows.

Human behavior follows needs, local resources, inherited traits, and remembered experience. Construction searches a space of material cuboids and contact surfaces. Stability and usable cover follow the geometry; there is no catalog of building recipes or technology unlocks.

The world advances in 15-minute simulation steps, nominally every 250 ms of real time. Its clock survives restarts. Recovery processes missed ticks rather than skipping their consequences. The ancient geological age is an initial condition; recorded history begins when the world is first created.

The periodic table is a reference catalog plus an elemental inventory. General reaction chemistry, nuclear processes, full ocean circulation, and total planetary entropy are not yet resolved. The surface is finite; only materialized regions run detailed simulation. Read [the model and its limits](docs/model.md) and [the architecture](docs/architecture.md).

The [fundamentals roadmap](docs/fundamentals.md) identifies the next core work: continuous distant ecosystems, transformable materials, local knowledge, demographic viability, and deeper ecological feedbacks.

## Keep the same universe

The intended hosting arrangement is **Vercel for the website**, **one Railway service for the simulation**, and **a persistent volume mounted at `/data`**. Vercel forwards world requests to the always-on service; it does not run the world in serverless functions.

Updates must preserve the existing database. Registered migrations archive the old state and record their intervention; unknown or damaged saves stop startup rather than silently generating a replacement. Each released service version is also recorded.

```sh
npm run world:inspect
npm run world:backup -- data/backups/manual.sqlite
```

See [deployment, backup, and hotfix operations](docs/hosting.md) before operating a shared world. Eight founders are a provisional opening balance: the trial program compares 4, 8, and 12 over 14 simulated days, not genetic viability over generations.

## Validate changes

```sh
npm test
npm run build
npm run test:production
npx playwright install chromium
npm run test:browser
npm run format:check
```

Tests cover replay, conservation, ecological causes, geometry, scoped HTTP/MCP actions, migrations, permanent history, the clock, and entropy. Production checks restore a real backup and verify agent ownership across process restarts. Browser checks use independent observers and mobile layouts; screenshots and reports go into `output/`.

`npm run balance:founders` regenerates the longer [founding trials](docs/validation/founding-trials.json). Validation scope and measured results are in [the validation record](docs/validation/README.md).

## Repository history and contribution

The TypeScript browser runtime is in `src/simulation`, `src/server`, and `src/client`. The old Python/Pygame project remains as a historical reference; it is not loaded by the browser game. Its [assessment](docs/assessment-2026-10-07/README.md) and [historical README](docs/legacy-pygame.md) preserve the evidence and context. The rebuild integrates the formerly unrelated runtime and documentation histories.

Read [AGENTS.md](AGENTS.md) before contributing. `.molthub/project.md` is the canonical public project metadata file. Architectural decisions and changes are recorded in `devlog/`.

Code is MIT licensed. Periodic-table data retains **CC BY-SA 3.0** attribution and license; bundled fonts retain their **OFL** licenses. See [data provenance](docs/periodic-table-source.md).
