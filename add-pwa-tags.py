import os
import re

# PWA meta tags to insert
PWA_HEAD_TAGS = '''
    <!-- PWA Meta Tags -->
    <link rel="manifest" href="/manifest.json">
    <meta name="theme-color" content="#0a8754">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
'''

PWA_BODY_SCRIPTS = '''
    <!-- PWA Scripts -->
    <script src="/sw-register.js"></script>
    <script src="/install-prompt.js"></script>'''

# Directory containing HTML files
PUBLIC_DIR = r'c:\Users\diya\Desktop\wasilly_project_v2 - Copy\public'

# Files to skip (already updated or admin pages)
SKIP_FILES = ['admin.html', 'admin-login.html', 'admin-complaints.html', 'offline.html', 
              'index.html', 'client-orders.html', 'tracking.html']

# Get all HTML files
html_files = [f for f in os.listdir(PUBLIC_DIR) if f.endswith('.html') and f not in SKIP_FILES]

print(f"Found {len(html_files)} HTML files to update:")
for f in html_files:
    print(f"  - {f}")

# Process each file
updated_count = 0
for filename in html_files:
    filepath = os.path.join(PUBLIC_DIR, filename)
    
    try:
        with open(filepath, 'r', encoding='utf-8') as file:
            content = file.read()
        
        # Check if already has PWA tags
        if 'manifest.json' in content:
            print(f"⏭️  Skipping {filename} (already has PWA tags)")
            continue
        
        # Insert PWA meta tags after <title> or before </head>
        if '</head>' in content:
            content = content.replace('</head>', f'{PWA_HEAD_TAGS}\n</head>', 1)
        
        # Insert PWA scripts before </body>
        if '</body>' in content:
            content = content.replace('</body>', f'{PWA_BODY_SCRIPTS}\n</body>', 1)
        
        # Write back
        with open(filepath, 'w', encoding='utf-8') as file:
            file.write(content)
        
        print(f"✅ Updated {filename}")
        updated_count += 1
        
    except Exception as e:
        print(f"❌ Error updating {filename}: {e}")

print(f"\n🎉 Successfully updated {updated_count} files!")
