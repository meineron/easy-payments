/**
 * Fix next-intl and next/navigation in src/app/ subdirectories
 * that are still being imported by pages/ (register, payment pages).
 */
const fs = require("fs");
const path = require("path");

const APP_DIR = path.join(__dirname, "../src/app");

function getAllJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let results = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) results = results.concat(getAllJsFiles(full));
    else if ((e.name.endsWith(".js") || e.name.endsWith(".jsx")) && e.name !== "route.js") {
      results.push(full);
    }
  }
  return results;
}

function transform(code) {
  let c = code;
  let changed = false;

  if (c.match(/^["']use (server|client)["'];\s*\n/m)) {
    c = c.replace(/^["']use (server|client)["'];\s*\n/gm, "");
    changed = true;
  }

  if (c.includes("next-intl")) {
    c = c.replace(/import\s*\{([^}]*)\}\s*from\s*['"]next-intl['"]\s*;/g, (_, imports) => {
      changed = true;
      const parts = imports.split(",").map(s => s.trim()).filter(Boolean);
      const hooks = parts.filter(p => p.startsWith("use"));
      if (hooks.length) return `import { useIntl } from "react-intl";`;
      return "";
    });
    c = c.replace(
      /const\s+(\w+)\s*=\s*useTranslations\s*\(\s*['"]([\w.-]+)['"]\s*\)\s*;/g,
      (_, v, ns) => {
        changed = true;
        return `const ${v} = (id, values) => intl.formatMessage({ id: \`payments.${ns}.\${id}\` }, values);`;
      }
    );
    if (c.includes("intl.formatMessage") && !c.includes("const intl") && !c.includes("useIntl()")) {
      c = c.replace(
        /(export\s+default\s+function\s+\w+\s*\([^)]*\)\s*\{)/,
        m => { changed = true; return m + "\n  const intl = useIntl();"; }
      );
    }
    c = c.replace(/const\s+locale\s*=\s*useLocale\s*\(\s*\)\s*;/g, () => { changed = true; return "const { locale } = useIntl();"; });
    c = c.replace(/\buseLocale\s*\(\s*\)/g, () => { changed = true; return "useIntl().locale"; });
  }

  if (c.includes("next/navigation")) {
    c = c.replace(
      /import\s*\{([^}]*)\}\s*from\s*['"]next\/navigation['"]\s*;/g,
      (_, imports) => {
        changed = true;
        const parts = imports.split(",").map(s => s.trim()).filter(Boolean);
        const routerParts = parts.filter(p => p === "useRouter");
        return routerParts.length ? `import { useRouter } from "next/router";` : `import { useRouter } from "next/router"; // migrated`;
      }
    );
    c = c.replace(/\brouter\.refresh\s*\(\s*\)/g, () => { changed = true; return "router.reload()"; });
  }

  return { code: c, changed };
}

function main() {
  const files = getAllJsFiles(APP_DIR);
  console.log(`Scanning ${files.length} files in src/app/...`);
  let modified = 0;

  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    if (!src.includes("next-intl") && !src.includes("next/navigation") && !src.match(/^["']use (server|client)/m)) continue;

    const { code, changed } = transform(src);
    if (changed) {
      fs.writeFileSync(file, code, "utf8");
      console.log(`  FIXED: ${path.relative(APP_DIR, file)}`);
      modified++;
    }
  }

  console.log(`\nDone: ${modified} files modified`);
}

main();
