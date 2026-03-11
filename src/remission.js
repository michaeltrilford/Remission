import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const MODEL = "nvidia/nemotron-3-nano-30b-a3b:free";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const PUBMED_SEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
const PUBMED_SUMMARY_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi";
const OPEN_TARGETS_URL = "https://api.platform.opentargets.org/api/v4/graphql";
const NCI_CANCER_TYPES_URL = "https://www.cancer.gov/types";
const STARTER_TOPICS = [
  "Lung Cancer",
  "Breast Cancer",
  "Colorectal Cancer",
  "Pancreatic Cancer",
  "Prostate Cancer",
  "Melanoma",
  "Glioblastoma",
  "Leukemia",
  "Lymphoma",
  "Ovarian Cancer"
];
const ANSI = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  amber: "\x1b[33m",
  red: "\x1b[31m"
};

function loadEnvFile() {
  const envPath = path.join(process.cwd(), ".env");

  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function usage() {
  console.log(`
Remission CLI

Usage:
  node src/remission.js start
  node src/remission.js propose "<topic>" [--api-key <key>] [--json]
  node src/remission.js evidence "<topic>" [--json]
  npm run start
  npm run propose -- "<topic>" [--api-key <key>] [--json]
  npm run evidence -- "<topic>" [--json]

Examples:
  npm run start
  npm run propose -- "KRAS lung cancer"
  npm run evidence -- "glioblastoma metabolism"
  npm run propose -- "KRAS lung cancer" --api-key "or-your-key"
  npm run propose -- "KRAS lung cancer" --json
`.trim());
}

function color(text, value) {
  return `${value}${text}${ANSI.reset}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function divider(width = 72) {
  return "─".repeat(width);
}

function makePanel(title, lines, width = 72) {
  const innerWidth = width - 4;
  const renderedLines = lines.map((line) => {
    const trimmed = line.length > innerWidth ? `${line.slice(0, innerWidth - 1)}…` : line;
    return `│ ${trimmed.padEnd(innerWidth)} │`;
  });

  return [
    `┌─ ${title}${"─".repeat(Math.max(0, width - title.length - 5))}┐`,
    ...renderedLines,
    `└${"─".repeat(width - 2)}┘`
  ].join("\n");
}

function renderTwoColumn(leftTitle, leftLines, rightTitle, rightLines, width = 38) {
  const normalize = (lines) => {
    const max = Math.max(leftLines.length, rightLines.length);
    return Array.from({ length: max }, (_, index) => lines[index] ?? "");
  };

  const left = normalize(leftLines);
  const right = normalize(rightLines);
  const innerWidth = width - 4;
  const rows = [];

  rows.push(
    `┌─ ${leftTitle}${"─".repeat(Math.max(0, width - leftTitle.length - 5))}┐ ┌─ ${rightTitle}${"─".repeat(Math.max(0, width - rightTitle.length - 5))}┐`
  );

  for (let index = 0; index < left.length; index += 1) {
    const leftLine = left[index].slice(0, innerWidth).padEnd(innerWidth);
    const rightLine = right[index].slice(0, innerWidth).padEnd(innerWidth);
    rows.push(`│ ${leftLine} │ │ ${rightLine} │`);
  }

  rows.push(`└${"─".repeat(width - 2)}┘ └${"─".repeat(width - 2)}┘`);
  return rows.join("\n");
}

function buildGrowthCurve(hypothesis) {
  const novelty = Number(hypothesis.novelty_score) || 5;
  const plausibility = Number(hypothesis.plausibility_score) || 5;
  const base = [9, 8, 8, 7, 7, 6, 6, 5];
  const variant = base.map((value, index) =>
    Math.max(1, value - Math.round((plausibility + novelty) / 8) + Math.round(index / 3))
  );

  const rows = [];
  for (let y = 10; y >= 1; y -= 1) {
    let line = `${String(y).padStart(2, " ")} │`;
    for (let x = 0; x < base.length; x += 1) {
      const baselinePoint = base[x] === y ? "·" : " ";
      const variantPoint = variant[x] === y ? "█" : baselinePoint;
      line += variantPoint;
    }
    rows.push(line);
  }
  rows.push("   └────────");
  rows.push("    t0 t1 t2");
  return rows;
}

async function showBootSplash() {
  if (!input.isTTY || !output.isTTY) {
    return;
  }

  output.write("\x1b[2J\x1b[H");
  console.log(color("REMISSION :: SIGNAL DISCOVERY TERMINAL", ANSI.green));
  console.log(color(divider(), ANSI.dim));
  console.log(color("Booting biosignal scanner...", ANSI.cyan));
  await sleep(120);
  console.log(color("Loading public knowledge interfaces...", ANSI.cyan));
  await sleep(120);
  console.log(color("Attaching Nemotron reasoning core...", ANSI.cyan));
  await sleep(120);
  console.log(color("Ready.\n", ANSI.green));
}

async function showSignalAcquisition(topic) {
  if (!input.isTTY || !output.isTTY) {
    return;
  }

  const frames = ["[·    ]", "[··   ]", "[···  ]", "[ ··· ]", "[  ···]", "[   ··]"];
  for (let index = 0; index < frames.length; index += 1) {
    output.write(`\r${color("Signal acquisition", ANSI.amber)} ${frames[index]} ${topic.slice(0, 36)}`);
    await sleep(70);
  }
  output.write("\r\x1b[2K");
}

function createStatusTracker() {
  if (!input.isTTY || !output.isTTY) {
    return {
      start() {},
      update() {},
      complete() {},
      stop() {}
    };
  }

  const state = {
    topic: "",
    stage: "Idle",
    detail: "",
    lines: [],
    frameIndex: 0,
    timer: null
  };
  const frames = ["◐", "◓", "◑", "◒"];

  function render() {
    const frame = frames[state.frameIndex % frames.length];
    output.write("\x1b[2J\x1b[H");
    console.log(color("REMISSION :: ACTIVE SCAN", ANSI.green));
    console.log(color(divider(), ANSI.dim));
    console.log(color(`Topic   :: ${state.topic}`, ANSI.cyan));
    console.log(color(`Stage   :: ${state.stage}`, ANSI.amber));
    if (state.detail) {
      console.log(color(`Detail  :: ${state.detail}`, ANSI.dim));
    }
    console.log("");
    console.log(makePanel("Signal monitor", [`${frame} ${state.stage}`, state.detail || "stabilizing sensor array"]));
    if (state.lines.length > 0) {
      console.log("");
      console.log(color(makePanel("Trace", state.lines.slice(-6)), ANSI.dim));
    }
  }

  return {
    start(topic) {
      state.topic = topic;
      state.stage = "Acquiring signal";
      state.detail = "Initializing public knowledge interfaces";
      render();
      state.timer = setInterval(() => {
        state.frameIndex += 1;
        render();
      }, 100);
    },
    update(stage, detail = "") {
      state.stage = stage;
      state.detail = detail;
      if (detail) {
        state.lines.push(`${stage} :: ${detail}`);
      } else {
        state.lines.push(stage);
      }
      render();
    },
    complete(stage, detail = "") {
      state.stage = stage;
      state.detail = detail;
      state.lines.push(detail ? `${stage} :: ${detail}` : stage);
      render();
    },
    stop() {
      if (state.timer) {
        clearInterval(state.timer);
      }
      output.write("\x1b[2J\x1b[H");
    }
  };
}

function parseArgs(args) {
  const options = {
    apiKey: "",
    json: false
  };
  const positionals = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--api-key") {
      options.apiKey = args[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    positionals.push(arg);
  }

  return { options, positionals };
}

function normalizeResponse(content) {
  let parsed;

  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Model returned invalid JSON");
  }

  if (!parsed || !Array.isArray(parsed.hypotheses) || parsed.hypotheses.length === 0) {
    throw new Error("Model response did not include hypotheses");
  }

  return parsed;
}

function buildPrompt(topic, evidence) {
  return [
    "You are Remission, a biomedical discovery assistant.",
    "Generate exactly 10 research hypotheses for overlooked cancer intervention directions.",
    "This is for discovery support only, not medical advice.",
    "Use the evidence pack below as grounding. Do not invent citations or claim certainty beyond the evidence.",
    "Focus on plausible mechanisms, mutation/pathway relevance, diet or host-variable levers when relevant, and novelty.",
    "Return valid JSON only with this schema:",
    JSON.stringify({
      topic: "string",
      hypotheses: [
        {
          id: "H1",
          title: "string",
          mechanism: "string",
          rationale: "string",
          novelty_score: 1,
          plausibility_score: 1,
          next_test: "string",
          evidence_refs: ["string"]
        }
      ]
    }),
    `Topic: ${topic}`,
    `Evidence pack: ${JSON.stringify(evidence)}`
  ].join("\n");
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Request failed ${response.status}: ${errorBody}`);
  }

  return response.json();
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Request failed ${response.status}: ${errorBody}`);
  }

  return response.text();
}

async function fetchPubMedEvidence(topic) {
  const searchUrl = new URL(PUBMED_SEARCH_URL);
  searchUrl.searchParams.set("db", "pubmed");
  searchUrl.searchParams.set("retmode", "json");
  searchUrl.searchParams.set("retmax", "5");
  searchUrl.searchParams.set("sort", "relevance");
  searchUrl.searchParams.set("term", topic);

  const searchData = await fetchJson(searchUrl);
  const ids = searchData.esearchresult?.idlist ?? [];

  if (ids.length === 0) {
    return [];
  }

  const summaryUrl = new URL(PUBMED_SUMMARY_URL);
  summaryUrl.searchParams.set("db", "pubmed");
  summaryUrl.searchParams.set("retmode", "json");
  summaryUrl.searchParams.set("id", ids.join(","));

  const summaryData = await fetchJson(summaryUrl);

  return ids
    .map((id) => {
      const item = summaryData.result?.[id];
      if (!item) {
        return null;
      }

      return {
        id: `pubmed:${id}`,
        title: item.title,
        source: "PubMed",
        pubdate: item.pubdate,
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`
      };
    })
    .filter(Boolean);
}

