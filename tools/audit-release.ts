import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { findRuntimeAssetReferences } from "./audit-assets";

export interface ReleaseAuditIssue {
  code: "release-missing-file" | "release-unexpected-vendor-file" | "release-license-missing" | "release-budget-exceeded" | "release-index-invalid";
  message: string;
}

export interface ReleaseAuditReport {
  valid: boolean;
  runtimeAssetCount: number;
  totalBytes: number;
  gzipBytes: number;
  issues: ReleaseAuditIssue[];
}

const applicationGzipBudget = 260_000;
const phaserGzipBudget = 450_000;
const totalGzipBudget = 800_000;

function walkFiles(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

const NEWLINE = /\r?\n/;

function relativePath(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

function hash(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function isReleaseAsset(path: string): boolean {
  return [".png", ".ogg"].includes(extname(path).toLowerCase());
}

export function auditReleasePackage(
  projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url))),
  releaseDirectory = resolve(projectRoot, "dist")
): ReleaseAuditReport {
  const issues: ReleaseAuditIssue[] = [];
  const runtimeAssetReferences = findRuntimeAssetReferences(projectRoot);
  const indexPath = join(releaseDirectory, "index.html");
  const releaseFiles = walkFiles(releaseDirectory);

  if (!existsSync(indexPath)) {
    issues.push({ code: "release-missing-file", message: "Production index.html is missing; run npm run build first." });
  } else {
    const index = readFileSync(indexPath, "utf8");
    // Accepts "./assets/..." as well as "/assets/...": the build is emitted with
    // a relative base so it runs from a subdirectory, and a check that only knew
    // the root-absolute form reported a perfectly good package as broken.
    const scriptReferences = [...index.matchAll(/(?:src|href)="(\.?\/assets\/[^"?]+(?:\.js|\.css))"/g)]
      .map((match) => match[1]);
    if (scriptReferences.length === 0 || scriptReferences.some((asset) => asset === undefined || !existsSync(join(releaseDirectory, asset.replace(/^\.?\//, ""))))) {
      issues.push({ code: "release-index-invalid", message: "Production index.html does not resolve every bundled script and stylesheet." });
    }
  }

  for (const reference of runtimeAssetReferences) {
    const source = join(projectRoot, "public", reference.replace(/^\//, ""));
    const packaged = join(releaseDirectory, reference.replace(/^\//, ""));
    if (!existsSync(packaged)) {
      issues.push({ code: "release-missing-file", message: `Runtime asset is missing from release: ${reference}` });
    } else if (hash(source) !== hash(packaged)) {
      issues.push({ code: "release-missing-file", message: `Runtime asset checksum changed during packaging: ${reference}` });
    }
  }

  // Every asset path the shipped JavaScript actually names must exist in the
  // release.
  //
  // The other direction was already covered — nothing unexpected ships, and
  // each declared asset survives packaging — but both of those start from the
  // declared list. Discovery of that list is a regex over source, so a
  // reference written in a shape the regex does not match was simply never
  // declared, pruned out of dist, and shipped as a 404 with every gate green.
  // Reading the emitted bundle instead of the source closes that: by then the
  // path is a plain literal whatever the source looked like.
  for (const file of releaseFiles.filter((path) => extname(path) === ".js" || extname(path) === ".css")) {
    const contents = readFileSync(file, "utf8");
    for (const match of contents.matchAll(/["'`(](\/assets\/[A-Za-z0-9_\-./]+\.[A-Za-z0-9]{2,4})["'`)]/g)) {
      const reference = match[1];
      if (reference === undefined || /\.(js|css|map)$/.test(reference)) continue;
      if (!existsSync(join(releaseDirectory, reference.replace(/^\//, "")))) {
        issues.push({
          code: "release-missing-file",
          message: `Shipped JavaScript references an asset that is not in the release: ${reference} (from ${basename(file)}).`
        });
      }
    }
  }

  // The build publishes an attribution file derived from ASSETS.md's catalogue
  // table rather than a byte copy of the whole document: the table is what the
  // CC0 licences ask travel with the work, while the rest of ASSETS.md is an
  // internal decision record that used to be served at a guessable public URL.
  //
  // So this checks the obligation rather than the bytes: every source row must
  // be present in what ships, and nothing else may be.
  const packagedCatalog = join(releaseDirectory, "ASSETS.md");
  if (!existsSync(packagedCatalog)) {
    issues.push({ code: "release-license-missing", message: "Release package is missing ASSETS.md attribution." });
  } else {
    const sourceRows = readFileSync(join(projectRoot, "ASSETS.md"), "utf8")
      .split(NEWLINE)
      .filter((line) => line.startsWith("|"));
    const packaged = readFileSync(packagedCatalog, "utf8");
    // Rows that exist in source must survive packaging. A catalogue with no
    // rows at all is not a failure — it is simply nothing to carry, and
    // treating it as one made an empty catalogue report "missing 0 rows".
    const missing = sourceRows.filter((row) => !packaged.includes(row));
    if (missing.length > 0) {
      issues.push({
        code: "release-license-missing",
        message: `Release attribution is missing ${missing.length} catalogue row(s).`
      });
    }
    // A heading beyond the table means prose came with it.
    const strayHeadings = packaged.split(NEWLINE)
      .filter((line) => line.startsWith("## "));
    if (strayHeadings.length > 0) {
      issues.push({
        code: "release-unexpected-vendor-file",
        message: `Release attribution carries internal prose: ${strayHeadings[0]}`
      });
    }
  }

  // Derived from what actually ships, not from one pack's name. Naming a single
  // License.txt meant a second attribution-required pack could be pruned out of
  // the release with every gate still green — and because the file was then
  // absent from dist it could not trip the unexpected-file check either.
  //
  // The rule is that a notice present in source must survive packaging. A pack
  // with no notice of its own is not a failure: a CC0 pack carries its evidence
  // in ASSETS.md, which audit-assets validates and which ships beside it.
  const licenceFiles = new Set<string>();
  const shippingPacks = new Set(
    runtimeAssetReferences
      .map((reference) => /^\/assets\/vendor\/([^/]+)\//.exec(reference)?.[1])
      .filter((pack): pack is string => pack !== undefined)
  );
  for (const pack of shippingPacks) {
    const sourceDirectory = join(projectRoot, "public", "assets", "vendor", pack);
    if (!existsSync(sourceDirectory)) continue;
    const notices = readdirSync(sourceDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^(license|copying|notice)(\.|$)/i.test(entry.name))
      .map((entry) => entry.name);
    for (const notice of notices) {
      licenceFiles.add(`${pack}/${notice}`);
      const packaged = join(releaseDirectory, "assets", "vendor", pack, notice);
      if (!existsSync(packaged) || hash(join(sourceDirectory, notice)) !== hash(packaged)) {
        issues.push({
          code: "release-license-missing",
          message: `Release package is missing '${pack}/${notice}', which ships with that pack.`
        });
      }
    }
  }

  const expectedVendorFiles = new Set([
    ...runtimeAssetReferences.map((reference) => reference.replace(/^\/assets\/vendor\//, "")),
    ...licenceFiles
  ]);
  for (const file of releaseFiles.filter((path) => isReleaseAsset(path) || relativePath(releaseDirectory, path).startsWith("assets/vendor/"))) {
    const path = relativePath(releaseDirectory, file);
    if (!path.startsWith("assets/vendor/")) {
      continue;
    }
    const vendorPath = path.replace(/^assets\/vendor\//, "");
    if (!expectedVendorFiles.has(vendorPath)) {
      issues.push({ code: "release-unexpected-vendor-file", message: `Unused vendor artifact shipped in release: ${path}` });
    }
  }

  const totalBytes = releaseFiles.reduce((total, path) => total + statSync(path).size, 0);
  const javascriptFiles = releaseFiles.filter((path) => extname(path) === ".js");
  const gzipSizes = javascriptFiles.map((path) => ({ path, bytes: gzipSync(readFileSync(path)).byteLength }));
  const applicationBytes = gzipSizes.filter(({ path }) => !basename(path).startsWith("phaser-")).reduce((total, item) => total + item.bytes, 0);
  const phaserBytes = gzipSizes.filter(({ path }) => basename(path).startsWith("phaser-")).reduce((total, item) => total + item.bytes, 0);
  const gzipBytes = gzipSizes.reduce((total, item) => total + item.bytes, 0);
  if (applicationBytes > applicationGzipBudget) {
    issues.push({ code: "release-budget-exceeded", message: `Application JavaScript gzip budget exceeded: ${applicationBytes} > ${applicationGzipBudget} bytes.` });
  }
  if (phaserBytes > phaserGzipBudget) {
    issues.push({ code: "release-budget-exceeded", message: `Phaser JavaScript gzip budget exceeded: ${phaserBytes} > ${phaserGzipBudget} bytes.` });
  }
  if (gzipBytes > totalGzipBudget) {
    issues.push({ code: "release-budget-exceeded", message: `Total JavaScript gzip budget exceeded: ${gzipBytes} > ${totalGzipBudget} bytes.` });
  }

  return { valid: issues.length === 0, runtimeAssetCount: runtimeAssetReferences.length, totalBytes, gzipBytes, issues };
}

function runCli(): void {
  const result = auditReleasePackage();
  console.log(`Audited production package: ${result.runtimeAssetCount} runtime assets, ${result.totalBytes} bytes on disk, ${result.gzipBytes} gzipped JavaScript bytes.`);
  for (const issue of result.issues) {
    console.error(`error [${issue.code}]: ${issue.message}`);
  }
  if (!result.valid) {
    process.exitCode = 1;
  } else {
    console.log("Production package audit passed: runtime assets, attribution evidence, and size budgets are valid.");
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runCli();
}
