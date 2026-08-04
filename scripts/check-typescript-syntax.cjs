const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const ROOT = process.cwd();
const IGNORED = new Set(["node_modules", ".next", ".git", "dist", "build", "out"]);
const extensions = new Set([".ts", ".tsx"]);

function walk(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (IGNORED.has(entry.name)) continue;
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(resolved, files);
    else if (extensions.has(path.extname(entry.name)) && !entry.name.endsWith(".d.ts")) files.push(resolved);
  }
  return files;
}

const files = walk(ROOT).sort();
const failures = [];
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const result = ts.transpileModule(source, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.Preserve,
      isolatedModules: true,
    },
  });
  for (const diagnostic of result.diagnostics ?? []) {
    if (diagnostic.category !== ts.DiagnosticCategory.Error) continue;
    const position = diagnostic.file && typeof diagnostic.start === "number"
      ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
      : null;
    failures.push({
      file: path.relative(ROOT, file),
      line: position ? position.line + 1 : null,
      column: position ? position.character + 1 : null,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    });
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    const location = failure.line ? `:${failure.line}:${failure.column}` : "";
    console.error(`${failure.file}${location} ${failure.message}`);
  }
  console.error(`TypeScript syntax validation failed: ${failures.length} error(s) across ${files.length} file(s).`);
  process.exit(1);
}

console.log(`TypeScript syntax validation passed: ${files.length} file(s), 0 syntax errors.`);