async function fetchOpenTargetsEvidence(topic) {
  const query = `
    query Search($queryString: String!) {
      search(queryString: $queryString, entityNames: ["target", "disease"], page: { index: 0, size: 5 }) {
        hits {
          id
          entity
          name
          description
        }
      }
    }
  `;

  const data = await fetchJson(OPEN_TARGETS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query,
      variables: {
        queryString: topic
      }
    })
  });

  return (data.data?.search?.hits ?? []).map((hit) => ({
    id: `opentargets:${hit.id}`,
    name: hit.name,
    entity: hit.entity,
    description: hit.description ?? "",
    source: "Open Targets",
    url: `https://platform.opentargets.org/${hit.entity}/${hit.id}`
  }));
}

async function buildEvidencePack(topic, onEvent) {
  onEvent?.(`pubmed search :: ${topic}`);
  const [pubmed, openTargets] = await Promise.all([
    fetchPubMedEvidence(topic).catch(() => []),
    fetchOpenTargetsEvidence(topic).catch(() => [])
  ]);
  onEvent?.(`pubmed hits :: ${pubmed.length}`);
  onEvent?.(`open targets hits :: ${openTargets.length}`);

  return {
    topic,
    retrieved_at: new Date().toISOString(),
    pubmed,
    open_targets: openTargets
  };
}

