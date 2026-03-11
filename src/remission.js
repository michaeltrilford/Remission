import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import ora from "ora";

const MODEL = "nvidia/nemotron-3-nano-30b-a3b:free";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const PUBMED_SEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
const PUBMED_SUMMARY_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi";
const OPEN_TARGETS_URL = "https://api.platform.opentargets.org/api/v4/graphql";
const REACTOME_SEARCH_URL = "https://reactome.org/ContentService/search/query";
const CLINICAL_TRIALS_URL = "https://clinicaltrials.gov/api/query/study_fields";
const NCI_CANCER_TYPES_URL = "https://www.cancer.gov/types";
const REVIEW_APP_URL = process.env.REMISSION_REVIEW_APP_URL || "https://remission-sigma.vercel.app";
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

function stripAnsi(text) {
  return String(text ?? "").replace(/\x1b\[[0-9;]*m/g, "");
}

function visibleLength(text) {
  return stripAnsi(text).length;
}

function padVisible(text, width) {
  const value = String(text ?? "");
  const padding = Math.max(0, width - visibleLength(value));
  return `${value}${" ".repeat(padding)}`;
}

function terminalWidth() {
  return Math.max(60, Math.min(output.columns || 80, 120));
}

function panelWidth(maxWidth = 72) {
  return Math.max(32, Math.min(maxWidth, terminalWidth()));
}

function wrapLine(text, width) {
  const value = String(text ?? "");
  if (visibleLength(value) <= width) {
    return [value];
  }

  const words = value.split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }

    if (visibleLength(`${current} ${word}`) <= width) {
      current = `${current} ${word}`;
      continue;
    }

    lines.push(current);
    current = word;
  }

  if (current) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [""];
}

function divider(width = panelWidth()) {
  return "─".repeat(width);
}

function makePanel(title, lines, width = panelWidth()) {
  const innerWidth = width - 4;
  const expandedLines = lines.flatMap((line) => {
    if (String(line ?? "") === "") {
      return [""];
    }

    return wrapLine(line, innerWidth);
  });
  const renderedLines = expandedLines.map((line) => `│ ${padVisible(line, innerWidth)} │`);
  const titleWidth = visibleLength(title);

  return [
    `┌─ ${title}${"─".repeat(Math.max(0, width - titleWidth - 5))}┐`,
    ...renderedLines,
    `└${"─".repeat(width - 2)}┘`
  ].join("\n");
}

function renderSingleColumn(title, lines, width = panelWidth()) {
  return makePanel(title, lines, width);
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
  const leftTitleWidth = visibleLength(leftTitle);
  const rightTitleWidth = visibleLength(rightTitle);

  rows.push(
    `┌─${leftTitle}${"─".repeat(Math.max(0, width - leftTitleWidth - 3))}┐ ┌─${rightTitle}${"─".repeat(Math.max(0, width - rightTitleWidth - 3))}┐`
  );

  for (let index = 0; index < left.length; index += 1) {
    const leftLine = padVisible(left[index].slice(0, innerWidth), innerWidth);
    const rightLine = padVisible(right[index].slice(0, innerWidth), innerWidth);
    rows.push(`│ ${leftLine} │ │ ${rightLine} │`);
  }

  rows.push(`└${"─".repeat(width - 2)}┘ └${"─".repeat(width - 2)}┘`);
  return rows.join("\n");
}

function renderEvidencePanels(leftTitle, leftLines, rightTitle, rightLines) {
  const total = terminalWidth();
  const twoColumnWidth = Math.floor((total - 1) / 2);

  if (twoColumnWidth < 26) {
    return [
      renderSingleColumn(leftTitle, leftLines, total),
      "",
      renderSingleColumn(rightTitle, rightLines, total)
    ].join("\n");
  }

  return renderTwoColumn(leftTitle, leftLines, rightTitle, rightLines, twoColumnWidth);
}

async function showBootSplash() {
  return;
}

async function showSignalAcquisition(topic) {
  return topic;
}

