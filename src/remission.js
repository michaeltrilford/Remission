import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import ora from "ora";

const DEFAULT_MODEL = "nvidia/nemotron-3.5-lightning:free";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const PUBMED_SEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
const PUBMED_SUMMARY_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi";
const OPEN_TARGETS_URL = "https://api.platform.opentargets.org/api/v4/graphql";
const REACTOME_SEARCH_URL = "https://reactome.org/ContentService/search/query";
const CLINICAL_TRIALS_URL = "https://clinicaltrials.gov/api/v2/studies";
const NZ_LEGISLATION_WORKS_URL = "https://api.legislation.govt.nz/v0/works/";
const CBIOPORTAL_STUDIES_URL = "https://www.cbioportal.org/api/studies";
const DEPMAP_DOWNLOAD_FILES_URL = "https://depmap.org/portal/api/no-captcha/download/files";
const CHEMBL_TARGET_SEARCH_URL = "https://www.ebi.ac.uk/chembl/api/data/target/search.json";
const CIVIC_GRAPHQL_URL = "https://civicdb.org/api/graphql";
const GDC_PROJECTS_URL = "https://api.gdc.cancer.gov/projects";
const PUBLIC_SOURCE_HEADERS = {
  Accept: "application/json",
  "User-Agent": "Remission/0.1 (+https://github.com/michaeltrilford/Remission)"
};
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
  // Muibook dark theme: grey surfaces/text with blue, green, orange, and red states.
  dim: "\x1b[38;2;170;170;170m", // grey-400
  bright: "\x1b[1;38;2;242;242;242m", // grey-50
  border: "\x1b[38;2;102;102;102m", // grey-600
  green: "\x1b[38;2;1;191;53m", // green-500
  cyan: "\x1b[38;2;89;175;244m", // blue-500
  amber: "\x1b[38;2;246;163;34m", // orange-500
  red: "\x1b[38;2;226;73;71m" // red-500
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

Environment:
  REMISSION_MODEL  Optional override; defaults to nvidia/nemotron-3.5-lightning:free
`.trim());
}

function reviewAppUrl() {
  return process.env.REMISSION_REVIEW_APP_URL || "https://remission-sigma.vercel.app";
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
  const border = (value) => color(value, ANSI.border);

  return [
    `${border("┌─ ")}${color(title, ANSI.bright)}${border("─".repeat(Math.max(0, width - titleWidth - 5)) + "┐")}`,
    ...renderedLines.map((line) => `${border("│")} ${line.slice(2, -2)} ${border("│")}`),
    border(`└${"─".repeat(width - 2)}┘`)
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
    `${color("┌─", ANSI.border)}${color(leftTitle, ANSI.bright)}${color("─".repeat(Math.max(0, width - leftTitleWidth - 3)) + "┐", ANSI.border)} ${color("┌─", ANSI.border)}${color(rightTitle, ANSI.bright)}${color("─".repeat(Math.max(0, width - rightTitleWidth - 3)) + "┐", ANSI.border)}`
  );

  for (let index = 0; index < left.length; index += 1) {
    const leftLine = padVisible(left[index].slice(0, innerWidth), innerWidth);
    const rightLine = padVisible(right[index].slice(0, innerWidth), innerWidth);
    rows.push(`${color("│", ANSI.border)} ${leftLine} ${color("│", ANSI.border)} ${color("│", ANSI.border)} ${rightLine} ${color("│", ANSI.border)}`);
  }

  rows.push(`${color(`└${"─".repeat(width - 2)}┘`, ANSI.border)} ${color(`└${"─".repeat(width - 2)}┘`, ANSI.border)}`);
  return rows.join("\n");
}

function renderEvidencePanels(leftTitle, leftLines, rightTitle, rightLines) {
  const total = terminalWidth();
  const twoColumnWidth = Math.floor((total - 1) / 2);
  const longestTitle = Math.max(visibleLength(leftTitle), visibleLength(rightTitle));

  if (twoColumnWidth < 30 || longestTitle > twoColumnWidth - 6) {
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
  const normalizedContent = String(content).trim();
  const candidates = [
    normalizedContent,
    normalizedContent.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
  ];
  const objectStart = normalizedContent.indexOf("{");
  const objectEnd = normalizedContent.lastIndexOf("}");

  if (objectStart >= 0 && objectEnd > objectStart) {
    candidates.push(normalizedContent.slice(objectStart, objectEnd + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);

      if (parsed && Array.isArray(parsed.hypotheses) && parsed.hypotheses.length > 0) {
        return parsed;
      }
    } catch {
      // Try the next representation so free endpoints can return fenced JSON.
    }
  }

  throw new Error("Model returned invalid JSON or did not include hypotheses");
}

function configuredModel() {
  return process.env.REMISSION_MODEL || DEFAULT_MODEL;
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
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "Remission/0.1 (+https://github.com/michaeltrilford/Remission)"
    },
    body: JSON.stringify({
      query,
      variables: {
        queryString: topic
      }
    })
  });

  if (Array.isArray(data.errors) && data.errors.length > 0) {
    throw new Error(data.errors.map((error) => error.message).join("; "));
  }

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
  const entries = Array.isArray(data?.results)
    ? data.results.flatMap((group) => (Array.isArray(group?.entries) ? group.entries : [group]))
    : Array.isArray(data)
      ? data
      : [];

  return entries
    .map((item) => {
      const stableId = item.stId || item.id || item.dbId || "";
      const name = String(item.name || item.displayName || "").replace(/<[^>]+>/g, "");
      const species = Array.isArray(item.species)
        ? item.species[0]?.displayName || item.species[0] || ""
        : item.speciesName || "";

      if (!stableId || !name) {
        return null;
      }

      return {
        id: `reactome:${stableId}`,
        name,
        species,
        source: "Reactome",
        url: item.stId ? `https://reactome.org/content/detail/${item.stId}` : "https://reactome.org/"
      };
    })
    .filter(Boolean)
    .slice(0, 5);
}