function renderEvidence(evidence) {
  const pubmedLines =
    evidence.pubmed.length === 0
      ? ["no results"]
      : evidence.pubmed.flatMap((item) => [
          `${item.title}`,
          `${item.pubdate || "date unknown"} :: ${item.id}`
        ]);
  const targetLines =
    evidence.open_targets.length === 0
      ? ["no results"]
      : evidence.open_targets.flatMap((item) => [
          `${item.name} [${item.entity}]`,
          item.description || item.id
        ]);

  console.log(`\n${color(`Evidence pack for ${evidence.topic}`, ANSI.green)}\n`);
  console.log(renderTwoColumn("PubMed", pubmedLines, "Open Targets", targetLines));
  console.log("");
}

function renderHypothesis(hypothesis, index) {
  const summaryPanel = makePanel(
    color(`PATH ${index + 1} :: ${hypothesis.title}`, ANSI.green),
    [
      `Mechanism: ${hypothesis.mechanism}`,
      `Novelty: ${hypothesis.novelty_score}/10`,
      `Plausibility: ${hypothesis.plausibility_score}/10`,
      "",
      `Rationale: ${hypothesis.rationale}`,
      "",
      `Next test: ${hypothesis.next_test}`,
      Array.isArray(hypothesis.evidence_refs) && hypothesis.evidence_refs.length > 0
        ? `Evidence refs: ${hypothesis.evidence_refs.join(", ")}`
        : "Evidence refs: none attached"
    ]
  );

  console.log(`\n${summaryPanel}\n`);
  console.log(color("Weak signal detected :: projected branch delta", ANSI.amber));
  console.log(buildGrowthCurve(hypothesis).join("\n"));
  console.log("");
  console.log(color("Branching path map", ANSI.cyan));
  console.log(`baseline ──┬── ${hypothesis.id}`);
  console.log("          ├── alt-A");
  console.log("          └── alt-B\n");
}

