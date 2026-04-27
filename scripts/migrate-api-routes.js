/**
 * Automated migration: Next.js App Router route.js → Pages Router handler
 *
 * Run: node scripts/migrate-api-routes.js
 */
const fs = require("fs");
const path = require("path");

const SRC_DIR = path.join(__dirname, "../src/app/api");
const DEST_DIR = path.join(__dirname, "../src/pages/api");

// Already migrated by hand — skip
const SKIP = [
  "auth/[...nextauth]",
  "activities/index",
  "activities/[id]/index",
];

function getAllRouteFiles(dir, base = "") {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results = [];
  for (const e of entries) {
    const relPath = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) {
      results.push(...getAllRouteFiles(path.join(dir, e.name), relPath));
    } else if (e.name === "route.js") {
      results.push({ srcFile: path.join(dir, e.name), relDir: base });
    }
  }
  return results;
}

function transformRoute(src) {
  let code = src;

  // Remove "use server" directive
  code = code.replace(/^"use server";\s*\n/m, "");
  code = code.replace(/^'use server';\s*\n/m, "");

  // Remove NextResponse import
  code = code.replace(/import \{ NextResponse \} from ['"]next\/server['"];\s*\n?/g, "");
  code = code.replace(/import \{ NextResponse, [^}]+ \} from ['"]next\/server['"];\s*\n?/g, (m) => {
    // Keep other named imports, remove NextResponse
    return m.replace("NextResponse, ", "").replace(", NextResponse", "");
  });

  // Remove cookies import from next/headers  
  code = code.replace(/import \{ cookies \} from ['"]next\/headers['"];\s*\n?/g, "");

  // Remove headers import from next/headers
  code = code.replace(/import \{ headers \} from ['"]next\/headers['"];\s*\n?/g, "");

  // Find all exported HTTP method handlers
  const methodRegex = /export\s+async\s+function\s+(GET|POST|PUT|DELETE|PATCH)\s*\([^)]*\)\s*\{/g;
  const methods = [];
  let match;
  while ((match = methodRegex.exec(code)) !== null) {
    methods.push({ method: match[1], index: match.index });
  }

  if (methods.length === 0) {
    // No handlers found, return as-is with export default wrapper
    return code;
  }

  // Extract function bodies
  function extractFunctionBody(code, startIndex) {
    // Find the opening brace
    let i = code.indexOf("{", startIndex);
    let depth = 0;
    let start = i;
    while (i < code.length) {
      if (code[i] === "{") depth++;
      else if (code[i] === "}") {
        depth--;
        if (depth === 0) return code.slice(start + 1, i);
      }
      i++;
    }
    return "";
  }

  const handlerBodies = methods.map((m) => {
    const body = extractFunctionBody(code, m.index);
    return { method: m.method, body };
  });

  // Remove all exported method functions from the code
  let preamble = code;
  for (const m of methods) {
    // Remove the entire function — find the end
    const funcStart = code.indexOf(`export async function ${m.method}`, 0);
    if (funcStart === -1) continue;
    let i = code.indexOf("{", funcStart);
    let depth = 0;
    while (i < code.length) {
      if (code[i] === "{") depth++;
      else if (code[i] === "}") {
        depth--;
        if (depth === 0) {
          preamble = preamble.replace(code.slice(funcStart, i + 1), "").trim();
          break;
        }
      }
      i++;
    }
  }

  // Apply body transformations
  function transformBody(body) {
    let b = body;

    // params destructuring: const { id } = await params; → const { id } = req.query;
    b = b.replace(/const\s*\{([^}]+)\}\s*=\s*await\s+params\s*;/g, (_, vars) => {
      return `const {${vars}} = req.query;`;
    });
    b = b.replace(/const\s*\{([^}]+)\}\s*=\s*params\s*;/g, (_, vars) => {
      return `const {${vars}} = req.query;`;
    });

    // request body
    b = b.replace(/const\s+(\w+)\s*=\s*await\s+request\.json\s*\(\s*\)\s*;/g, (_, varName) => {
      return `const ${varName} = req.body;`;
    });
    b = b.replace(/await\s+request\.json\s*\(\s*\)/g, "req.body");

    // searchParams  
    b = b.replace(/const\s+searchParams\s*=\s*(?:new\s+URL\s*\([^)]+\)\.searchParams|request\.nextUrl\.searchParams)\s*;/g,
      "const searchParams = new URLSearchParams(new URL(`http://localhost${req.url}`).search);");
    b = b.replace(/request\.nextUrl\.searchParams\.get\s*\(\s*(['"])(.*?)\1\s*\)/g, (_, q, key) => {
      return `(req.query.${key} || null)`;
    });
    b = b.replace(/request\.nextUrl\.searchParams/g, "new URLSearchParams(new URL(`http://localhost${req.url}`).search)");

    // getClubContext()
    b = b.replace(/await\s+getClubContext\s*\(\s*\)/g, "await getClubContext(req, res)");
    b = b.replace(/await\s+getClubContextById\s*\(/g, "await getClubContextById(");

    // cookies
    b = b.replace(/const\s+cookieStore\s*=\s*await\s+cookies\s*\(\s*\)\s*;/g, "const cookieStore = req.cookies;");
    b = b.replace(/cookieStore\.get\s*\(([^)]+)\)\.value/g, "cookieStore[$1]");

    // NextResponse.json(data) → res.status(200).json(data) and return
    b = b.replace(/return\s+NextResponse\.json\s*\(([^,)]+(?:\([^)]*\))?[^,)]*)\s*,\s*\{\s*status\s*:\s*(\d+)\s*\}\s*\)\s*;/g, (_, data, status) => {
      return `return res.status(${status}).json(${data});`;
    });
    b = b.replace(/return\s+NextResponse\.json\s*\(([^)]+(?:\([^)]*\))?[^)]*)\)\s*;/g, (_, data) => {
      // Multi-line patterns — simplified
      return `return res.status(200).json(${data});`;
    });

    // NextResponse.json without return
    b = b.replace(/NextResponse\.json\s*\(([^,)]+(?:\([^)]*\))?[^,)]*)\s*,\s*\{\s*status\s*:\s*(\d+)\s*\}\s*\)/g, (_, data, status) => {
      return `res.status(${status}).json(${data})`;
    });
    b = b.replace(/NextResponse\.json\s*\(([^)]+(?:\([^)]*\))?[^)]*)\)/g, (_, data) => {
      return `res.status(200).json(${data})`;
    });

    // NextResponse.redirect
    b = b.replace(/return\s+NextResponse\.redirect\s*\(([^)]+)\)\s*;/g, (_, url) => {
      return `return res.redirect(302, ${url});`;
    });

    // NextResponse.next()
    b = b.replace(/return\s+NextResponse\.next\s*\(\s*\)\s*;/g, "return res.status(200).end();");

    return b;
  }

  const transformedBodies = handlerBodies.map((h) => ({
    ...h,
    body: transformBody(h.body),
  }));

  // Build handler function
  let handlerCode;
  if (transformedBodies.length === 1) {
    const { method, body } = transformedBodies[0];
    handlerCode = `export default async function handler(req, res) {\n  if (req.method !== "${method}") return res.status(405).json({ error: "Method not allowed" });\n${body}\n}`;
  } else {
    const branches = transformedBodies.map(({ method, body }, i) => {
      const kw = i === 0 ? "if" : "} else if";
      return `  ${kw} (req.method === "${method}") {${body}`;
    }).join("\n");
    handlerCode = `export default async function handler(req, res) {\n${branches}\n  } else {\n    return res.status(405).json({ error: "Method not allowed" });\n  }\n}`;
  }

  // Combine preamble + handler
  const result = (preamble.trim() + "\n\n" + handlerCode).trim() + "\n";
  return result;
}

