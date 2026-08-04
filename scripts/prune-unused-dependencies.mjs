import fs from "node:fs";

const unusedRuntimeDependencies = [
  "@radix-ui/react-avatar",
  "@radix-ui/react-dialog",
  "@radix-ui/react-dropdown-menu",
  "@radix-ui/react-popover",
  "@radix-ui/react-progress",
  "@radix-ui/react-select",
  "@radix-ui/react-separator",
  "@radix-ui/react-switch",
  "@radix-ui/react-tabs",
  "@radix-ui/react-tooltip",
  "date-fns",
  "dotenv",
  "framer-motion",
  "next-themes",
];

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const packageLock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));

for (const dependency of unusedRuntimeDependencies) {
  delete packageJson.dependencies?.[dependency];
  delete packageLock.packages?.[""]?.dependencies?.[dependency];
}

const packages = packageLock.packages ?? {};
const reachable = new Set([""]);
const queue = [""];

function resolveDependency(from, name) {
  let directory = from;
  while (true) {
    const candidate = directory
      ? `${directory}/node_modules/${name}`
      : `node_modules/${name}`;
    if (packages[candidate]) return candidate;
    if (!directory) return null;
    const nestedIndex = directory.lastIndexOf("/node_modules/");
    if (nestedIndex >= 0) directory = directory.slice(0, nestedIndex);
    else if (directory.startsWith("node_modules/")) directory = "";
    else directory = "";
  }
}

while (queue.length) {
  const current = queue.shift();
  const metadata = packages[current] ?? {};
  const dependencyNames = new Set([
    ...Object.keys(metadata.dependencies ?? {}),
    ...(current === "" ? Object.keys(metadata.devDependencies ?? {}) : []),
    ...Object.keys(metadata.optionalDependencies ?? {}),
    ...Object.keys(metadata.peerDependencies ?? {}),
  ]);
  for (const name of dependencyNames) {
    const resolved = resolveDependency(current, name);
    if (resolved && !reachable.has(resolved)) {
      reachable.add(resolved);
      queue.push(resolved);
    }
  }
}

for (const packagePath of Object.keys(packages)) {
  if (!reachable.has(packagePath)) delete packages[packagePath];
}

fs.writeFileSync("package.json", `${JSON.stringify(packageJson, null, 2)}\n`);
fs.writeFileSync("package-lock.json", `${JSON.stringify(packageLock, null, 2)}\n`);
console.log(JSON.stringify({ removed: unusedRuntimeDependencies, retainedPackages: Object.keys(packages).length }, null, 2));