async function runInteractivePicker(result) {
  if (!input.isTTY || !output.isTTY) {
    await runFallbackPicker(result);
    return;
  }

  const pathOptions = result.hypotheses.map((hypothesis, index) => ({
    label: `${index + 1}. ${hypothesis.title}  [N${hypothesis.novelty_score ?? "?"}/P${hypothesis.plausibility_score ?? "?"}]`,
    value: index
  }));

  while (true) {
    const selectedIndex = await selectWithArrows(pathOptions, {
      header: [
        color(`Remission paths for ${result.topic}`, ANSI.green),
        color("Pick a path with arrows and press Enter.", ANSI.dim)
      ],
      footer: "Enter inspect  |  r raw JSON  |  q quit",
      useAltScreen: true
    });

    if (selectedIndex === "quit") {
      return;
    }

    if (selectedIndex === "raw") {
      console.log(`\n${JSON.stringify(result, null, 2)}\n`);
      continue;
    }

    renderHypothesis(result.hypotheses[selectedIndex], selectedIndex);
  }
}

async function runFallbackPicker(result) {
  const rl = readline.createInterface({ input, output });

  try {
    renderList(result);

    while (true) {
      const answer = (await rl.question("> ")).trim().toLowerCase();

      if (answer === "q") {
        return;
      }

      if (answer === "r") {
        console.log(`\n${JSON.stringify(result, null, 2)}\n`);
        continue;
      }

      const selectedIndex = Number(answer) - 1;
      if (Number.isInteger(selectedIndex) && result.hypotheses[selectedIndex]) {
        renderHypothesis(result.hypotheses[selectedIndex], selectedIndex);
        console.log("Pick another path, [r] raw JSON, or [q] quit\n");
        continue;
      }

      console.log("Use 1-10 to inspect a path, [r] for raw JSON, or [q] to quit.\n");
    }
  } finally {
    rl.close();
  }
}

async function start(options) {
  if (input.isTTY && output.isTTY) {
    await runStartMenu(options);
    return;
  }

  await runFallbackStart(options);
}

