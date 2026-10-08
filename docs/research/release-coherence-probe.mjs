// Read-only structural review and tiny synthetic evidence diagnostics.
// Run: node --import tsx docs/research/release-coherence-probe.mjs [output.json] [--scan-only|--observations-only]
// No world generation, simulation advance, server, network or database.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import ts from "typescript";
import { runExperiment } from "../../src/simulation/economy.ts";
import { evaluateDesign, emptyStock } from "../../src/simulation/laws.ts";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const sha = (file) =>
  createHash("sha256")
    .update(fs.readFileSync(path.join(root, file)))
    .digest("hex");
const sourceExtensions = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".css",
  ".svg",
];

function structuralScan() {
  const files = [
    ...new Set(
      execFileSync(
        "git",
        ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        { cwd: root, encoding: "utf8" },
      )
        .split("\0")
        .filter(Boolean),
    ),
  ]
    .filter((file) => fs.existsSync(path.join(root, file)))
    .sort();
  const sourceFiles = files.filter((file) => /\.(?:[mc]?[jt]sx?)$/.test(file));
  const edges = [],
    missingImports = [],
    missingAssets = [],
    nonliteralLoads = [];
  const simulationEnvironmentImports = [];
  const isFile = (file) => {
    try {
      return fs.statSync(file).isFile();
    } catch {
      return false;
    }
  };
  const resolveRelative = (from, target) => {
    const full = path.resolve(
      root,
      path.dirname(from),
      target.split(/[?#]/)[0],
    );
    const candidates = [full];
    if (/\.[mc]?js$/.test(full))
      candidates.push(
        full.replace(/\.[mc]?js$/, ".ts"),
        full.replace(/\.[mc]?js$/, ".tsx"),
      );
    // A dotted basename such as planet-survey.worker still needs .ts resolution.
    if (!sourceExtensions.includes(path.extname(full)))
      for (const ext of sourceExtensions) candidates.push(full + ext);
    for (const ext of sourceExtensions)
      candidates.push(path.join(full, "index" + ext));
    return candidates.find(isFile);
  };
  for (const file of sourceFiles) {
    const ast = ts.createSourceFile(
      file,
      fs.readFileSync(path.join(root, file), "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const add = (node, specifier, kind) => {
      if (!specifier) return;
      if (!ts.isStringLiteralLike(specifier)) {
        nonliteralLoads.push({
          file,
          line: ast.getLineAndCharacterOfPosition(node.pos).line + 1,
          kind,
        });
        return;
      }
      const target = specifier.text;
      if (!target.startsWith(".")) {
        if (
          file.startsWith("src/simulation/") &&
          /^(node:|fs$|path$|https?$|react$|react-dom|express$)/.test(target)
        )
          simulationEnvironmentImports.push({ file, target, kind });
        return;
      }
      const resolved = resolveRelative(file, target);
      const edge = {
        from: file,
        target,
        kind,
        to: resolved ? path.relative(root, resolved) : null,
      };
      if (!resolved)
        (kind === "url-asset" ? missingAssets : missingImports).push(edge);
      else edges.push(edge);
    };
    const visit = (node) => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
        add(node, node.moduleSpecifier, "static");
      else if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference)
      )
        add(node, node.moduleReference.expression, "import-equals");
      else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
        add(node, node.argument.literal, "import-type");
      else if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) &&
            node.expression.text === "require"))
      )
        add(node, node.arguments[0], "dynamic");
      else if (
        ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "URL" &&
        node.arguments?.length === 2 &&
        node.arguments[1].getText(ast) === "import.meta.url"
      )
        add(node, node.arguments[0], "url-asset");
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  const area = (file) =>
    file.startsWith("src/")
      ? file.split("/").slice(0, 2).join("/")
      : file.split("/")[0];
  const edgesByArea = {};
  for (const edge of edges) {
    const key = area(edge.from) + " -> " + area(edge.to);
    edgesByArea[key] = (edgesByArea[key] ?? 0) + 1;
  }
  const layerViolations = edges.filter(
    (edge) =>
      (edge.from.startsWith("src/simulation/") &&
        /^src\/(?:client|server)\//.test(edge.to)) ||
      (edge.from.startsWith("src/client/") &&
        edge.to.startsWith("src/server/")),
  );
  const missingMarkdownLinks = [];
  let localMarkdownLinksChecked = 0;
  for (const file of files.filter((file) => file.endsWith(".md"))) {
    const source = fs
      .readFileSync(path.join(root, file), "utf8")
      .replace(/^```[^\n]*\n[\s\S]*?^```[^\n]*$/gm, "");
    for (const match of source.matchAll(
      /\[[^\]\n]*\]\((<[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\)/g,
    )) {
      let destination = match[1].replace(/^<|>$/g, "");
      if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(destination)) continue;
      destination = decodeURIComponent(destination.split(/[?#]/)[0]);
      if (
        !destination ||
        destination.includes("${") ||
        destination.includes("{{")
      )
        continue;
      localMarkdownLinksChecked++;
      if (!fs.existsSync(path.resolve(root, path.dirname(file), destination)))
        missingMarkdownLinks.push({ file, destination });
    }
  }
  const sourceHash = createHash("sha256");
  for (const file of files.filter((file) => file.startsWith("src/"))) {
    sourceHash.update(file + "\0");
    sourceHash.update(fs.readFileSync(path.join(root, file)));
    sourceHash.update("\0");
  }
  return {
    baseCommit: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    scope:
      "Git-visible existing files; TypeScript AST static/import-type/literal dynamic relative imports, import.meta.url assets, inline Markdown local targets outside fenced blocks. Does not validate Markdown anchors, arbitrary runtime paths, package exports, all language semantics or legacy Python behavior.",
    gitVisibleExistingFileCount: files.length,
    jsTsFileCount: sourceFiles.length,
    sourceFileCount: files.filter((file) => file.startsWith("src/")).length,
    srcContentSha256: sourceHash.digest("hex"),
    resolvedEdgeCount: edges.length,
    edgesByArea,
    missingImports,
    missingAssets,
    nonliteralLoads,
    layerViolations,
    simulationEnvironmentImports,
    localMarkdownLinksChecked,
    missingMarkdownLinks,
  };
}

function observationProbe() {
  const part = (x, y, width, depth, height, z = 0) => ({
    material: "wood",
    x,
    y,
    z,
    width,
    depth,
    height,
  });
  const design = {
    name: "Detached walls",
    components: [
      part(0, 0, 1, 1, 0.05),
      part(-2, 0, 0.1, 1, 1),
      part(2, 0, 0.1, 1, 1),
      part(0, -2, 1, 0.1, 1),
      part(0, 2, 1, 0.1, 1),
    ],
  };
  const physical = evaluateDesign(design);
  const fixture = (method, storageVolume, confidence) => {
    const old = {
      id: "old-observation",
      tick: -100,
      statement: `Historical estimate: ${storageVolume} m³ storage`,
      evidence: "Synthetic preserved historical estimate",
      design: structuredClone(design),
      properties: { ...structuredClone(physical), storageVolume },
      trials: 1,
      research: {
        authorId: "person",
        method,
        prediction: {
          stable: true,
          coveredArea: physical.coveredArea,
          storageVolume,
        },
        surprise: 0,
        confidence,
        samples: emptyStock(),
      },
    };
    const actor = {
      id: "person",
      civId: "camp",
      name: "Probe Person",
      age: 20,
      x: 0,
      y: 0,
      memories: [],
      mind: {
        attention: 1,
        sleeping: false,
        learned: 0,
        forgotten: 0,
        knowledge: [
          {
            id: old.id,
            retention: 1,
            consolidation: 0,
            lastRecalledTick: -100,
          },
        ],
      },
    };
    const civ = {
      id: "camp",
      x: 0,
      y: 0,
      stock: { ...emptyStock(), wood: 1 },
      observations: [old],
      experiments: 0,
    };
    const tile = {
      x: 0,
      y: 0,
      terrain: "meadow",
      detritus: { carbon: 0, mineral: 0 },
      nutrients: {},
      mineral: 0,
    };
    const world = {
      rng: 1,
      seed: 1,
      tick: 0,
      nextId: 1,
      events: [],
      pendingEvents: [],
      tiles: [tile],
      citizens: [actor],
      civilizations: [civ],
    };
    return { old, actor, civ, tile, world };
  };
  const conflicting = fixture("material-trial", 0.95, 0.5);
  const before = JSON.stringify(conflicting.old);
  const ran = runExperiment(
    conflicting.world,
    conflicting.civ,
    design,
    conflicting.actor,
  );
  const fresh = conflicting.civ.observations.find(
    (note) => note !== conflicting.old,
  );
  const firstResult = {
    ran,
    evaluatedStorageM3: physical.storageVolume,
    previousUnchanged: JSON.stringify(conflicting.old) === before,
    previousStorageAfterM3: conflicting.old.properties.storageVolume,
    previousConfidenceAfter: conflicting.old.research.confidence,
    observationsAfter: conflicting.civ.observations.length,
    freshNote: fresh ? structuredClone(fresh) : null,
    woodStockAfterKg: conflicting.civ.stock.wood,
    returnedMassKg:
      conflicting.tile.detritus.carbon + conflicting.tile.detritus.mineral,
  };
  runExperiment(conflicting.world, conflicting.civ, design, conflicting.actor);
  const repeatResult = {
    observationsAfter: conflicting.civ.observations.length,
    previousUnchanged: JSON.stringify(conflicting.old) === before,
    freshTrialsAfter: fresh?.trials ?? null,
    matchingCurrentResultReused:
      !!fresh &&
      fresh.trials === 2 &&
      conflicting.civ.observations.length === 2,
  };
  const method = fixture("construction", physical.storageVolume, 0.95);
  const methodBefore = JSON.stringify(method.old);
  runExperiment(method.world, method.civ, design, method.actor);
  const sample = method.civ.observations.find((note) => note !== method.old);
  return {
    scope:
      "Partial synthetic objects for runExperiment only, not valid saved worlds. Same detached-wall geometry and 1 kg initial wood as the original reproduction; added event/memory fields permit a new note. Two sequential sample calls and one separate method-control call; no clock advance.",
    sourceSha256: Object.fromEntries(
      [
        "src/simulation/economy.ts",
        "src/simulation/laws.ts",
        "src/simulation/geometry.ts",
        "src/simulation/cognition.ts",
        "src/simulation/citizens.ts",
      ].map((file) => [file, sha(file)]),
    ),
    conflictingRetest: firstResult,
    agreeingRetest: repeatResult,
    methodControl: {
      previousConstructionUnchanged:
        JSON.stringify(method.old) === methodBefore,
      observationsAfter: method.civ.observations.length,
      separateSampleMethod: sample?.research.method ?? null,
    },
    pass:
      firstResult.previousUnchanged &&
      fresh?.properties.storageVolume === 0 &&
      repeatResult.matchingCurrentResultReused &&
      JSON.stringify(method.old) === methodBefore &&
      sample?.research.method === "material-trial",
  };
}

const report = { inspectedAt: new Date().toISOString() };
if (!process.argv.includes("--observations-only"))
  report.structuralScan = structuralScan();
if (!process.argv.includes("--scan-only"))
  report.observationProbe = observationProbe();
if (process.argv[2] && !process.argv[2].startsWith("--"))
  fs.writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
