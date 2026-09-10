// Prepare a product-only source archive from committed Git objects, never checkout files.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const files = [
  "CONSTITUTION.md", "CONTRIBUTING.md", "LICENSE", "README.md", "bun.lock",
  "docs/workspace-format.md", "package.json", "src/index.ts", "src/item-write.ts",
  "src/prepare-source.ts", "src/summary.ts", "src/summary-markdown.ts", "src/workspace.ts", "src/write-json.ts", "tsconfig.json",
].sort();
const git = (...args: string[]) => execFileSync("git", args, { maxBuffer: 32 * 1024 * 1024 });

try {
  const [sha, output, ...extra] = process.argv.slice(2);
  if (!sha || !/^[0-9a-f]{40}$/.test(sha) || !output || extra.length) {
    throw new Error("Usage: bun run src/prepare-source.ts <full 40-character commit SHA> <new output directory>");
  }
  if (git("cat-file", "-t", sha).toString().trim() !== "commit") throw new Error("Input must be a commit.");
  for (const file of files) {
    const entry = git("ls-tree", sha, "--", file).toString();
    if (!/^100644 blob [0-9a-f]{40}\t/.test(entry) || entry.split("\t")[1] !== `${file}\n`) {
      throw new Error(`Required product file must be a regular committed file: ${file}`);
    }
  }
  const metadata = JSON.parse(git("show", `${sha}:package.json`).toString());
  if (metadata.private !== true || !/^0\.1\.0-alpha\.[1-9][0-9]*$/.test(metadata.version)) {
    throw new Error("Expected private product with proposed 0.1.0-alpha.N version; revise policy explicitly for later versions.");
  }
  const bun = execFileSync("bun", ["--version"]).toString().trim();
  if (metadata.packageManager !== `bun@${bun}`) throw new Error("Use the exact committed packageManager Bun version.");
  const name = `evidence-desk-${metadata.version}-source`;
  const archive = `${name}.tar.gz`;
  // Commit timestamp and Git's normalized modes; gzip omits filename and timestamp.
  const tar = git("-c", "tar.umask=0022", "archive", "--format=tar", `--prefix=${name}/`, sha, "--", ...files);
  const inventory = execFileSync("tar", ["-tf", "-"], { input: tar }).toString().trim().split("\n");
  const leaves = inventory.filter(path => !path.endsWith("/")).sort();
  if (JSON.stringify(leaves) !== JSON.stringify(files.map(file => `${name}/${file}`).sort())) {
    throw new Error("Archive inventory differs from product allowlist (check committed archive attributes).");
  }
  const bytes = execFileSync("gzip", ["-n", "-9", "-c"], { input: tar, maxBuffer: 32 * 1024 * 1024 });
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const provenance = {
    product: metadata.name, version: metadata.version, sourceCommit: sha,
    sourceRepository: "https://github.com/open-autonomy-org/evidence-desk",
    archive, sha256: checksum, inventory,
    toolchain: { bun, git: git("--version").toString().trim(), gzip: execFileSync("gzip", ["--version"]).toString().split("\n")[0] },
  };
  const destination = resolve(output);
  mkdirSync(destination); // Refuse existing output: never replace prior review evidence.
  writeFileSync(join(destination, archive), bytes, { flag: "wx" });
  writeFileSync(join(destination, `${archive}.sha256`), `${checksum}  ${archive}\n`, { flag: "wx" });
  writeFileSync(join(destination, `${archive}.provenance.json`), JSON.stringify(provenance, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ output: destination, ...provenance }, null, 2));
} catch (error) {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