async function runStartMenu(options) {
  const mode = await selectWithArrows(
    [
      { label: "Propose paths", value: "propose" },
      { label: "Inspect evidence", value: "evidence" },
      { label: "Quit", value: "quit" }
    ],
    {
      header: [
        color("REMISSION", ANSI.green),
        "Discovery engine for cancer intervention paths.",
        color("Use arrows, press Enter to select.", ANSI.dim)
      ],
      footer: "Navigator online",
      useAltScreen: true
    }
  );

  if (mode === "quit") {
    return;
  }

  const rl = readline.createInterface({ input, output });

  try {
    const topic = await selectTopic(rl);
    if (!topic) {
      throw new Error("Topic is required.");
    }

    if (mode === "propose") {
      await propose(topic, options);
      return;
    }

    await evidence(topic, options);
  } finally {
    rl.close();
  }
}

async function selectTopic(rl) {
  console.log("");
  const topicChoice = await selectWithArrows(
    [
      ...STARTER_TOPICS.map((topic) => ({ label: topic, value: topic })),
      { label: "Custom topic...", value: "custom" },
      { label: "Cancer type resource", value: "resource" }
    ],
    {
      header: [
        color("Select a starting topic", ANSI.cyan),
        color("Pick a common cancer type or enter your own.", ANSI.dim)
      ],
      footer: `Reference: ${NCI_CANCER_TYPES_URL}`,
      useAltScreen: true
    }
  );

  if (topicChoice === "quit") {
    return "";
  }

  if (topicChoice === "resource") {
    console.log("");
    console.log(
      makePanel("Cancer type resource", [
        "National Cancer Institute A to Z list:",
        NCI_CANCER_TYPES_URL,
        "",
        "Use this to find a cancer type, then return here and choose Custom topic",
        "for a more specific query such as EGFR lung cancer or glioblastoma metabolism."
      ])
    );
    console.log("");
    return selectTopic(rl);
  }

  if (topicChoice === "custom") {
    const customTopic = (await rl.question("Custom topic: ")).trim();
    return customTopic;
  }

  return topicChoice;
}

async function runFallbackStart(options) {
  const rl = readline.createInterface({ input, output });

  try {
    console.log("\nRemission\n");
    console.log("Discovery engine for cancer intervention paths.\n");
    console.log("1. Propose paths");
    console.log("2. Inspect evidence");
    console.log("q. Quit\n");

    const mode = (await rl.question("> ")).trim().toLowerCase();

    if (mode === "q") {
      return;
    }

    if (mode !== "1" && mode !== "2") {
      throw new Error("Use 1, 2, or q.");
    }

    const topic = (await rl.question("Topic: ")).trim();
    if (!topic) {
      throw new Error("Topic is required.");
    }

    if (mode === "1") {
      await propose(topic, options);
      return;
    }

    await evidence(topic, options);
  } finally {
    rl.close();
  }
}

