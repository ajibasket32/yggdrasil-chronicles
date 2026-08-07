import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export interface AssetCatalogEntry {
  purpose: string;
  source: string;
  author: string;
  license: string;
  localPath: string;
  checksum: string;
  modification: string;
}

export interface AssetAuditIssue {
  code:
    | "asset-missing"
    | "asset-checksum-mismatch"
    | "asset-directory-empty"
    | "asset-archive-missing"
    | "asset-license-evidence-missing"
    | "asset-catalog-invalid"
    | "runtime-asset-missing"
    | "runtime-asset-uncatalogued"
    | "runtime-external-url";
  message: string;
}

export interface AssetAuditReport {
  valid: boolean;
  catalog: AssetCatalogEntry[];
  runtimeAssetReferences: string[];
  issues: AssetAuditIssue[];
}

const tableDivider = /^\|\s*-{3,}/;
const runtimeExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".css", ".html"]);

function cleanCell(value: string): string {
  return value.trim().replace(/^Archive:\s*/i, "").replace(/^`|`$/g, "");
}

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function parseAssetCatalog(markdown: string): AssetCatalogEntry[] {
  const lines = markdown.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.includes("| Purpose | Source | Author | License | Local path | SHA-256 | Modification |"));
  if (headerIndex === -1 || !tableDivider.test(lines[headerIndex + 1] ?? "")) {
    return [];
  }

  const entries: AssetCatalogEntry[] = [];
  for (let index = headerIndex + 2; index < lines.length; index += 1) {
    const row = lines[index];
    if (!row || !row.trim().startsWith("|")) {
      break;
    }
    const values = cells(row);
    if (values.length !== 7) {
      continue;
    }
    const [purpose, source, author, license, localPath, checksum, modification] = values as [
      string,
      string,
      string,
      string,
      string,
      string,
      string
    ];
    entries.push({
      purpose: cleanCell(purpose),
      source: cleanCell(source),
      author: cleanCell(author),
      license: cleanCell(license),
      localPath: cleanCell(localPath).replace(/\/$/, ""),
      checksum: cleanCell(checksum),
      modification: cleanCell(modification)
    });
  }
  return entries;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function walkFiles(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function repoPath(rootDir: string, path: string): string {
  return relative(rootDir, path).split(sep).join("/");
}

function hasLicenseEvidence(markdown: string, entry: AssetCatalogEntry): boolean {
  const evidenceSection = markdown.split(/^## Verified license evidence\s*$/im)[1] ?? "";
  const assetName = basename(entry.localPath);
  return new RegExp(`\\\`${assetName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\\`[\\s\\S]{0,500}CC0`, "i").test(evidenceSection);
}

function findArchivePath(rootDir: string, directory: string): string | undefined {
  const vendorDirectory = join(rootDir, "public", "assets", "vendor");
  let candidate = directory;
  while (isWithin(candidate, vendorDirectory)) {
    const archive = `${candidate}.zip`;
    if (existsSync(archive)) {
      return archive;
    }
    if (normalize(candidate) === normalize(vendorDirectory)) {
      break;
    }
    candidate = join(candidate, "..");
  }
  return undefined;
}

function hasExtractedLicense(directory: string, rootDir: string): boolean {
  const vendorDirectory = join(rootDir, "public", "assets", "vendor");
  let candidate = directory;
  while (isWithin(candidate, vendorDirectory)) {
    // Stop *before* inspecting the shared vendor root. `walkFiles` recurses, so
    // listing that directory returns every pack's files at once — one pack's
    // License.txt then satisfied this check for every other pack, and the
    // check could not fail for any input. A pack's licence has to be its own.
    if (normalize(candidate) === normalize(vendorDirectory)) {
      break;
    }
    if (walkFiles(candidate).some((path) => /^(license|copying|notice)(\.|$)/i.test(basename(path)))) {
      return true;
    }
    candidate = join(candidate, "..");
  }
  return false;
}

function sourceFiles(rootDir: string): string[] {
  const roots = [join(rootDir, "src"), join(rootDir, "public")];
  const files = roots.flatMap(walkFiles);
  const index = join(rootDir, "index.html");
  if (existsSync(index)) {
    files.push(index);
  }
  return files.filter((path) => runtimeExtensions.has(extname(path).toLowerCase())).sort();
}

function scanRuntimeText(rootDir: string): Array<{ path: string; contents: string }> {
  return sourceFiles(rootDir).map((path) => ({ path, contents: readFileSync(path, "utf8") }));
}

export function findRuntimeAssetReferences(rootDir: string): string[] {
  const references = new Set<string>();
  for (const { contents } of scanRuntimeText(rootDir)) {
    const baseValues = new Map<string, string>();
    for (const match of contents.matchAll(/\b(?:const|let)\s+(\w+)\s*=\s*["'](\/assets\/[^"']+)["']/g)) {
      const [, identifier, value] = match;
      if (identifier && value) {
        baseValues.set(identifier, value.replace(/\/$/, ""));
      }
    }
    for (const match of contents.matchAll(/["'](\/assets\/[^"']+)["']/g)) {
      const value = match[1];
      if (value && extname(value) !== "") {
        references.add(value);
      }
    }
    for (const match of contents.matchAll(/`\$\{(\w+)\}\/([^`]+)`/g)) {
      const [, identifier, remainder] = match;
      const base = identifier ? baseValues.get(identifier) : undefined;
      if (base && remainder) {
        references.add(`${base}/${remainder}`);
      }
    }
  }
  return [...references].sort();
}

export function findRuntimeExternalUrls(rootDir: string): AssetAuditIssue[] {
  const issues: AssetAuditIssue[] = [];
  for (const { path, contents } of scanRuntimeText(rootDir)) {
    for (const match of contents.matchAll(/https?:\/\/[^\s"'`<>]+/g)) {
      issues.push({
        code: "runtime-external-url",
        message: `${repoPath(rootDir, path)} contains a runtime external URL: ${match[0]}`
      });
    }
  }
  return issues;
}

function isWithin(path: string, parent: string): boolean {
  const normalizedPath = normalize(path);
  const normalizedParent = normalize(parent);
  return normalizedPath === normalizedParent || normalizedPath.startsWith(`${normalizedParent}${sep}`);
}

export function auditAssets(rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)))): AssetAuditReport {
  const issues: AssetAuditIssue[] = [];
  const catalogPath = join(rootDir, "ASSETS.md");
  const markdown = existsSync(catalogPath) ? readFileSync(catalogPath, "utf8") : "";
  const catalog = parseAssetCatalog(markdown);
  const runtimeAssetReferences = findRuntimeAssetReferences(rootDir);

  if (catalog.length === 0) {
    issues.push({ code: "asset-catalog-invalid", message: "ASSETS.md does not contain a readable asset catalog table." });
  }

  for (const entry of catalog) {
    if (!entry.source.startsWith("http") || !entry.license || !entry.author || !entry.checksum) {
      issues.push({ code: "asset-catalog-invalid", message: `Catalog entry '${entry.purpose}' is missing source, author, license, or checksum.` });
      continue;
    }
    const localPath = join(rootDir, entry.localPath);
    if (!existsSync(localPath)) {
      issues.push({ code: "asset-missing", message: `Catalog asset '${entry.purpose}' is missing: ${entry.localPath}` });
      continue;
    }

    if (statSync(localPath).isDirectory()) {
      if (walkFiles(localPath).length === 0) {
        issues.push({ code: "asset-directory-empty", message: `Catalog directory '${entry.localPath}' has no extracted files.` });
      }
      const archivePath = findArchivePath(rootDir, localPath);
      if (!archivePath) {
        issues.push({ code: "asset-archive-missing", message: `Catalog directory '${entry.localPath}' requires a matching vendor archive.` });
      } else if (sha256(archivePath) !== entry.checksum.toLowerCase()) {
        issues.push({ code: "asset-checksum-mismatch", message: `Archive checksum differs for '${repoPath(rootDir, archivePath)}'.` });
      }

      const localLicense = hasExtractedLicense(localPath, rootDir);
      if (!localLicense && !hasLicenseEvidence(markdown, entry)) {
        issues.push({ code: "asset-license-evidence-missing", message: `Extracted pack '${entry.localPath}' has no local license file or verified ASSETS.md evidence.` });
      }
    } else if (sha256(localPath) !== entry.checksum.toLowerCase()) {
      issues.push({ code: "asset-checksum-mismatch", message: `Checksum differs for '${entry.localPath}'.` });
    }
  }

  for (const reference of runtimeAssetReferences) {
    const localPath = join(rootDir, "public", reference.replace(/^\//, ""));
    if (!existsSync(localPath)) {
      issues.push({ code: "runtime-asset-missing", message: `Runtime asset reference is missing: ${reference}` });
      continue;
    }
    const covered = catalog.some((entry) => isWithin(localPath, join(rootDir, entry.localPath)));
    if (!covered) {
      issues.push({ code: "runtime-asset-uncatalogued", message: `Runtime asset reference is not covered by ASSETS.md: ${reference}` });
    }
  }

  issues.push(...findRuntimeExternalUrls(rootDir));
  return { valid: issues.length === 0, catalog, runtimeAssetReferences, issues };
}

function runCli(): void {
  const result = auditAssets();
  console.log(`Audited ${result.catalog.length} catalog entries and ${result.runtimeAssetReferences.length} runtime asset references.`);
  for (const issue of result.issues) {
    console.error(`error [${issue.code}]: ${issue.message}`);
  }
  if (!result.valid) {
    process.exitCode = 1;
  } else {
    console.log("Asset audit passed: local files, checksums, extracted-pack evidence, and runtime URL policy are valid.");
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runCli();
}
