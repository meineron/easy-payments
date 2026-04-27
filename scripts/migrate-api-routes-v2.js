/**
 * Improved API route migration: rename HTTP method functions + add handler dispatcher.
 * Run: node scripts/migrate-api-routes-v2.js
 */
const fs = require("fs");
const path = require("path");

const DEST_DIR = path.join(__dirname, "../src/pages/api");

// These were manually written — skip entirely
const SKIP_FILES = new Set([
  path.join(DEST_DIR, "auth/[...nextauth].js"),
  path.join(DEST_DIR, "activities/index.js"),
  path.join(DEST_DIR, "activities/[id]/index.js"),
]);

function getAllJsFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) results.push(...getAllJsFiles(full));
    else if (e.name.endsWith(".js")) results.push(full);
  }
  return results;
}

function transform(src) {
  let code = src;

  // 1. Remove "use server"
  code = code.replace(/^["']use server["'];\s*\n/m, "");

  // 2. Remove NextResponse import
  code = code.replace(/import \{ NextResponse \} from ['"]next\/server['"];\s*\n?/g, "");
  code = code.replace(/import \{ (NextResponse, |, NextResponse)([^}]*)\} from ['"]next\/server['"];\s*\n?/g,
    (_, pre, rest) => `import { ${rest.trim()} } from "next/server";\n`);

  // 3. Remove next/headers imports  
  code = code.replace(/import \{[^}]*\} from ['"]next\/headers['"];\s*\n?/g, "");

  // 4. Rename exported HTTP method functions → private async functions + collect methods
  const methods = [];
  code = code.replace(
    /export\s+async\s+function\s+(GET|POST|PUT|DELETE|PATCH)\s*\(([^)]*)\)\s*\{/g,
    (match, method, args) => {
      methods.push(method);
      return `async function _${method}(req, res) {`;
    }
  );

  if (methods.length === 0) return { code, methods: [], changed: false };

  // 5. Body transformations

  // params destructuring: const { id } = await params; / const { id } = params;
  code = code.replace(/const\s*\{([^}]+)\}\s*=\s*await\s+params\s*;/g, (_, vars) => `const {${vars}} = req.query;`);
  code = code.replace(/const\s*\{([^}]+)\}\s*=\s*params\s*;/g, (_, vars) => `const {${vars}} = req.query;`);

  // request.json()
  code = code.replace(/const\s+(\w+)\s*=\s*await\s+request\.json\s*\(\s*\)\s*;/g, (_, v) => `const ${v} = req.body;`);
  code = code.replace(/await\s+request\.json\s*\(\s*\)/g, "req.body");

  // request.nextUrl.searchParams.get("key") → (req.query.key || null)
  code = code.replace(
    /(?:request\.nextUrl\.searchParams|searchParams)\.get\s*\(\s*['"](\w+)['"]\s*\)/g,
    (_, k) => `(req.query.${k} ?? null)`
  );
  code = code.replace(/request\.nextUrl\.searchParams/g, "new URLSearchParams(new URL(`http://l${req.url}`).search)");

  // getClubContext() → getClubContext(req, res)
  code = code.replace(/\bgetClubContext\s*\(\s*\)/g, "getClubContext(req, res)");

  // cookies
  code = code.replace(/const\s+cookieStore\s*=\s*await\s+cookies\s*\(\s*\)\s*;/g, "const cookieStore = req.cookies;");
  code = code.replace(/cookieStore\.get\s*\(([^)]+)\)\.value/g, "cookieStore[$1]");

  // NextResponse.json(data, { status: N })
  code = code.replace(
    /return\s+NextResponse\.json\s*\(([^,]+?)\s*,\s*\{\s*status\s*:\s*(\d+)\s*\}\s*\)/g,
    (_, data, status) => `return res.status(${status}).json(${data})`
  );
  // NextResponse.json(data) — catch remaining (no status arg)
  code = code.replace(/return\s+NextResponse\.json\s*\(([^)]+)\)/g, (_, data) => `return res.status(200).json(${data})`);
  
  // Non-return NextResponse.json with status
  code = code.replace(
    /NextResponse\.json\s*\(([^,]+?)\s*,\s*\{\s*status\s*:\s*(\d+)\s*\}\s*\)/g,
    (_, data, status) => `res.status(${status}).json(${data})`
  );
  code = code.replace(/NextResponse\.json\s*\(([^)]+)\)/g, (_, data) => `res.status(200).json(${data})`);

  // NextResponse.redirect
  code = code.replace(/return\s+NextResponse\.redirect\s*\(([^)]+)\)/g, (_, url) => `return res.redirect(302, ${url})`);
  code = code.replace(/return\s+NextResponse\.next\s*\(\s*\)/g, "return res.status(200).end()");

  // 6. Add handler dispatcher at the end
  let dispatcher;
  if (methods.length === 1) {
    dispatcher = `\nexport default async function handler(req, res) {\n  if (req.method !== "${methods[0]}") return res.status(405).json({ error: "Method not allowed" });\n  return _${methods[0]}(req, res);\n}\n`;
  } else {
    const branches = methods.map((m, i) =>
      `  ${i === 0 ? "if" : "} else if"} (req.method === "${m}") {\n    return _${m}(req, res);`
    ).join("\n");
    dispatcher = `\nexport default async function handler(req, res) {\n${branches}\n  } else {\n    return res.status(405).json({ error: "Method not allowed" });\n  }\n}\n`;
  }

  code = code.trimEnd() + dispatcher;

  return { code, methods, changed: true };
}

function main() {
  const files = getAllJsFiles(DEST_DIR);
  console.log(`Processing ${files.length} files in pages/api/...`);
  let modified = 0, skipped = 0;

  for (const file of files) {
    if (SKIP_FILES.has(file)) {
      skipped++;
      continue;
    }

    const src = fs.readFileSync(file, "utf8");
    
    // Skip if already has `export default async function handler`
    if (src.includes("export default async function handler") || src.includes("export default function handler")) {
      skipped++;
      continue;
    }

    const { code, methods, changed } = transform(src);
    if (!changed) {
      console.log(`  WARN (no methods): ${path.relative(DEST_DIR, file)}`);
      skipped++;
      continue;
    }

    fs.writeFileSync(file, code, "utf8");
    console.log(`  OK: ${path.relative(DEST_DIR, file)} (${methods.join(",")})`);
    modified++;
  }

  console.log(`\nDone: ${modified} modified, ${skipped} skipped`);
}

main();