function createLoader() {
  if (!output.isTTY || process.env.CI === "true") {
    return {
      start(message) {
        if (message) {
          console.log(message);
        }
      },
      update(message) {
        if (message) {
          console.log(message);
        }
      },
      stop(finalMessage = "") {
        if (finalMessage) {
          console.log(finalMessage);
        }
      }
    };
  }

  const spinner = ora({
    text: "",
    spinner: "dots",
    color: "cyan",
    discardStdin: false
  });

  return {
    start(message) {
      spinner.text = message;
      spinner.start();
    },
    update(message) {
      spinner.text = message;
    },
    stop(finalMessage = "") {
      spinner.stop();
      if (finalMessage) {
        console.log(finalMessage);
      }
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

async function fetchReactomeEvidence(topic) {
  const url = new URL(REACTOME_SEARCH_URL);
  url.searchParams.set("query", topic);
  url.searchParams.set("types", "Pathway");
  url.searchParams.set("cluster", "true");

  const data = await fetchJson(url);
  const entries = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];

  return entries.slice(0, 5).map((item) => ({
    id: `reactome:${item.stId || item.id || item.dbId}`,
    name: item.name || item.displayName || "Unnamed pathway",
    species: item.species?.[0]?.displayName || item.speciesName || "",
    source: "Reactome",
    url: item.stId ? `https://reactome.org/content/detail/${item.stId}` : "https://reactome.org/"
  }));
}

async function fetchClinicalTrialsEvidence(topic) {
  const url = new URL(CLINICAL_TRIALS_URL);
  url.searchParams.set("expr", topic);
  url.searchParams.set("fields", "NCTId,BriefTitle,Condition,Phase");
  url.searchParams.set("min_rnk", "1");
  url.searchParams.set("max_rnk", "5");
  url.searchParams.set("fmt", "json");

  const data = await fetchJson(url);
  const studies = data?.StudyFieldsResponse?.StudyFields ?? [];

  return studies.map((study) => ({
    id: `trial:${study.NCTId?.[0] || "unknown"}`,
    title: study.BriefTitle?.[0] || "Untitled trial",
    condition: study.Condition?.[0] || "",
    phase: study.Phase?.[0] || "",
    source: "ClinicalTrials.gov",
    url: study.NCTId?.[0] ? `https://clinicaltrials.gov/study/${study.NCTId[0]}` : "https://clinicaltrials.gov/"
  }));
}

async function buildEvidencePack(topic, onEvent) {
  onEvent?.(`pubmed search :: ${topic}`);
  const [pubmed, openTargets, reactome, clinicalTrials] = await Promise.all([
    fetchPubMedEvidence(topic).catch(() => []),
    fetchOpenTargetsEvidence(topic).catch(() => []),
    fetchReactomeEvidence(topic).catch(() => []),
    fetchClinicalTrialsEvidence(topic).catch(() => [])
  ]);
  onEvent?.(`pubmed hits :: ${pubmed.length}`);
  onEvent?.(`open targets hits :: ${openTargets.length}`);
  onEvent?.(`reactome hits :: ${reactome.length}`);
  onEvent?.(`clinical trials hits :: ${clinicalTrials.length}`);

  return {
    topic,
    retrieved_at: new Date().toISOString(),
    pubmed,
    open_targets: openTargets,
    reactome,
    clinical_trials: clinicalTrials
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
  const reactomeLines =
    evidence.reactome.length === 0
      ? ["no results"]
      : evidence.reactome.flatMap((item) => [
          item.name,
          `${item.species || "species unknown"} :: ${item.id}`
        ]);
  const trialLines =
    evidence.clinical_trials.length === 0
      ? ["no results"]
      : evidence.clinical_trials.flatMap((item) => [
          item.title,
          `${item.phase || "phase unknown"} :: ${item.id}`
        ]);

  console.log(`\n${color(`Source pack for ${evidence.topic}`, ANSI.green)}\n`);
  console.log(renderEvidencePanels("PubMed", pubmedLines, "Open Targets", targetLines));
  console.log("");
  console.log(renderEvidencePanels("Reactome", reactomeLines, "ClinicalTrials.gov", trialLines));
  console.log("");
}

function openExternal(url) {
  if (process.platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    return;
  }

  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    return;
  }

  spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}

function encodeReviewItem(hypothesis) {
  return Buffer.from(JSON.stringify(hypothesis), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function openReviewSession(topic, hypothesis) {
  const url = new URL("/review", REVIEW_APP_URL);
  url.searchParams.set("topic", topic);
  url.searchParams.set("item", encodeReviewItem(hypothesis));

  openExternal(url.toString());
  return url.toString();
}

function clearScreen() {
  if (output.isTTY) {
    output.write("\x1b[2J\x1b[H");
  }
}

function evidenceDetailsForHypothesis(hypothesis, evidence) {
  const refs = Array.isArray(hypothesis.evidence_refs) ? hypothesis.evidence_refs : [];
  const pubmed = new Map((evidence?.pubmed ?? []).map((item) => [item.id, item]));
  const openTargets = new Map((evidence?.open_targets ?? []).map((item) => [item.id, item]));
  const reactome = new Map((evidence?.reactome ?? []).map((item) => [item.id, item]));
  const clinicalTrials = new Map((evidence?.clinical_trials ?? []).map((item) => [item.id, item]));

  return refs.map((ref) => {
    if (pubmed.has(ref)) {
      const item = pubmed.get(ref);
      return `PubMed :: ${item.title} (${item.pubdate || "date unknown"})`;
    }

    if (openTargets.has(ref)) {
      const item = openTargets.get(ref);
      return `Open Targets :: ${item.name} [${item.entity}]`;
    }

    if (reactome.has(ref)) {
      const item = reactome.get(ref);
      return `Reactome :: ${item.name}${item.species ? ` (${item.species})` : ""}`;
    }

    if (clinicalTrials.has(ref)) {
      const item = clinicalTrials.get(ref);
      return `ClinicalTrials.gov :: ${item.title}${item.phase ? ` (${item.phase})` : ""}`;
    }

    return `Reference :: ${ref}`;
  });
}

function formatHypothesisScreen(topic, hypothesis, index, evidence) {
  const supportingEvidence = evidenceDetailsForHypothesis(hypothesis, evidence);
  const evidenceLines =
    supportingEvidence.length > 0
      ? supportingEvidence.map((item) => `- ${item}`)
      : ["No linked evidence details found"];
  const evidenceRefLine =
    Array.isArray(hypothesis.evidence_refs) && hypothesis.evidence_refs.length > 0
      ? hypothesis.evidence_refs.join(", ")
      : "none attached";

  return [
    color(`Topic :: ${topic}`, ANSI.dim),
    "",
    color(hypothesis.title, ANSI.green),
    "",
    color("How It Might Work", ANSI.cyan),
    hypothesis.mechanism,
    "",
    color("Why It May Matter", ANSI.cyan),
    hypothesis.rationale,
    "",
    color("Suggested Follow-Up", ANSI.cyan),
    hypothesis.next_test,
    "",
    color("Assessment", ANSI.cyan),
    `Novelty: ${hypothesis.novelty_score}/10`,
    `Plausibility: ${hypothesis.plausibility_score}/10`,
    "",
    color("Linked Source Refs", ANSI.cyan),
    evidenceRefLine,
    "",
    color("Supporting Sources", ANSI.cyan),
    "Retrieved source material linked to this direction.",
    "",
    evidenceLines.join("\n")
  ].join("\n");
}

function renderHypothesis(topic, hypothesis, index, evidence) {
  clearScreen();
  console.log(`\n${formatHypothesisScreen(topic, hypothesis, index, evidence)}\n`);
}

async function showHypothesisScreen(topic, hypothesis, index, evidence) {
  renderHypothesis(topic, hypothesis, index, evidence);

  if (!input.isTTY || !output.isTTY) {
    const rl = readline.createInterface({ input, output });
    try {
      while (true) {
        const answer = (await rl.question("Action: [Enter] back, [q] quit [o] open in browser: "))
          .trim()
          .toLowerCase();

        if (answer === "") {
          return "back";
        }

        if (answer === "o") {
          console.log(
            color(`Opened review :: ${openReviewSession(topic, hypothesis)}`, ANSI.cyan)
          );
          continue;
        }

        if (answer === "q") {
          return "quit";
        }

        console.log(color("Invalid action. Use Enter, q, or o.", ANSI.amber));
      }
    } finally {
      rl.close();
    }
  }

  output.write("Action: [Enter] back, [q] quit [o] open in browser: ");

  return new Promise((resolve, reject) => {
    function cleanup() {
      input.setRawMode(false);
      input.pause();
      input.off("data", onData);
      output.write("\n");
    }

    function finish(value) {
      cleanup();
      resolve(value);
    }

    function onData(buffer) {
      const key = buffer.toString("utf8").toLowerCase();

      if (key === "\u0003") {
        cleanup();
        reject(new Error("Interrupted"));
        return;
      }

      if (key === "\r" || key === "\n" || key === "\r\n") {
        finish("back");
        return;
      }

      if (key === "o") {
        output.write(
          color(`\nOpened review :: ${openReviewSession(topic, hypothesis)}\n`, ANSI.cyan)
        );
        output.write("Action: [Enter] back, [q] quit [o] open in browser: ");
        return;
      }

      if (key === "q") {
        finish("quit");
        return;
      }
    }

    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });
}

async function runInteractivePicker(result, evidence) {
  if (!input.isTTY || !output.isTTY) {
    await runFallbackPicker(result, evidence);
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
      footer: "Enter inspect  |  o open review page  |  q quit",
      useAltScreen: true,
      onKey(key, currentIndex) {
        if (key.toLowerCase() === "o") {
          return {
            action: "open",
            selectedIndex: currentIndex
          };
        }

        return null;
      }
    });

    if (selectedIndex === "quit") {
      return;
    }

    if (selectedIndex?.action === "open") {
      const chosenIndex = selectedIndex.selectedIndex;
      console.log(
        color(
          `Opened review :: ${openReviewSession(result.topic, result.hypotheses[chosenIndex])}`,
          ANSI.cyan
        )
      );
      continue;
    }

    const action = await showHypothesisScreen(
      result.topic,
      result.hypotheses[selectedIndex],
      selectedIndex,
      evidence
    );
    if (action === "quit") {
      return;
    }
  }
}

async function runFallbackPicker(result, evidence) {
  const rl = readline.createInterface({ input, output });

  try {
    renderList(result);

    while (true) {
      const answer = (await rl.question("> ")).trim().toLowerCase();

      if (answer === "q") {
        return;
      }

      if (answer.startsWith("o ")) {
        const selectedIndex = Number(answer.slice(2).trim()) - 1;

        if (Number.isInteger(selectedIndex) && result.hypotheses[selectedIndex]) {
          console.log(
            color(
              `Opened review :: ${openReviewSession(result.topic, result.hypotheses[selectedIndex])}`,
              ANSI.cyan
            )
          );
          continue;
        }
      }

      const selectedIndex = Number(answer) - 1;
      if (Number.isInteger(selectedIndex) && result.hypotheses[selectedIndex]) {
        await showHypothesisScreen(
          result.topic,
          result.hypotheses[selectedIndex],
          selectedIndex,
          evidence
        );
        console.log("Pick another path, or [q] quit\n");
        continue;
      }

      console.log("Use 1-10 to inspect a path, `o <number>` to open review page, or [q] to quit.\n");
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
      {
        label: "Propose paths",
        description: "Generate research directions from public biomedical evidence",
        value: "propose"
      },
      {
        label: "View sources",
        description: "Review retrieved source material before generating paths",
        value: "evidence"
      },
      {
        label: "Quit",
        description: "Exit Remission",
        value: "quit"
      }
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
      { label: "Custom topic...", value: "custom" }
    ],
    {
      header: [
        color("Select a starting topic", ANSI.cyan),
        color("Pick a common cancer type or enter your own.", ANSI.dim)
      ],
      footer: "Choose a topic, or use Custom topic... for a specific query",
      useAltScreen: true
    }
  );

  if (topicChoice === "quit") {
    return "";
  }

  if (topicChoice === "custom") {
    console.log(`\nReference: ${NCI_CANCER_TYPES_URL}`);
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
    console.log("2. View sources");
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
  const onKey = config.onKey ?? null;

  function render() {
    const headerLines = Array.isArray(header) ? header : [header];
    const lines = options.flatMap((option, index) => {
      const rendered = [`${index === selectedIndex ? "> " : "  "}${option.label}`];

      if (option.description) {
        rendered.push(`  ${color(option.description, ANSI.dim)}`);
      }

      rendered.push("");
      return rendered;
    });

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

      if (key === "\r" || key === "\n" || key === "\r\n") {
        finish(options[selectedIndex].value);
        return;
      }

      if (key.toLowerCase() === "q") {
        finish("quit");
        return;
      }

      if (onKey) {
        const customResult = onKey(key, selectedIndex);

        if (customResult !== null && customResult !== undefined) {
          finish(customResult);
        }
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

  const loader = createLoader();
  await showSignalAcquisition(topic);
  loader.start("Remission is gathering public source material...");
  const evidenceLogs = [];
  const evidence = await buildEvidencePack(topic, (message) => {
    evidenceLogs.push(message);
    loader.update(`Remission is gathering public source material... ${message}`);
  });
  loader.update("Remission is talking with Nemotron 3 using your configured model...");
  const result = await callModel(topic, apiKey, evidence);
  loader.update(`Remission is ranking ${result.hypotheses.length} candidate paths...`);
  loader.stop(color("Ready :: Path map prepared", ANSI.green));

  if (options.json) {
    console.log(JSON.stringify({ evidence, result }, null, 2));
    return;
  }

  console.log("");
  console.log(
    color(
      makePanel("Source ingest", evidenceLogs.length > 0 ? evidenceLogs : ["no source logs"]),
      ANSI.dim
    )
  );
  console.log(color("Grounded with public source material from PubMed and Open Targets.", ANSI.green));
  console.log(color(`Open review page with "o" to fetch live browser data.`, ANSI.dim));
  console.log("Use `npm run evidence -- \"topic\" --json` to inspect the raw source pack.\n");
  await runInteractivePicker(result, evidence);
}

async function evidence(topic, options) {
  const loader = createLoader();
  loader.start("Remission is gathering public source material...");
  const result = await buildEvidencePack(topic);
  loader.stop(color("Ready :: Source pack prepared", ANSI.green));

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
