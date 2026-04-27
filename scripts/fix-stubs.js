/**
 * Fix remaining stubs:
 * 1. Replace `// migrated: X = useIntl helper` comments with actual hook calls
 * 2. Replace `useParams()` with `router.query` pattern
 * 3. Add `getServerSideProps` to dynamic pages that need SSR
 */

const fs = require("fs");
const path = require("path");

function getAllFiles(dir, ext = ".js") {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      results.push(...getAllFiles(full, ext));
    } else if (name.endsWith(ext) || name.endsWith(".jsx")) {
      results.push(full);
    }
  }
  return results;
}

const srcDir = path.join(__dirname, "../src");
const files = getAllFiles(srcDir);
let modified = 0;

for (const file of files) {
  let content = fs.readFileSync(file, "utf8");
  const original = content;

  // Fix 1: Replace `// migrated: t = useIntl helper` comments with actual hook calls
  // Look for comment patterns inside function bodies and add useIntl calls
  // Pattern: function starts, then immediately has a migrated comment
  
  // Replace all stub comment blocks with actual useIntl hook calls
  // Handle all combinations: t, tc, tp
  
  const stubPatterns = [
    {
      // t only
      pattern: /^(\s*)\/\/ migrated: t = useIntl helper\s*$/m,
      replacement: (match, indent) => `${indent}const intl = useIntl();\n${indent}const t = (id, values) => intl.formatMessage({ id }, values);`
    },
    {
      // tc only
      pattern: /^(\s*)\/\/ migrated: tc = useIntl helper\s*$/m,
      replacement: (match, indent) => `${indent}const intl = useIntl();\n${indent}const tc = (id, values) => intl.formatMessage({ id }, values);`
    },
    {
      // tp only
      pattern: /^(\s*)\/\/ migrated: tp = useIntl helper\s*$/m,
      replacement: (match, indent) => `${indent}const intl = useIntl();\n${indent}const tp = (id, values) => intl.formatMessage({ id }, values);`
    }
  ];

  // Process multi-helper stubs: find blocks with multiple migrated comments and consolidate
  // First, find all consecutive migrated comment blocks
  content = content.replace(
    /^([ \t]*)\/\/ migrated: t = useIntl helper\n\1\/\/ migrated: tc = useIntl helper\n\1\/\/ migrated: tp = useIntl helper\s*$/m,
    (match, indent) =>
      `${indent}const intl = useIntl();\n${indent}const t = (id, values) => intl.formatMessage({ id }, values);\n${indent}const tc = (id, values) => intl.formatMessage({ id }, values);\n${indent}const tp = (id, values) => intl.formatMessage({ id }, values);`
  );

  content = content.replace(
    /^([ \t]*)\/\/ migrated: t = useIntl helper\n\1\/\/ migrated: tc = useIntl helper\s*$/m,
    (match, indent) =>
      `${indent}const intl = useIntl();\n${indent}const t = (id, values) => intl.formatMessage({ id }, values);\n${indent}const tc = (id, values) => intl.formatMessage({ id }, values);`
  );

  content = content.replace(
    /^([ \t]*)\/\/ migrated: tc = useIntl helper\n\1\/\/ migrated: tp = useIntl helper\s*$/m,
    (match, indent) =>
      `${indent}const intl = useIntl();\n${indent}const tc = (id, values) => intl.formatMessage({ id }, values);\n${indent}const tp = (id, values) => intl.formatMessage({ id }, values);`
  );

  // Single stubs
  content = content.replace(
    /^([ \t]*)\/\/ migrated: t = useIntl helper\s*$/m,
    (match, indent) =>
      `${indent}const intl = useIntl();\n${indent}const t = (id, values) => intl.formatMessage({ id }, values);`
  );

  content = content.replace(
    /^([ \t]*)\/\/ migrated: tc = useIntl helper\s*$/m,
    (match, indent) =>
      `${indent}const intl = useIntl();\n${indent}const tc = (id, values) => intl.formatMessage({ id }, values);`
  );

  content = content.replace(
    /^([ \t]*)\/\/ migrated: tp = useIntl helper\s*$/m,
    (match, indent) =>
      `${indent}const intl = useIntl();\n${indent}const tp = (id, values) => intl.formatMessage({ id }, values);`
  );

  // Ensure useIntl is imported when we added it
  if (content !== original && content.includes("useIntl()") && !content.includes("from \"react-intl\"") && !content.includes("from 'react-intl'")) {
    // Add import at top
    content = `import { useIntl } from "react-intl";\n` + content;
  }

  // Fix 2: Replace useParams() calls (remaining ones not fixed by previous scripts)
  if (content.includes("useParams()") && !content.includes("import { useParams }")) {
    // useParams was used but not imported - replace with useRouter pattern
    // Find patterns like: const { X } = useParams();
    content = content.replace(
      /const\s*\{\s*(\w+)\s*\}\s*=\s*useParams\(\)\s*;/g,
      (match, paramName) => {
        // Check if useRouter is already called in the component
        if (content.includes("const router = useRouter()") || content.includes("const router=useRouter()")) {
          return `const { ${paramName} } = router.query;`;
        }
        return `const router = useRouter();\n  const { ${paramName} } = router.query;`;
      }
    );
  }

  // Fix 3: Fix params destructuring (from migrated pages)
  // Pattern: function Foo({ params }) { ... const { x } = router.query; ...
  content = content.replace(
    /export default function (\w+)\(\s*\{\s*params\s*\}\s*\)/g,
    "export default function $1()"
  );

  if (content !== original) {
    fs.writeFileSync(file, content, "utf8");
    console.log(`  FIXED: ${path.relative(srcDir, file)}`);
    modified++;
  }
}

console.log(`\nDone: ${modified} files modified`);