async function selectWithArrows(options, config = {}) {
  let selectedIndex = 0;
  const footer = config.footer ?? "";
  const header = config.header ?? [];
  const clearOnRender = config.clearOnRender ?? true;
  const useAltScreen = config.useAltScreen ?? false;

  function render() {
    const headerLines = Array.isArray(header) ? header : [header];
    const lines = options.map((option, index) =>
      `${index === selectedIndex ? "> " : "  "}${option.label}`
    );

    const rendered = [...headerLines, "", ...lines];
    if (footer) {
      rendered.push("");
      rendered.push(footer);
    }

    if (clearOnRender) {
      output.write("\x1b[2J\x1b[H");
    }

    output.write(`${rendered.join("\n")}\n`);
  }

  return new Promise((resolve, reject) => {
    function cleanup() {
      input.setRawMode(false);
      input.pause();
      input.off("data", onData);
      output.off("resize", onResize);
      output.write("\x1b[?25h");
      if (useAltScreen) {
        output.write("\x1b[?1049l");
      } else if (clearOnRender) {
        output.write("\x1b[2J\x1b[H");
      }
    }

    function finish(value) {
      cleanup();
      resolve(value);
    }

    function onResize() {
      render();
    }

    function onData(buffer) {
      const key = buffer.toString("utf8");

      if (key === "\u0003") {
        cleanup();
        reject(new Error("Interrupted"));
        return;
      }

      if (key === "\u001b[A") {
        selectedIndex = selectedIndex === 0 ? options.length - 1 : selectedIndex - 1;
        render();
        return;
      }

      if (key === "\u001b[B") {
        selectedIndex = selectedIndex === options.length - 1 ? 0 : selectedIndex + 1;
        render();
        return;
      }

      if (key === "\r") {
        finish(options[selectedIndex].value);
        return;
      }

      if (key.toLowerCase() === "q") {
        finish("quit");
        return;
      }

      if (key.toLowerCase() === "r") {
        finish("raw");
      }
    }

    if (useAltScreen) {
      output.write("\x1b[?1049h");
    }
    output.write("\x1b[?25l");
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
    output.on("resize", onResize);
    render();
  });
}

async function callModel(topic, apiKey, evidence) {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/michaeltrilford/Remission",
      "X-Title": "Remission"
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a careful research assistant. Be explicit, structured, and avoid unsupported certainty."
        },
        {
          role: "user",
          content: buildPrompt(topic, evidence)
        }
      ],
      response_format: {
        type: "json_object"
      }
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenRouter error ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("No model response content returned");
  }

  return normalizeResponse(content);
}

async function propose(topic, options) {
  loadEnvFile();

  const apiKey = options.apiKey || process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("Missing API key. Use --api-key or set OPENROUTER_API_KEY in .env");
  }

  const tracker = createStatusTracker();
  tracker.start(topic);
  await showSignalAcquisition(topic);
  tracker.update("Evidence retrieval", "Opening PubMed and Open Targets channels");
  const evidenceLogs = [];
  const evidence = await buildEvidencePack(topic, (message) => {
    evidenceLogs.push(message);
    tracker.update("Evidence retrieval", message);
  });
  tracker.update("Model query", `Sending grounded evidence to ${MODEL}`);
  const result = await callModel(topic, apiKey, evidence);
  tracker.update("Ranking paths", `Scored ${result.hypotheses.length} candidate branches`);
  await sleep(180);
  tracker.complete("Ready", "Path map prepared");
  await sleep(120);
  tracker.stop();

  if (options.json) {
    console.log(JSON.stringify({ evidence, result }, null, 2));
    return;
  }

  console.log("");
  console.log(
    color(
      makePanel("Evidence ingest", evidenceLogs.length > 0 ? evidenceLogs : ["no ingest logs"]),
      ANSI.dim
    )
  );
  console.log(color("Grounded with public evidence from PubMed and Open Targets.", ANSI.green));
  console.log("Use `npm run evidence -- \"topic\" --json` to inspect the raw evidence pack.\n");
  await runInteractivePicker(result);
}

async function evidence(topic, options) {
  const result = await buildEvidencePack(topic);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  renderEvidence(result);
}

async function main() {
  const [, , command, ...rawArgs] = process.argv;

  if (!command || command === "--help" || command === "-h") {
    usage();
    return;
  }

  const { options, positionals } = parseArgs(rawArgs);
  const topic = positionals.join(" ").trim();

  if (command === "start") {
    await showBootSplash();
  }

  if (command === "start") {
    await start(options);
    return;
  }

  if (command === "propose") {
    if (!topic) {
      throw new Error("Missing topic. Example: npm run propose -- \"KRAS lung cancer\"");
    }
    await propose(topic, options);
    return;
  }

  if (command === "evidence") {
    if (!topic) {
      throw new Error("Missing topic. Example: npm run evidence -- \"KRAS lung cancer\"");
    }
    await evidence(topic, options);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