async function fetchClinicalTrialsEvidence(topic) {
  const url = new URL(CLINICAL_TRIALS_URL);
  url.searchParams.set("query.term", topic);
  url.searchParams.set("pageSize", "5");

  const data = await fetchJson(url);
  const studies = data?.studies ?? [];

  return studies.map((study) => {
    const protocol = study.protocolSection ?? {};
    const identification = protocol.identificationModule ?? {};
    const conditions = protocol.conditionsModule?.conditions ?? [];
    const phases = protocol.designModule?.phases ?? [];
    const nctId = identification.nctId || "unknown";

    return {
      id: `trial:${nctId}`,
      title: identification.briefTitle || "Untitled trial",
      condition: conditions[0] || "",
      phase: phases.join(", "),
      source: "ClinicalTrials.gov",
      url: nctId !== "unknown" ? `https://clinicaltrials.gov/study/${nctId}` : "https://clinicaltrials.gov/"
    };
  });
}

async function fetchCbioPortalEvidence(topic) {
  const url = new URL(CBIOPORTAL_STUDIES_URL);
  url.searchParams.set("keyword", topic);
  url.searchParams.set("projection", "SUMMARY");
  url.searchParams.set("pageSize", "5");

  const data = await fetchJson(url, { headers: PUBLIC_SOURCE_HEADERS });

  return (Array.isArray(data) ? data : []).slice(0, 5).map((study) => ({
    id: `cbioportal:${study.studyId}`,
    name: study.name || study.studyId,
    description: study.description || "",
    cancer_type: study.cancerTypeId || "",
    sample_count: study.allSampleCount ?? null,
    pmid: study.pmid || "",
    source: "cBioPortal",
    url: `https://www.cbioportal.org/study/summary?id=${encodeURIComponent(study.studyId)}`
  }));
}

async function fetchDepMapEvidence(topic) {
  const response = await fetch(DEPMAP_DOWNLOAD_FILES_URL, {
    headers: {
      Accept: "text/csv",
      "User-Agent": PUBLIC_SOURCE_HEADERS["User-Agent"]
    }
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Request failed ${response.status}: ${errorBody}`);
  }

  const rows = (await response.text())
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split(","))
    .filter((columns) => columns.length >= 3);
  const relevantRows = rows
    .filter(([, , filename]) => /dependency|gene.?effect|screen|sensitivity|compound/i.test(filename))
    .slice(0, 5);

  return relevantRows.map(([release, releaseDate, filename, fileUrl]) => ({
    id: `depmap:${release}:${filename}`,
    name: filename,
    description: `Current ${release} dataset for ${topic}; release date ${releaseDate}.`,
    release,
    release_date: releaseDate,
    source: "DepMap",
    url: fileUrl || "https://depmap.org/portal/data_page/?tab=currentRelease"
  }));
}

async function fetchChemblEvidence(topic) {
  const url = new URL(CHEMBL_TARGET_SEARCH_URL);
  url.searchParams.set("q", topic);
  url.searchParams.set("limit", "5");

  const data = await fetchJson(url, { headers: PUBLIC_SOURCE_HEADERS });
  const targets = Array.isArray(data?.targets) ? data.targets : [];

  return targets.map((target) => {
    const geneSymbols = (target.target_components ?? [])
      .flatMap((component) => component.target_component_synonyms ?? [])
      .filter((synonym) => synonym.syn_type === "GENE_SYMBOL")
      .map((synonym) => synonym.synonyms)
      .filter(Boolean);

    return {
      id: `chembl:${target.target_chembl_id}`,
      name: target.pref_name || target.target_chembl_id,
      description: `${target.organism || "Unknown organism"}${geneSymbols.length > 0 ? ` :: ${geneSymbols.join(", ")}` : ""}`,
      target_chembl_id: target.target_chembl_id,
      source: "ChEMBL",
      url: `https://www.ebi.ac.uk/chembl/explore/target/${target.target_chembl_id}`
    };
  });
}

