#!/usr/bin/env node
/**
 * task:new — creates a new task under vaults/tasks/ with the next FS-NNNN number.
 *
 * Usage:  pnpm task:new "Task name"
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const tasksDir = path.join(repoRoot, "vaults", "tasks");
const templatePath = path.join(tasksDir, "_template", "task.md");

const rawTitle = process.argv.slice(2).join(" ").trim();

if (!rawTitle) {
  console.error('Usage: pnpm task:new "<task title>"');
  process.exit(1);
}

const slug = rawTitle
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 60)
  .replace(/-+$/g, "");

if (!slug) {
  console.error("❌ The title does not produce a valid slug.");
  process.exit(1);
}

const numbers = readdirSync(tasksDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => /^FS-(\d{4})-/.exec(entry.name))
  .filter(Boolean)
  .map((match) => Number(match[1]));

const id = `FS-${String((numbers.length ? Math.max(...numbers) : 0) + 1).padStart(4, "0")}`;
const folderName = `${id}-${slug}`;
const folderPath = path.join(tasksDir, folderName);

if (existsSync(folderPath)) {
  console.error(`❌ Already exists: vaults/tasks/${folderName}`);
  process.exit(1);
}

if (!existsSync(templatePath)) {
  console.error(`❌ Template not found: vaults/tasks/_template/task.md`);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const yamlTitle = `"${rawTitle.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

const content = readFileSync(templatePath, "utf8")
  .replaceAll("FS-NNNN", id)
  .replace("title: Título corto de la task", `title: ${yamlTitle}`)
  .replace(`# ${id} — Título corto`, `# ${id} — ${rawTitle}`)
  .replace("YYYY-MM-DD", today);

mkdirSync(path.join(folderPath, "phases"), { recursive: true });
writeFileSync(path.join(folderPath, "task.md"), content, "utf8");

console.log(`✅ Task created: vaults/tasks/${folderName}`);
console.log(`   • vaults/tasks/${folderName}/task.md`);
console.log(`   • vaults/tasks/${folderName}/phases/`);
console.log("");
console.log(
  "Next: complete task.md and run /plan to generate plan.md + phases.",
);
