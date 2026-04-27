/**
 * Batch-fix remaining next-intl and next/navigation imports
 * in src/components/, src/features/, src/shared/ (excluding src/app/)
 */
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "../src");
const TARGET_DIRS = ["components", "features", "shared", "store", "pages"];

function getAllJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let results = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) results = results.concat(getAllJsFiles(full));
    else if (e.name.endsWith(".js") || e.name.endsWith(".jsx")) results.push(full);
  }
  return results;
}

function transformFile(code) {
  let changed = false;
  let c = code;

  // "use client" directive
  if (c.match(/^["']use client["'];\s*\n/m)) {
    c = c.replace(/^["']use client["'];\s*\n/m, "");
    changed = true;
  }

  // next-intl imports
  if (c.includes("next-intl")) {
    // Replace full import line
    c = c.replace(
      /import\s*\{([^}]*)\}\s*from\s*['"]next-intl['"]\s*;/g,
      (_, imports) => {
        changed = true;
        const parts = imports.split(",").map(s => s.trim()).filter(Boolean);
        const hooks = parts.filter(p => p.startsWith("use"));
        if (hooks.length) return `import { useIntl } from "react-intl";`;
        return ""; // Only non-hook exports (unlikely)
      }
    );
    // Replace useTranslations calls
    c = c.replace(
      /const\s+(\w+)\s*=\s*useTranslations\s*\(\s*['"]([\w.-]+)['"]\s*\)\s*;/g,
      (_, varName, ns) => {
        changed = true;
        return `const ${varName} = (id, values) => intl.formatMessage({ id: \`payments.${ns}.\${id}\` }, values);`;
      }
    );
    // Add intl = useIntl() if useTranslations was replaced and intl isn't declared
    if (c.includes("intl.formatMessage") && !c.includes("const intl") && !c.includes("useIntl()")) {
      // Find first function body in default export
      c = c.replace(
        /(export\s+default\s+function\s+\w+\s*\([^)]*\)\s*\{)/,
        (m) => { changed = true; return m + "\n  const intl = useIntl();"; }
      );
    }
    // useLocale
    c = c.replace(/const\s+locale\s*=\s*useLocale\s*\(\s*\)\s*;/g, () => {
      changed = true;
      return "const { locale } = useIntl();";
    });
    c = c.replace(/\buseLocale\s*\(\s*\)/g, () => { changed = true; return "useIntl().locale"; });
  }

  // next/navigation imports
  if (c.includes("next/navigation")) {
    c = c.replace(
      /import\s*\{([^}]*)\}\s*from\s*['"]next\/navigation['"]\s*;/g,
      (_, imports) => {
        changed = true;
        const parts = imports.split(",").map(s => s.trim()).filter(Boolean);
        const mapped = parts.map(p => {
          if (p === "useRouter") return "useRouter";
          if (p === "usePathname" || p === "useSearchParams") return null;
          if (p === "redirect" || p === "notFound") return null;
          return p;
        }).filter(Boolean);
        if (mapped.length) return `import { ${mapped.join(", ")} } from "next/router";`;
        return `import { useRouter } from "next/router"; // migrated`;
      }
    );
    // router.refresh() → router.reload()
    c = c.replace(/\brouter\.refresh\s*\(\s*\)/g, () => { changed = true; return "router.reload()"; });
    // usePathname
    c = c.replace(/const\s+pathname\s*=\s*usePathname\s*\(\s*\)\s*;/g, () => {
      changed = true; return "const pathname = router.pathname;";
    });
    c = c.replace(/\busePathname\s*\(\s*\)/g, () => { changed = true; return "router.pathname"; });
    // useSearchParams
    c = c.replace(/const\s+searchParams\s*=\s*useSearchParams\s*\(\s*\)\s*;/g, () => {
      changed = true;
      return "const searchParams = new URLSearchParams(Object.entries(router.query || {}).map(([k,v]) => [k, String(v)]));";
    });
  }

  // use(params) — React 19 specific
  if (c.includes("use(params)") || c.includes("use(")) {
    c = c.replace(/const\s*\{([^}]+)\}\s*=\s*use\s*\(\s*params\s*\)\s*;/g, (_, vars) => {
      changed = true;
      return `const {${vars}} = router.query;`;
    });
    // Remove use from react imports
    c = c.replace(
      /import\s*\{([^}]*)\buse\b([^}]*)\}\s*from\s*['"]react['"]\s*;/g,
      (_, before, after) => {
        const parts = `${before}${after}`.split(",").map(s => s.trim()).filter(s => s && s !== "use");
        changed = true;
        if (!parts.length) return "";
        return `import { ${parts.join(", ")} } from "react";`;
      }
    );
  }

  return { code: c, changed };
}

function main() {
  let files = [];
  for (const dir of TARGET_DIRS) {
    files = files.concat(getAllJsFiles(path.join(SRC, dir)));
  }

  console.log(`Scanning ${files.length} files...`);
  let modified = 0;

  for (const file of files) {
    const original = fs.readFileSync(file, "utf8");
    const { code, changed } = transformFile(original);
    if (changed) {
      fs.writeFileSync(file, code, "utf8");
      console.log(`  FIXED: ${path.relative(SRC, file)}`);
      modified++;
    }
  }

  console.log(`\nDone: ${modified} files modified`);
}

main();
