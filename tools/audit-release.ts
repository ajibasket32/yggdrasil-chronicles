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
    const scriptReferences = [...index.matchAll(/(?:src|href)="(\/assets\/[^"?]+(?:\.js|\.css))"/g)].map((match) => match[1]);
    if (scriptReferences.length === 0 || scriptReferences.some((asset) => asset === undefined || !existsSync(join(releaseDirectory, asset.replace(/^\//, ""))))) {
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

  const catalog = join(projectRoot, "ASSETS.md");
  const packagedCatalog = join(releaseDirectory, "ASSETS.md");
  const kenneyLicense = join(releaseDirectory, "assets", "vendor", "kenney-rpg-audio", "License.txt");
  if (!existsSync(packagedCatalog) || hash(catalog) !== hash(packagedCatalog) || !existsSync(kenneyLicense)) {
    issues.push({ code: "release-license-missing", message: "Release package is missing matching ASSETS.md attribution or Kenney License.txt." });
  }

  const expectedVendorFiles = new Set([
    ...runtimeAssetReferences.map((reference) => reference.replace(/^\/assets\/vendor\//, "")),
    "kenney-rpg-audio/License.txt"
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
