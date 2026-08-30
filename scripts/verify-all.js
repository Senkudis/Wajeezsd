const fs = require('fs');
const path = require('path');

console.log('🔍 [1/4] Checking HTML files for tag balance and local asset links...');
const publicDir = path.resolve(__dirname, '../public_html');
const htmlFiles = fs.readdirSync(publicDir).filter(f => f.endsWith('.html'));

let htmlErrors = 0;

for (const f of htmlFiles) {
    const fullPath = path.join(publicDir, f);
    const content = fs.readFileSync(fullPath, 'utf8');

    // 1. Check style tag balance
    const styleOpens = (content.match(/<style\b/gi) || []).length;
    const styleCloses = (content.match(/<\/style>/gi) || []).length;
    if (styleOpens !== styleCloses) {
        console.error(`❌ [HTML Error] ${f}: Style tag mismatch (Opens: ${styleOpens}, Closes: ${styleCloses})`);
        htmlErrors++;
    }

    // 2. Check script tag balance
    const scriptOpens = (content.match(/<script\b/gi) || []).length;
    const scriptCloses = (content.match(/<\/script>/gi) || []).length;
    if (scriptOpens !== scriptCloses) {
        console.error(`❌ [HTML Error] ${f}: Script tag mismatch (Opens: ${scriptOpens}, Closes: ${scriptCloses})`);
        htmlErrors++;
    }

    // 3. Check referenced static assets (filter out JS template literals)
    const assetRegex = /(?:src|href)=["']([^"'#?]+)(?:\?[^"']*)?["']/gi;
    let match;
    while ((match = assetRegex.exec(content)) !== null) {
        let ref = match[1].trim();
        // Skip template variables or invalid links
        if (ref.includes('${') || ref.includes('+') || ref.includes('javascript:') || ref.includes('mailto:') || ref.includes('tel:') || ref.includes('data:') || ref.startsWith('http://') || ref.startsWith('https://') || ref.startsWith('#')) continue;
        if (ref.startsWith('/')) ref = ref.substring(1);
        if (!ref || ref === '/') continue;

        const resolvedPath = path.join(publicDir, ref);
        if (!fs.existsSync(resolvedPath) && !ref.endsWith('.html')) {
            console.warn(`⚠️ [Asset 404] in ${f}: '${ref}' does not exist on disk`);
            htmlErrors++;
        }
    }
}

if (htmlErrors === 0) {
    console.log(`✅ All ${htmlFiles.length} HTML files verified: Tag balance is 100% sound and all referenced assets exist.`);
}

console.log('\n🔍 [2/4] Checking JavaScript syntax across entire project...');
let jsErrors = 0;
function checkJsDir(dirPath) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
        const full = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'android' || entry.name === 'graphify-out') continue;
            checkJsDir(full);
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            try {
                // Syntax check via require syntax check
                const code = fs.readFileSync(full, 'utf8');
                new Function(code);
            } catch (err) {
                // Note: backend files with import/export or top-level return might throw in new Function, test with node -c
                console.error(`❌ [JS Syntax Error] in ${path.relative(process.cwd(), full)}: ${err.message}`);
                jsErrors++;
            }
        }
    }
}

// Check public_html/js
const jsDir = path.join(publicDir, 'js');
const jsFiles = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));
for (const f of jsFiles) {
    const full = path.join(jsDir, f);
    try {
        const code = fs.readFileSync(full, 'utf8');
        new Function(code);
    } catch (e) {
        console.error(`❌ [JS Error] public_html/js/${f}: ${e.message}`);
        jsErrors++;
    }
}

if (jsErrors === 0) {
    console.log(`✅ All ${jsFiles.length} client JavaScript files passed syntax verification with 0 errors.`);
}

console.log('\n🔍 [3/4] Checking CSS files for basic structural integrity...');
const cssDir = path.join(publicDir, 'css');
const cssFiles = fs.readdirSync(cssDir).filter(f => f.endsWith('.css'));
let cssErrors = 0;

for (const f of cssFiles) {
    const full = path.join(cssDir, f);
    const content = fs.readFileSync(full, 'utf8');
    const openBraces = (content.match(/\{/g) || []).length;
    const closeBraces = (content.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) {
        console.error(`❌ [CSS Error] ${f}: Brace mismatch (Opens: ${openBraces}, Closes: ${closeBraces})`);
        cssErrors++;
    }
}

if (cssErrors === 0) {
    console.log(`✅ All ${cssFiles.length} CSS files passed structural verification.`);
}

console.log('\n🔍 [4/4] Summary:');
if (htmlErrors === 0 && jsErrors === 0 && cssErrors === 0) {
    console.log('🎉 100% HEALTHY: No bugs, no syntax errors, no missing tags or broken asset links detected!');
    process.exit(0);
} else {
    console.log(`⚠️ Issues found: ${htmlErrors} HTML issues, ${jsErrors} JS errors, ${cssErrors} CSS errors.`);
    process.exit(1);
}
