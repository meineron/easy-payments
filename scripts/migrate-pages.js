/**
 * Automated migration: App Router page.js → Pages Router page
 * Run: node scripts/migrate-pages.js
 */
const fs = require("fs");
const path = require("path");

const APP_DIR = path.join(__dirname, "../src/app/dashboard");
const PAGES_DIR = path.join(__dirname, "../src/pages/dashboard");

// Already migrated by hand — skip
const SKIP = [
  "activities/page.js",
  "activities/[id]/page.js",
];

function getAllPageFiles(dir, base = "") {
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

function transformPage(src, relPath) {
  let code = src;

  // Remove "use client" directive
  code = code.replace(/^"use client";\s*\n/m, "");
  code = code.replace(/^'use client';\s*\n/m, "");

  // Replace next/navigation imports
  code = code.replace(
    /import\s*\{([^}]*)\}\s*from\s*['"]next\/navigation['"]\s*;/g,
    (_, imports) => {
      const parts = imports.split(",").map((s) => s.trim()).filter(Boolean);
      const keep = parts.filter((p) => !["redirect", "notFound"].includes(p));
      // Map to next/router equivalents
      const mapped = keep.map((p) => {
        if (p === "useRouter") return "useRouter";
        if (p === "usePathname") return null; // handled via router.pathname
        if (p === "useSearchParams") return null; // handled via router.query
        return p;
      }).filter(Boolean);
      if (mapped.length > 0) {
        return `import { ${mapped.join(", ")} } from "next/router";`;
      }
      return "";
    }
  );

  // Replace next-intl imports
  code = code.replace(
    /import\s*\{([^}]*)\}\s*from\s*['"]next-intl['"]\s*;/g,
    (_, imports) => {
      const parts = imports.split(",").map((s) => s.trim()).filter(Boolean);
      if (parts.some((p) => p.startsWith("use"))) {
        return `import { useIntl } from "react-intl";`;
      }
      return "";
    }
  );

  // Replace useTranslations calls
  code = code.replace(
    /const\s+(\w+)\s*=\s*useTranslations\s*\(\s*['"]([\w.-]+)['"]\s*\)\s*;/g,
    (_, varName, ns) => {
      if (varName === "t" || varName === "tc" || varName === "td" || varName === "tm") {
        return `// next-intl migration: use intl.formatMessage({ id: "payments.${ns}.key" })`;
      }
      return `// next-intl migration: ${varName} = useTranslations("${ns}")`;
    }
  );

  // Replace useLocale
  code = code.replace(/const\s+locale\s*=\s*useLocale\s*\(\s*\)\s*;/g, "const { locale } = useIntl();");

  // Replace use(params) with router.query
  code = code.replace(/const\s*\{([^}]+)\}\s*=\s*use\s*\(\s*params\s*\)\s*;/g, (_, vars) => {
    return `const {${vars}} = router.query;`;
  });

  // Remove use() import from react if it was only for params
  code = code.replace(
    /import\s*\{([^}]*)\buse\b([^}]*)\}\s*from\s*['"]react['"]\s*;/g,
    (_, before, after) => {
      const parts = `${before}${after}`.split(",").map((s) => s.trim()).filter((s) => s && s !== "use");
      if (parts.length === 0) return "";
      return `import { ${parts.join(", ")} } from "react";`;
    }
  );

  // Replace redirect() from next/navigation → router.push
  code = code.replace(/redirect\s*\(\s*(['"][^'"]+['"])\s*\)/g, "router.push($1)");

  // usePathname → router.pathname
  code = code.replace(/const\s+pathname\s*=\s*usePathname\s*\(\s*\)\s*;/g, "const pathname = router.pathname;");
  code = code.replace(/\busePathname\s*\(\s*\)/g, "router.pathname");

  // useSearchParams → router.query (basic)
  code = code.replace(/const\s+searchParams\s*=\s*useSearchParams\s*\(\s*\)\s*;/g, "const searchParams = new URLSearchParams(Object.entries(router.query).map(([k,v]) => [k, String(v)]).filter(([,v]) => v !== 'undefined'));");
  code = code.replace(/\buseSearchParams\s*\(\s*\)/g, "new URLSearchParams(Object.entries(router.query || {}).map(([k,v]) => [k, String(v)]))");

  // Add DashboardLayout getLayout and router import if not present
  const hasDashboardLayout = code.includes("DashboardLayout");
  const hasGetLayout = code.includes("getLayout");

  // Add imports at top
  let importsToAdd = [];
  if (!code.includes("from \"next/router\"") && !code.includes("from 'next/router'")) {
    importsToAdd.push(`import { useRouter } from "next/router";`);
  }
  if (!hasDashboardLayout && !hasGetLayout) {
    importsToAdd.push(`import DashboardLayout from "@/components/DashboardLayout";`);
  }
  if (!code.includes("useIntl") && code.includes("intl.formatMessage")) {
    importsToAdd.push(`import { useIntl } from "react-intl";`);
  }

  if (importsToAdd.length > 0) {
    // Insert after last import
    const lastImportMatch = [...code.matchAll(/^import .+;\s*$/gm)].pop();
    if (lastImportMatch) {
      const insertAt = lastImportMatch.index + lastImportMatch[0].length;
      code = code.slice(0, insertAt) + "\n" + importsToAdd.join("\n") + code.slice(insertAt);
    } else {
      code = importsToAdd.join("\n") + "\n" + code;
    }
  }

  // Add useRouter() call in default export function if it has params
  if (code.includes("router.query") && !code.includes("const router")) {
    code = code.replace(
      /export\s+default\s+function\s+\w+\s*\([^)]*\)\s*\{/,
      (m) => m + "\n  const router = useRouter();"
    );
  }

  // Add getLayout if not present
  if (!hasGetLayout && !hasDashboardLayout) {
    // Get the default export function name
    const nameMatch = code.match(/export\s+default\s+function\s+(\w+)/);
    if (nameMatch) {
      code += `\n${nameMatch[1]}.getLayout = (page) => <DashboardLayout>{page}</DashboardLayout>;\n`;
    }
  }

  // Replace <Link href="..."><a> pattern (App Router forces bare Link)
  // App Router: <Link href="...">text</Link>
  // Pages Router 12: <Link href="..."><a>text</a></Link>
  // We'll leave this for now (Next.js 12.2+ supports no-anchor Link)

  // Remove "use server" directive
  code = code.replace(/^"use server";\s*\n/m, "");

  return code;
}

function main() {
  const files = getAllPageFiles(APP_DIR);
  console.log(`Found ${files.length} page files`);

  let converted = 0, skipped = 0, errors = 0;

  for (const { srcFile, relPath } of files) {
    try {
      if (SKIP.some(s => relPath === s)) {
        console.log(`  SKIP (manual): ${relPath}`);
        skipped++;
        continue;
      }

      const parts = relPath.split("/");
      const fileName = parts[parts.length - 1]; // "page.js"
      const dirParts = parts.slice(0, -1); // e.g. ["activities", "[id]", "edit"]

      // Destination: pages/dashboard/<dirParts...>/<lastSegment>.js
      // "dashboard/page.js" → "pages/dashboard/index.js"
      // "dashboard/activities/page.js" → "pages/dashboard/activities/index.js"
      // "dashboard/activities/[id]/edit/page.js" → "pages/dashboard/activities/[id]/edit.js"

      let destFile;
      if (dirParts.length === 0) {
        destFile = path.join(PAGES_DIR, "index.js");
      } else {
        const destDir = path.join(PAGES_DIR, ...dirParts.slice(0, -1));
        fs.mkdirSync(destDir, { recursive: true });
        destFile = path.join(destDir, dirParts[dirParts.length - 1] + ".js");
      }

      if (fs.existsSync(destFile)) {
        console.log(`  SKIP (exists): ${relPath}`);
        skipped++;
        continue;
      }

      const srcCode = fs.readFileSync(srcFile, "utf8");
      const destCode = transformPage(srcCode, relPath);

      fs.mkdirSync(path.dirname(destFile), { recursive: true });
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
