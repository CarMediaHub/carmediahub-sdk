import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => { try { return JSON.parse(fs.readFileSync(path.join(p, "package.json"), "utf8")); } catch { return {}; } };
const list = () => process.platform === "win32" ? execFileSync("cmd.exe", ["/d", "/s", "/c", "pnpm list --json --prod --depth Infinity"], { cwd: root, encoding: "utf8" }) : execFileSync("pnpm", ["list", "--json", "--prod", "--depth", "Infinity"], { cwd: root, encoding: "utf8" });
const purl = (name, version) => `pkg:npm/${name.startsWith("@") ? name.replace("/", "%2F") : name}@${encodeURIComponent(version)}`;
function collect(node, result, rootName) { const name = node?.name ?? node?.from; if (name && name !== rootName) { const version = node.version?.startsWith("file:") ? read(node.path).version ?? "0.0.0-local" : node.version ?? "0.0.0-local"; const ref = purl(name, version); result.set(ref, { type: "library", name, version, "bom-ref": ref, purl: ref }); } for (const child of Object.values(node?.dependencies ?? {})) collect(child, result, rootName); }
export function generateSbom(output = path.join(root, "sbom", "cyclonedx.json")) { const pkg = read(root); const result = new Map(); for (const node of JSON.parse(list())) collect(node, result, pkg.name); const bom = { "$schema": "http://cyclonedx.org/schema/bom-1.5.schema.json", bomFormat: "CycloneDX", specVersion: "1.5", version: 1, metadata: { component: { type: "application", name: pkg.name, version: pkg.version } }, components: [...result.values()].sort((a, b) => a.purl.localeCompare(b.purl)) }; fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, `${JSON.stringify(bom, null, 2)}\n`, "utf8"); return bom; }
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { const output = process.argv.slice(2).find((v) => v !== "--") ?? path.join(root, "sbom", "cyclonedx.json"); console.log(JSON.stringify({ output, components: generateSbom(path.resolve(output)).components.length })); }
