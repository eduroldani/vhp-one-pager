import { mkdir, readFile, rm, writeFile, copyFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import vm from "node:vm";

const rootDir = process.cwd();
const publicDir = join(rootDir, "public");
const distDir = join(rootDir, "dist");
const routeSlugs = new Set(["autocast", "startup-name"]);

loadEnvFile(".env");
loadEnvFile(".env.local");

const fallbackStartups = await readCurrentStartups();
const startups = await loadStartups();
await writeDataFile(startups);
await syncRootStaticFiles(startups);
await syncDistFiles(startups);
await writeIntakeSchema();

async function loadStartups() {
  if (!process.env.AIRTABLE_TOKEN || !process.env.AIRTABLE_BASE_ID) {
    console.log("Airtable credentials not found. Building with local fallback data.");
    return fallbackStartups;
  }

  const table = process.env.AIRTABLE_STARTUPS_TABLE || "Startups";
  const records = await fetchAirtableRecords(table, { useView: true });
  const publishedRecords = records.filter((record) => {
    const fields = record.fields || {};
    const status = readField(fields, ["Status", "Publish Status"]);
    return !status || ["Ready", "Published", "Live"].includes(String(status));
  });

  if (!publishedRecords.length) {
    console.log("No Airtable startup records matched Ready/Published/Live. Building with local fallback data.");
    return fallbackStartups;
  }

  const founderRecords = await fetchAirtableRecords(process.env.AIRTABLE_FOUNDERS_TABLE || "Alumni", { useView: false });
  const foundersById = new Map(founderRecords.map((record) => [record.id, record.fields || {}]));
  const contactRecords = await fetchAirtableRecords(process.env.AIRTABLE_CONTACTS_TABLE || "Contact", { useView: false });
  const contactsById = new Map([
    ...contactRecords.map((record) => [record.id, record.fields || {}]),
    ...founderRecords.map((record) => [record.id, record.fields || {}])
  ]);
  const normalized = {};
  for (const record of publishedRecords) {
    const startup = normalizeStartup(record.fields || {}, foundersById, contactsById);
    normalized[startup.slug] = stripSlug(startup);
  }

  return normalized;
}

async function fetchAirtableRecords(table, options = {}) {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const encodedTable = encodeURIComponent(table);
  const params = new URLSearchParams();
  params.set("pageSize", "100");
  if (options.useView && process.env.AIRTABLE_VIEW) {
    params.set("view", process.env.AIRTABLE_VIEW);
  }

  const records = [];
  let offset = "";

  do {
    if (offset) params.set("offset", offset);
    const url = `https://api.airtable.com/v0/${baseId}/${encodedTable}?${params}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`
      }
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Airtable request failed: ${response.status} ${message}`);
    }

    const payload = await response.json();
    records.push(...(payload.records || []));
    offset = payload.offset || "";
  } while (offset);

  return records;
}

function normalizeStartup(fields, foundersById = new Map(), contactsById = new Map()) {
  const name = readField(fields, ["Startup Name", "Startup Name (from Founders)", "Name"]) || "Startup Name";
  const slug = slugify(readField(fields, ["Slug"]) || name);
  const team = resolveFounders(readRawField(fields, ["Founders"]), foundersById);
  const fallbackTeam = parsePeople(readField(fields, ["Core Team", "Team"]));
  const quickFacts = parseLabeledRows(readField(fields, ["Quick Facts"]));
  const contact = resolveContacts(readRawField(fields, ["Main Contact"]), contactsById);
  const website = readField(fields, ["Website", "Web Site", "URL"]);
  const contactRows = contact.length ? contact : compactRows([
    ["Contact person", readField(fields, ["Contact person", "Contact Person"])],
    ["Email", readField(fields, ["Email", "Contact"])]
  ]);
  if (website) contactRows.push(["Website", website]);

  return {
    slug,
    name,
    tagline: readField(fields, ["Tagline", "One-line Description", "Description"]) || "",
    logoText: readField(fields, ["Logo Text"]) || initials(name),
    quickFacts: quickFacts.length ? quickFacts : compactRows([
      ["Founding Date", readField(fields, ["Founding Date"])],
      ["Stage of Company / Product Stage", readField(fields, ["Stage of Company / Product Stage", "Stage"])],
      ["Team Size", readField(fields, ["Team Size"])]
    ]),
    contact: contactRows,
    sections: [
      {
        title: "Problem",
        icon: "problem",
        body: splitParagraphs(readField(fields, ["Problem"]))
      },
      {
        title: "Solution",
        icon: "solution",
        body: splitParagraphs(readField(fields, ["Solution Intro", "Solution"])).slice(0, 1),
        bullets: splitExplicitList(readField(fields, ["Solution Bullets"])),
        afterBody: splitParagraphs(readField(fields, ["Solution After", "Solution Details"]))
      },
      {
        title: "Core Team",
        icon: "team",
        people: team.length ? team : fallbackTeam
      },
      {
        title: "Market Opportunity",
        icon: "market",
        body: splitParagraphs(readField(fields, ["Market Opportunity", "Market Oportunity", "Market", "Market Size"])),
        bullets: splitExplicitList(readField(fields, ["Market Opportunity Bullets"]))
      },
      {
        title: "Competitors",
        icon: "competitors",
        body: splitTextUnlessExplicitList(readField(fields, ["Competitors", "Competitor", "Competidor", "Competiros"])),
        bullets: splitExplicitList(readField(fields, ["Competitors", "Competitor", "Competidor", "Competiros"]))
      },
      {
        title: "Business Model",
        icon: "business",
        body: [
          ...splitParagraphs(readField(fields, ["Business Model Intro"])),
          ...withLabel("Target customer", readField(fields, ["Target Customers", "Target Customer"])),
          ...splitParagraphs(readField(fields, ["Business Model"])),
          ...withLabel("Go-to-Market", readField(fields, ["Go-to-Market", "Go To Market"]))
        ],
        bullets: splitExplicitList(readField(fields, ["Business Model Bullets"]))
      },
      {
        title: "Key Milestones",
        icon: "milestones",
        body: splitParagraphs(readField(fields, ["Key Milestones"])),
        groupedBullets: readField(fields, ["Key Milestones"]) ? [] : [
          ["Reached", splitExplicitList(readField(fields, ["Milestones Reached", "Reached"]))],
          ["Planned", splitExplicitList(readField(fields, ["Milestones Planned", "Planned"]))]
        ]
      },
      {
        title: "Competitive Advantage",
        icon: "advantage",
        body: [
          ...splitParagraphs(readField(fields, ["Competitive Advantage Intro", "Value Proposition Intro"])),
          ...withLabel("Competitive advantage", readField(fields, ["Competitive Advantage", "Competitive Adventage"])),
          ...withLabel("Value proposition", readField(fields, ["Value Proposition"])),
          ...withLabel("Tackling", readField(fields, ["Tackling"]))
        ],
        bullets: splitExplicitList(readField(fields, ["Competitive Advantage Bullets"])
          || readField(fields, ["Value Proposition Bullets"]))
      }
    ],
    supportNeed: {
      label: readField(fields, ["Support Need Label"]) || "Support Need",
      value: readField(fields, ["Support Needed", "Support Need"]) || ""
    },
    incubatorLogo: readAttachmentUrl(fields, ["Incubator Logo"]) || "vhpi-logo.jpg"
  };
}

function readField(fields, names) {
  for (const name of names) {
    const value = readRawField(fields, [name]);
    if (value !== undefined && value !== null && value !== "") return normalizeFieldValue(value);
  }
  return "";
}

function readRawField(fields, names) {
  for (const name of names) {
    const value = fields[name];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function normalizeFieldValue(value) {
  if (!Array.isArray(value)) return value;
  if (value[0]?.url) return value;
  if (value.every((item) => typeof item === "string" || typeof item === "number")) {
    return [...new Set(value.map(String))].join(", ");
  }
  if (value.every((item) => item && typeof item === "object" && "name" in item)) {
    return value.map((item) => item.name).join(", ");
  }
  return value;
}

function resolveFounders(value, foundersById) {
  if (!Array.isArray(value)) return [];

  return value
    .map((id) => {
      const fields = foundersById.get(id);
      if (!fields) return null;
      const name = readField(fields, ["Name"]);
      if (!name) return null;
      const linkedin = readField(fields, ["LinkedIn", "Linkedin", "Linkedin Profile"]);
      return [name, "Founder", [], linkedin];
    })
    .filter(Boolean);
}

function resolveContacts(value, contactsById) {
  if (!Array.isArray(value)) return [];

  return value.flatMap((id) => {
    const fields = contactsById.get(id);
    if (!fields) return [];
    return compactRows([
      ["Contact person", readField(fields, ["Name"])],
      ["Role", readField(fields, ["Role"])],
      ["Email", readField(fields, ["Email"])]
    ]);
  });
}

function readAttachmentUrl(fields, names) {
  const value = readField(fields, names);
  if (Array.isArray(value) && value[0]?.url) return value[0].url;
  if (typeof value === "string") return value;
  return "";
}

function splitParagraphs(value) {
  return String(value || "")
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitList(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value || "")
    .split(/\n|;/)
    .map((item) => item.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
}

function splitExplicitList(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value || "")
    .split(/\n+/)
    .map((item) => item.trim())
    .filter((item) => /^([-*•]\s+|\d+[.)]\s+)/.test(item))
    .map((item) => item.replace(/^([-*•]\s+|\d+[.)]\s+)/, "").trim())
    .filter(Boolean);
}

function splitTextUnlessExplicitList(value) {
  return splitExplicitList(value).length ? [] : splitParagraphs(value);
}

function parseLabeledRows(value) {
  return splitList(value).map((line) => {
    const match = line.match(/^([^:–-]{2,40})[:–-]\s*(.+)$/);
    if (match) return [match[1].trim(), match[2].trim()];
    return ["", line];
  });
}

function parsePeople(value) {
  if (Array.isArray(value)) return value.map(String).map((name) => [name, "", []]);

  return String(value || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = "", role = "", details = "", link = ""] = line.split("|").map((part) => part.trim());
      return [name, role, splitExplicitList(details), link];
    });
}

function withLabel(label, value) {
  const paragraphs = splitParagraphs(value);
  if (!paragraphs.length) return [];
  const [first, ...rest] = paragraphs;
  return [`<strong>${label}:</strong> ${first}`, ...rest];
}

function compactRows(rows) {
  return rows.filter(([, value]) => value !== undefined && value !== null && value !== "");
}

function stripSlug(startup) {
  const { slug, ...rest } = startup;
  return rest;
}

function slugify(value) {
  return String(value || "startup")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function initials(value) {
  return String(value || "SN")
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

async function readCurrentStartups() {
  const source = await readFile(join(publicDir, "data.js"), "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context);
  return context.window.STARTUPS || {};
}

async function writeDataFile(data) {
  const body = `window.STARTUPS = ${JSON.stringify(data, null, 2)};\n`;
  await writeFile(join(publicDir, "data.js"), body);
}

async function syncRootStaticFiles(data) {
  await writeStaticSite(rootDir, data);
}

async function syncDistFiles(data) {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  await writeStaticSite(distDir, data);
}

async function writeStaticSite(targetDir, data) {
  await copyFile(join(publicDir, "index.html"), join(targetDir, "index.html"));
  await copyFile(join(publicDir, "index.html"), join(targetDir, "404.html"));
  await copyFile(join(publicDir, "styles.css"), join(targetDir, "styles.css"));
  await copyFile(join(publicDir, "data.js"), join(targetDir, "data.js"));
  await copyFile(join(publicDir, "vhpi-logo.jpg"), join(targetDir, "vhpi-logo.jpg"));

  for (const slug of Object.keys(data)) routeSlugs.add(slug);

  for (const slug of routeSlugs) {
    const route = join(targetDir, slug);
    const printRoute = join(route, "print");
    await mkdir(printRoute, { recursive: true });
    await copyFile(join(publicDir, "index.html"), join(route, "index.html"));
    await copyFile(join(publicDir, "index.html"), join(printRoute, "index.html"));
  }
}

async function writeIntakeSchema() {
  const schema = {
    fields: {
      "Startup Name": { min: 2, max: 35 },
      Tagline: { min: 40, max: 120 },
      Problem: { min: 450, max: 750 },
      "Solution Intro": { min: 20, max: 120 },
      "Solution Bullets": { minItems: 2, maxItems: 4 },
      "Solution After": { min: 180, max: 420 },
      "Core Team": { format: "Name | Role | bullet 1; bullet 2", minItems: 1, maxItems: 5 },
      "Market Opportunity": { minItems: 2, maxItems: 4 },
      Competitors: { minItems: 2, maxItems: 4 },
      "Business Model": { min: 300, max: 600 },
      "Milestones Reached": { minItems: 3, maxItems: 7 },
      "Milestones Planned": { minItems: 2, maxItems: 5 },
      "Competitive Advantage": { minItems: 3, maxItems: 5 },
      "Support Need": { min: 20, max: 90 }
    }
  };

  await writeFile(join(rootDir, "airtable-intake-schema.json"), `${JSON.stringify(schema, null, 2)}\n`);
}

function loadEnvFile(filename) {
  const path = join(rootDir, filename);
  if (!existsSync(path)) return;
  const lines = readFileSyncSafe(path).split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

function readFileSyncSafe(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}
