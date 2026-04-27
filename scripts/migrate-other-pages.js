/**
 * Migrate non-dashboard App Router pages to Pages Router
 */
const fs = require("fs");
const path = require("path");

const APP_SRC_DIR = path.join(__dirname, "../src/app");
const PAGES_DIR = path.join(__dirname, "../src/pages");

// Directories to process (non-dashboard pages)
const DIRS = ["admin", "invitations", "leads", "payment", "register", "set-password", "signup"];

// Skip root page.js (already done manually)
const SKIP = ["page.js"];

function getAllPageFiles(dir, base = "") {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results = [];
  for (const e of entries) {
    const relPath = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) {
      results.push(...getAllPageFiles(path.join(dir, e.name), relPath));
    } else if (e.name === "page.js") {
      results.push({ srcFile: path.join(dir, e.name), relPath });
    }
  }
  return results;
}

function transformPage(src) {
  let code = src;
  code = code.replace(/^"use client";\s*\n/m, "");
  code = code.replace(/^'use client';\s*\n/m, "");
  code = code.replace(/^"use server";\s*\n/m, "");

  // next/navigation → next/router
  code = code.replace(
    /import\s*\{([^}]*)\}\s*from\s*['"]next\/navigation['"]\s*;/g,
    (_, imports) => {
      const parts = imports.split(",").map(s => s.trim()).filter(Boolean);
      const routerParts = parts.filter(p => ["useRouter", "usePathname", "useSearchParams"].includes(p));
      const remaining = routerParts.filter(p => p === "useRouter");
      if (remaining.length) return `import { useRouter } from "next/router";`;
      return `import { useRouter } from "next/router"; // migrated from next/navigation`;
    }
  );

  // next-intl
  code = code.replace(/import\s*\{[^}]*\}\s*from\s*['"]next-intl['"]\s*;/g,
    `import { useIntl } from "react-intl";`);

  // use(params) → router.query
  code = code.replace(/const\s*\{([^}]+)\}\s*=\s*use\s*\(\s*params\s*\)\s*;/g,
    (_, vars) => `const {${vars}} = router.query;`);

  // Remove use from react imports
  code = code.replace(
    /import\s*\{([^}]*)\buse\b([^}]*)\}\s*from\s*['"]react['"]\s*;/g,
    (_, before, after) => {
      const parts = `${before}${after}`.split(",").map(s => s.trim()).filter(s => s && s !== "use");
      if (!parts.length) return "";
      return `import { ${parts.join(", ")} } from "react";`;
    }
  );

  // useTranslations
  code = code.replace(/const\s+(\w+)\s*=\s*useTranslations\s*\([^)]+\)\s*;/g,
    (_, v) => `// migrated: ${v} = useIntl helper`);
  code = code.replace(/const\s+locale\s*=\s*useLocale\s*\(\s*\)\s*;/g,
    "const { locale } = useIntl();");

  // usePathname, useSearchParams
  code = code.replace(/const\s+pathname\s*=\s*usePathname\s*\(\s*\)\s*;/g,
    "const pathname = router.pathname;");
  code = code.replace(/const\s+searchParams\s*=\s*useSearchParams\s*\(\s*\)\s*;/g,
    "const searchParams = new URLSearchParams(Object.entries(router.query || {}).map(([k,v]) => [k, String(v)]));");

  // redirect()
  code = code.replace(/redirect\s*\(\s*(['"][^'"]+['"])\s*\)/g, "router.push($1)");

  return code;
}

function main() {
  let all = [];
  for (const subdir of DIRS) {
    const srcDir = path.join(APP_SRC_DIR, subdir);
    const files = getAllPageFiles(srcDir, subdir);
    all = all.concat(files);
  }

  console.log(`Found ${all.length} non-dashboard pages`);
  let converted = 0, skipped = 0, errors = 0;

  for (const { srcFile, relPath } of all) {
    try {
      if (SKIP.includes(relPath)) { skipped++; continue; }

      // Convert "admin/clubs/[id]/edit/page.js" → "pages/admin/clubs/[id]/edit.js"
      const parts = relPath.split("/"); // ["admin", "clubs", "[id]", "edit", "page.js"]
      const dirParts = parts.slice(0, -1); // ["admin", "clubs", "[id]", "edit"]
      const leafDir = dirParts[dirParts.length - 1];

      let destFile;
      if (dirParts.length === 1) {
        // Just "admin/page.js" → "pages/admin/index.js"
        destFile = path.join(PAGES_DIR, dirParts[0], "index.js");
      } else {
        // "admin/clubs/[id]/edit/page.js" → "pages/admin/clubs/[id]/edit.js"
        destFile = path.join(PAGES_DIR, ...dirParts.slice(0, -1), leafDir + ".js");
      }

      if (fs.existsSync(destFile)) {
        console.log(`  SKIP (exists): ${relPath}`);
        skipped++;
        continue;
      }

      fs.mkdirSync(path.dirname(destFile), { recursive: true });
      const srcCode = fs.readFileSync(srcFile, "utf8");
      const destCode = transformPage(srcCode);
      fs.writeFileSync(destFile, destCode, "utf8");
      console.log(`  OK: ${relPath} → ${path.relative(path.join(__dirname, ".."), destFile)}`);
      converted++;
    } catch (err) {
      console.error(`  ERROR: ${relPath}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\nDone: ${converted} converted, ${skipped} skipped, ${errors} errors`);
}

main();