async function fetchCivicEvidence(topic) {
  const query = `
    query EvidenceItems($diseaseName: String!, $first: Int!) {
      evidenceItems(diseaseName: $diseaseName, first: $first) {
        nodes {
          id
          name
          description
          evidenceType
          evidenceLevel
          evidenceRating
          evidenceDirection
          significance
          link
        }
      }
    }
  `;
  const data = await fetchJson(CIVIC_GRAPHQL_URL, {
    method: "POST",
    headers: {
      ...PUBLIC_SOURCE_HEADERS,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query,
      variables: { diseaseName: topic, first: 5 }
    })
  });

  if (Array.isArray(data.errors) && data.errors.length > 0) {
    throw new Error(data.errors.map((error) => error.message).join("; "));
  }

  return (data.data?.evidenceItems?.nodes ?? []).map((item) => ({
    id: `civic:${item.id}`,
    name: item.name || `EID${item.id}`,
    description: item.description || "",
    evidence_type: item.evidenceType || "",
    evidence_level: item.evidenceLevel || "",
    evidence_rating: item.evidenceRating ?? null,
    evidence_direction: item.evidenceDirection || "",
    significance: item.significance || "",
    source: "CIViC",
    url: `https://civicdb.org${item.link || `/evidence/${item.id}`}`
  }));
}

function gdcPrimarySitesForTopic(topic) {
  const aliases = [
    [/breast/i, ["Breast"]],
    [/lung/i, ["Bronchus and lung"]],
    [/colorectal|colon/i, ["Colon", "Rectum"]],
    [/pancrea/i, ["Pancreas"]],
    [/prostate/i, ["Prostate gland"]],
    [/melanoma|skin/i, ["Skin"]],
    [/glioblastoma|brain/i, ["Brain"]],
    [/leukemia|lymphoma/i, ["Blood"]],
    [/ovarian|ovary/i, ["Ovary"]]
  ];

  return aliases.filter(([pattern]) => pattern.test(topic)).flatMap(([, sites]) => sites);
}

async function fetchGdcEvidence(topic) {
  const primarySites = gdcPrimarySitesForTopic(topic);
  if (primarySites.length === 0) {
    return [];
  }

  const url = new URL(GDC_PROJECTS_URL);
  url.searchParams.set(
    "filters",
    JSON.stringify({ op: "in", content: { field: "primary_site", value: primarySites } })
  );
  url.searchParams.set("size", "100");
  url.searchParams.set("fields", "project_id,name,primary_site,disease_type");

  const data = await fetchJson(url, { headers: PUBLIC_SOURCE_HEADERS });
  const projects = data.data?.hits ?? [];
  const exactSiteProjects = projects.filter((project) => {
    const sites = project.primary_site ?? [];
    return sites.length === 1 && primarySites.includes(sites[0]);
  });
  const broaderProjects = projects.filter((project) => !exactSiteProjects.includes(project));
  const orderedProjects = [...exactSiteProjects, ...broaderProjects].slice(0, 5);

  return orderedProjects.map((project) => ({
    id: `gdc:${project.project_id}`,
    name: project.name || project.project_id,
    description: `${(project.primary_site ?? []).join(", ")} :: ${(project.disease_type ?? []).slice(0, 2).join(", ")}`,
    project_id: project.project_id,
    primary_site: project.primary_site ?? [],
    source: "GDC",
    url: `https://portal.gdc.cancer.gov/projects/${project.project_id}`
  }));
}