function getDestPath(relDir) {
  // Map src/app/api/<path>/route.js → src/pages/api/<path>.js
  // Dynamic segments stay as [param]
  const parts = relDir.split("/");
  
  // auth/[...nextauth] → auth/[...nextauth].js (already handled)
  const lastPart = parts[parts.length - 1];
  
  // For dirs like activities/[id]/orders/route.js, dest = activities/[id]/orders.js
  // But if the parent is a dynamic segment: activities/[id]/orders/[orderId]/route.js → ...
  const destDir = path.join(DEST_DIR, ...parts.slice(0, -1));
  const destFile = path.join(DEST_DIR, ...parts.slice(0, -1), lastPart + ".js");
  return { destDir, destFile };
}

function main() {
  const files = getAllRouteFiles(SRC_DIR);
  console.log(`Found ${files.length} route files`);

  let converted = 0;
  let skipped = 0;
  let errors = 0;

  for (const { srcFile, relDir } of files) {
    try {
      // Build dest path: relDir is like "activities/[id]/orders"
      const parts = relDir.split("/");
      const destDir = path.join(DEST_DIR, ...parts);
      let destFile;
      
      // Check if last part is dynamic or named
      // route.js at relDir "activities" → pages/api/activities/index.js (or activities.js)
      // But we already have activities/index.js, so create activities.js if no directory conflict
      
      // Simple strategy: put at <relDir>.js (as a file parallel to the dir)
      // If relDir = "activities" → activities.js (but we already have activities/ dir!)
      // Actually Pages Router allows both activities.js AND activities/[id].js
      // But we already created activities/index.js...
      
      // Let's use index.js for routes at the directory level
      // i.e., relDir = "activities" → activities/index.js (already created)
      // relDir = "activities/[id]" → activities/[id]/index.js (already created)
      // relDir = "activities/[id]/orders" → activities/[id]/orders/index.js
      
      const skipKey = relDir.replace(/\//g, "/");
      if (SKIP.some(s => skipKey.startsWith(s.replace(/\//g, "/")))) {
        console.log(`  SKIP (manual): ${relDir}`);
        skipped++;
        continue;
      }

      // Create dest directory
      fs.mkdirSync(destDir, { recursive: true });
      
      // Write as index.js inside the directory
      destFile = path.join(destDir, "index.js");

      // Check if already exists (manually created)
      if (fs.existsSync(destFile)) {
        console.log(`  SKIP (exists): ${relDir}`);
        skipped++;
        continue;
      }

      const srcCode = fs.readFileSync(srcFile, "utf8");
      const destCode = transformRoute(srcCode);
      
      fs.writeFileSync(destFile, destCode, "utf8");
      console.log(`  OK: ${relDir} → pages/api/${relDir}/index.js`);
      converted++;
    } catch (err) {
      console.error(`  ERROR: ${relDir}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\nDone: ${converted} converted, ${skipped} skipped, ${errors} errors`);
}

main();
