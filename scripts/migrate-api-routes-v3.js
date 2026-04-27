/**
 * Re-runs API route migration from app/api → pages/api using text-substitution
 * (no body extraction). Overwrites previously broken files.
 * Run: node scripts/migrate-api-routes-v3.js
 */
const fs = require("fs");
const path = require("path");

const SRC_DIR = path.join(__dirname, "../src/app/api");
const DEST_DIR = path.join(__dirname, "../src/pages/api");

// Manually created — skip
const SKIP_REL = new Set([
  "auth/[...nextauth]/route.js",
  "activities/route.js",
  "activities/[id]/route.js",
]);

function getAllRouteFiles(dir, base = "") {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let results = [];
  for (const e of entries) {
    const relPath = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) {
      results = results.concat(getAllRouteFiles(path.join(dir, e.name), relPath));
    } else if (e.name === "route.js") {
      results.push({ srcFile: path.join(dir, e.name), relDir: base });
    }
  }
  return results;
}

function transform(src) {
  let code = src;

  // 1. Remove "use server" / "use client"
  code = code.replace(/^["']use (server|client)["'];\s*\n/gm, "");

  // 2. Remove NextResponse import, keep other imports from next/server
  code = code.replace(/import \{ NextResponse \} from ['"]next\/server['"];\s*\n?/g, "");
  code = code.replace(
    /import \{ ([^}]*) \} from ['"]next\/server['"];\s*\n?/g,
    (_, imports) => {
      const cleaned = imports.split(",").map(s => s.trim()).filter(s => s && s !== "NextResponse");
      if (!cleaned.length) return "";
      return `import { ${cleaned.join(", ")} } from "next/server";\n`;
    }
  );

  // 3. Remove next/headers imports
  code = code.replace(/import \{[^}]*\} from ['"]next\/headers['"];\s*\n?/g, "");

  // 4. Find exported HTTP methods and rename them
  const methods = [];
  const methodRe = /export\s+async\s+function\s+(GET|POST|PUT|DELETE|PATCH)\s*\(/g;
  let m;
  while ((m = methodRe.exec(code)) !== null) {
    methods.push(m[1]);
  }

  // Rename: export async function GET(...) → async function _GET(req, res)
  code = code.replace(
    /export\s+async\s+function\s+(GET|POST|PUT|DELETE|PATCH)\s*\([^)]*(?:\{[^}]*\})?\s*[^)]*\)/g,
    (match, method) => `async function _${method}(req, res)`
  );

  if (methods.length === 0) return { code, methods: [], changed: false };

  // 5. Body transformations

  // params destructuring
  code = code.replace(/const\s*\{([^}]+)\}\s*=\s*await\s+params\s*;/g, (_, v) => `const {${v}} = req.query;`);
  code = code.replace(/const\s*\{([^}]+)\}\s*=\s*params\s*;/g, (_, v) => `const {${v}} = req.query;`);

  // request.json()
  code = code.replace(/const\s+(\w+)\s*=\s*await\s+request\.json\s*\(\s*\)\s*;/g, (_, v) => `const ${v} = req.body;`);
  code = code.replace(/await\s+request\.json\s*\(\s*\)/g, "req.body");

  // request.formData()
  code = code.replace(/await\s+request\.formData\s*\(\s*\)/g, "req.body");

  // searchParams
  code = code.replace(
    /const\s+searchParams\s*=\s*request\.nextUrl\.searchParams\s*;/g,
    "const searchParams = new URLSearchParams(new URL(`http://l${req.url}`).search);"
  );
  code = code.replace(/request\.nextUrl\.searchParams\.get\s*\(\s*['"](\w+)['"]\s*\)/g, (_, k) => `(req.query.${k} ?? null)`);
  code = code.replace(/request\.nextUrl\.searchParams/g, "new URLSearchParams(new URL(`http://l${req.url}`).search)");

  // getClubContext() → getClubContext(req, res)
  code = code.replace(/\bgetClubContext\s*\(\s*\)/g, "getClubContext(req, res)");

  // cookies
  code = code.replace(/const\s+cookieStore\s*=\s*await\s+cookies\s*\(\s*\)\s*;/g, "const cookieStore = req.cookies;");
  code = code.replace(/cookieStore\.get\s*\(([^)]+)\)\?\.value/g, "cookieStore[$1]");

  // NextResponse.json with status
  code = code.replace(
    /return\s+NextResponse\.json\s*\(([^,]+?)\s*,\s*\{\s*status\s*:\s*(\d+)\s*\}\s*\)/g,
    (_, d, s) => `return res.status(${s}).json(${d})`
  );
  // NextResponse.json without status (multiline-safe with a simpler greedy match on inline)
  code = code.replace(/return\s+NextResponse\.json\s*\((\{[^}]+\}|[^,)]+)\)/g, (_, d) => `return res.status(200).json(${d})`);

  // Remaining NextResponse.json (non-return)
  code = code.replace(
    /NextResponse\.json\s*\(([^,]+?)\s*,\s*\{\s*status\s*:\s*(\d+)\s*\}\s*\)/g,
    (_, d, s) => `res.status(${s}).json(${d})`
  );
  code = code.replace(/NextResponse\.json\s*\(([^)]+)\)/g, (_, d) => `res.status(200).json(${d})`);

  // NextResponse.redirect / next
  code = code.replace(/return\s+NextResponse\.redirect\s*\(([^)]+)\)/g, (_, u) => `return res.redirect(302, ${u})`);
  code = code.replace(/return\s+NextResponse\.next\s*\(\s*\)/g, "return res.status(200).end()");

  // 6. Add dispatcher at the end
  let dispatcher;
  if (methods.length === 1) {
    dispatcher = `\nexport default async function handler(req, res) {\n  if (req.method !== "${methods[0]}") return res.status(405).json({ error: "Method not allowed" });\n  return _${methods[0]}(req, res);\n}\n`;
  } else {
    const branches = methods.map((method, i) =>
      `  ${i === 0 ? "if" : "} else if"} (req.method === "${method}") {\n    return _${method}(req, res);`
    ).join("\n");
    dispatcher = `\nexport default async function handler(req, res) {\n${branches}\n  } else {\n    return res.status(405).json({ error: "Method not allowed" });\n  }\n}\n`;
  }

  code = code.trimEnd() + dispatcher;

  return { code, methods, changed: true };
}

function main() {
  const files = getAllRouteFiles(SRC_DIR);
  console.log(`Found ${files.length} route files in app/api`);
  let converted = 0, skipped = 0, errors = 0;

  for (const { srcFile, relDir } of files) {
    try {
      // Construct the relative source path for SKIP check
      const srcRelative = relDir + "/route.js";
      if (SKIP_REL.has(srcRelative)) {
        console.log(`  SKIP (manual): ${relDir}`);
        skipped++;
        continue;
      }

      const parts = relDir.split("/");
      const destDir = path.join(DEST_DIR, ...parts);
      const destFile = path.join(destDir, "index.js");

      const srcCode = fs.readFileSync(srcFile, "utf8");
      const { code, methods, changed } = transform(srcCode);

      if (!changed) {
        console.log(`  WARN (no methods): ${relDir}`);
        skipped++;
        continue;
      }

      fs.mkdirSync(destDir, { recursive: true });
      fs.writeFileSync(destFile, code, "utf8");
      console.log(`  OK: ${relDir} [${methods.join(",")}]`);
      converted++;
    } catch (err) {
      console.error(`  ERROR: ${relDir}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\nDone: ${converted} converted, ${skipped} skipped, ${errors} errors`);
}

main();