async function fetchNzLegislationEvidence(topic) {
  const apiKey = process.env.NZ_LEGISLATION_API_KEY;

  if (!apiKey) {
    return [];
  }

  const url = new URL(NZ_LEGISLATION_WORKS_URL);
  url.searchParams.set("search_term", topic);
  url.searchParams.set("search_field", "content");
  url.searchParams.set("page", "1");
  url.searchParams.set("per_page", "5");
  url.searchParams.set("legislation_status", "in_force");
  url.searchParams.set("administering_agencies", "Ministry of Health");
  url.searchParams.set("sort_by", "most_recently_updated");

  const data = await fetchJson(url, {
    headers: {
      "X-Api-Key": apiKey
    }
  });

  return (data?.results ?? []).map((item) => {
    const latestVersion = item.latest_matching_version ?? {};
    const formats = Array.isArray(latestVersion.formats) ? latestVersion.formats : [];
    const htmlFormat =
      formats.find((format) => format.type === "html") ??
      formats.find((format) => format.type === "pdf") ??
      formats[0];

    return {
      id: `nzlegislation:${item.work_id}`,
      title: latestVersion.title || item.work_id,
      work_id: item.work_id,
      version_id: latestVersion.version_id || "",
      legislation_type: item.legislation_type || "",
      agencies: Array.isArray(item.administering_agencies) ? item.administering_agencies : [],
      source: "NZ Legislation",
      url: htmlFormat?.url || "https://www.legislation.govt.nz/"
    };
  });
}

async function buildEvidencePack(topic, onEvent) {
  const sourceRequests = [
    { key: "pubmed", label: "pubmed", fetch: () => fetchPubMedEvidence(topic) },
    { key: "open_targets", label: "open targets", fetch: () => fetchOpenTargetsEvidence(topic) },
    { key: "reactome", label: "reactome", fetch: () => fetchReactomeEvidence(topic) },
    { key: "clinical_trials", label: "clinical trials", fetch: () => fetchClinicalTrialsEvidence(topic) },
    { key: "cbioportal", label: "cBioPortal", fetch: () => fetchCbioPortalEvidence(topic) },
    { key: "depmap", label: "DepMap", fetch: () => fetchDepMapEvidence(topic) },
    { key: "chembl", label: "ChEMBL", fetch: () => fetchChemblEvidence(topic) },
    { key: "civic", label: "CIViC", fetch: () => fetchCivicEvidence(topic) },
    { key: "gdc", label: "GDC", fetch: () => fetchGdcEvidence(topic) }
  ];

  if (process.env.NZ_LEGISLATION_API_KEY) {
    sourceRequests.push({
      key: "nz_legislation",
      label: "nz legislation",
      fetch: () => fetchNzLegislationEvidence(topic)
    });
  }

  const sourceResults = await Promise.all(
    sourceRequests.map(async ({ key, label, fetch: fetchSource }) => {
      try {
        const items = await fetchSource();
        onEvent?.(`${label} hits :: ${items.length}`);
        return { key, items };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        onEvent?.(`${label} error :: ${message}`);
        return { key, items: [], error: message };
      }
    })
  );

  const sources = Object.fromEntries(sourceResults.map(({ key, items }) => [key, items]));
  const sourceErrors = Object.fromEntries(
    sourceResults.filter(({ error }) => error).map(({ key, error }) => [key, error])
  );

  return {
    topic,
    retrieved_at: new Date().toISOString(),
    pubmed: sources.pubmed ?? [],
    open_targets: sources.open_targets ?? [],
    reactome: sources.reactome ?? [],
    clinical_trials: sources.clinical_trials ?? [],
    cbioportal: sources.cbioportal ?? [],
    depmap: sources.depmap ?? [],
    chembl: sources.chembl ?? [],
    civic: sources.civic ?? [],
    gdc: sources.gdc ?? [],
    nz_legislation: sources.nz_legislation ?? [],
    source_errors: sourceErrors
  };
}

