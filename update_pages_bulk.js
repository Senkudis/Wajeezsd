const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public_html');
const files = fs.readdirSync(publicDir).filter(f => f.endsWith('.html'));

console.log(`🔍 Found ${files.length} HTML files.`);

files.forEach(file => {
    // Skip already manually updated files if you want, or just be idempotent
    if (file === 'mobile-overrides.css') return;

    const filePath = path.join(publicDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    let originalContent = content;

    // 1. Inject CSS
    if (!content.includes('css/mobile-overrides.css')) {
        const headEnd = content.indexOf('</head>');
        if (headEnd !== -1) {
            content = content.slice(0, headEnd) +
                '    <!-- Mobile App Overrides -->\n    <link rel="stylesheet" href="css/mobile-overrides.css">\n' +
                content.slice(headEnd);
        }
    }

    // 2. Inject JS
    if (!content.includes('js/app-core.js')) {
        const bodyEnd = content.indexOf('</body>');
        if (bodyEnd !== -1) {
            content = content.slice(0, bodyEnd) +
                '    <!-- Auth Helper & App Core & Notifications -->\n' +
                '    <script src="js/auth-helper.js"></script>\n' +
                '    <script type="module" src="js/app-core.js"></script>\n' +
                '    <script type="module" src="js/native-notifications.js"></script>\n' +
                content.slice(bodyEnd);
        }
    } else if (!content.includes('js/native-notifications.js')) {
        const bodyEnd = content.indexOf('</body>');
        if (bodyEnd !== -1) {
            content = content.slice(0, bodyEnd) +
                '    <script type="module" src="js/native-notifications.js"></script>\n' +
                content.slice(bodyEnd);
        }
    }

    // 3. Replace Auth Logic (Regex)
    // Replace: const token = localStorage.getItem('token'); -> const token = window.Auth.getToken();
    content = content.replace(/const\s+token\s*=\s*localStorage\.getItem\(['"]token['"]\);/g,
        '// Check Auth\n        if (!window.Auth || !window.Auth.isAuthenticated()) {\n             // Identify login page based on context or generic\n             // window.location.href = "client-login.html"; // handled by specific pages usually\n        }\n        const token = window.Auth.getToken();');

    // Replace: headers: { ... 'Authorization': 'Bearer ' + token ... }
    // This is stricter, might miss some. simpler to look for the common pattern.
    // headers: { 'Authorization': 'Bearer ' + token }
    content = content.replace(/headers:\s*{\s*['"]Authorization['"]:\s*['"]Bearer\s*['"]\s*\+\s*token\s*}/g,
        'headers: window.Auth.getAuthHeader()');

    // Also handle Content-Type combo
    // headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
    content = content.replace(/headers:\s*{\s*['"]Content-Type['"]:\s*['"]application\/json['"],\s*['"]Authorization['"]:\s*['"]Bearer\s*['"]\s*\+\s*token\s*}/g,
        'headers: { ...window.Auth.getAuthHeader(), \'Content-Type\': \'application/json\' }');


    if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`✅ Updated: ${file}`);
    } else {
        console.log(`⏭️ Skipped (No changes): ${file}`);
    }
});

console.log('🎉 Bulk update completed!');