function renderEvidence(evidence) {
  const sourceErrors = evidence.source_errors ?? {};
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
  const legislationLines =
    (evidence.nz_legislation ?? []).length === 0
      ? ["no results"]
      : evidence.nz_legislation.flatMap((item) => [
          item.title,
          `${item.legislation_type || "type unknown"} :: ${item.id}`
        ]);
  const cbioportalLines =
    (evidence.cbioportal ?? []).length === 0
      ? ["no results"]
      : evidence.cbioportal.flatMap((item) => [
          item.name,
          `${item.sample_count ?? "?"} samples :: ${item.cancer_type || item.id}`
        ]);
  const depmapLines =
    (evidence.depmap ?? []).length === 0
      ? ["no results"]
      : evidence.depmap.flatMap((item) => [item.name, `${item.release} :: ${item.release_date}`]);
  const chemblLines =
    (evidence.chembl ?? []).length === 0
      ? ["no results"]
      : evidence.chembl.flatMap((item) => [item.name, item.description || item.target_chembl_id]);
  const civicLines =
    (evidence.civic ?? []).length === 0
      ? ["no results"]
      : evidence.civic.flatMap((item) => [
          item.name,
          `${item.evidence_type || "evidence"} :: Level ${item.evidence_level || "?"} :: ${item.evidence_direction || "direction unknown"}`
        ]);
  const gdcLines =
    (evidence.gdc ?? []).length === 0
      ? ["no results"]
      : evidence.gdc.flatMap((item) => [
          item.name,
          `${item.project_id} :: ${(item.primary_site ?? []).join(", ")}`
        ]);

  console.log(`\n${color(`Source pack for ${evidence.topic}`, ANSI.green)}\n`);
  if (Object.keys(sourceErrors).length > 0) {
    const errorLines = Object.entries(sourceErrors).map(([source, message]) => `${source} :: ${message}`);
    console.log(color(makePanel("Source status", errorLines, terminalWidth()), ANSI.red));
    console.log("");
  }
  console.log(renderEvidencePanels("PubMed", pubmedLines, "Open Targets", targetLines));
  console.log("");
  console.log(renderEvidencePanels("Reactome", reactomeLines, "ClinicalTrials.gov", trialLines));
  if (process.env.NZ_LEGISLATION_API_KEY) {
    console.log("");
    console.log(renderSingleColumn("NZ Legislation", legislationLines, terminalWidth()));
  }
  console.log("");
  console.log(renderEvidencePanels("cBioPortal", cbioportalLines, "DepMap", depmapLines));
  console.log("");
  console.log(renderEvidencePanels("ChEMBL", chemblLines, "CIViC", civicLines));
  console.log("");
  console.log(renderSingleColumn("GDC", gdcLines, terminalWidth()));
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
  const url = new URL("/review", reviewAppUrl());
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
  const cbioportal = new Map((evidence?.cbioportal ?? []).map((item) => [item.id, item]));
  const depmap = new Map((evidence?.depmap ?? []).map((item) => [item.id, item]));
  const chembl = new Map((evidence?.chembl ?? []).map((item) => [item.id, item]));
  const civic = new Map((evidence?.civic ?? []).map((item) => [item.id, item]));
  const gdc = new Map((evidence?.gdc ?? []).map((item) => [item.id, item]));
  const nzLegislation = new Map((evidence?.nz_legislation ?? []).map((item) => [item.id, item]));

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

    if (cbioportal.has(ref)) {
      const item = cbioportal.get(ref);
      return `cBioPortal :: ${item.name}${item.sample_count ? ` (${item.sample_count} samples)` : ""}`;
    }

    if (depmap.has(ref)) {
      const item = depmap.get(ref);
      return `DepMap :: ${item.name} (${item.release})`;
    }

    if (chembl.has(ref)) {
      const item = chembl.get(ref);
      return `ChEMBL :: ${item.name}`;
    }

    if (civic.has(ref)) {
      const item = civic.get(ref);
      return `CIViC :: ${item.name} (${item.evidence_level || "level unknown"})`;
    }

    if (gdc.has(ref)) {
      const item = gdc.get(ref);
      return `GDC :: ${item.name}`;
    }

    if (nzLegislation.has(ref)) {
      const item = nzLegislation.get(ref);
      const agency = item.agencies?.[0];
      return `NZ Legislation :: ${item.title}${agency ? ` (${agency})` : ""}`;
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
        label: "Generate research directions",
        description: "Grounded in public biomedical source material",
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
  const model = configuredModel();
  const requestBody = {
    model,
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
    ]
  };

  if (!model.endsWith(":free")) {
    requestBody.response_format = {
      type: "json_object"
    };
  }

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/michaeltrilford/Remission",
      "X-Title": "Remission"
    },
    body: JSON.stringify(requestBody)
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
  loader.update(`Remission is generating with ${configuredModel()}...`);
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
  console.log(color("Grounded with retrieved source material across connected public sources.", ANSI.green));
  console.log(color(`Open review page with "o" to fetch live browser data.`, ANSI.dim));
  console.log("Use `npm run evidence -- \"topic\" --json` to inspect the raw source pack.\n");
  await runInteractivePicker(result, evidence);
}

async function evidence(topic, options) {
  loadEnvFile();

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
  loadEnvFile();

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
