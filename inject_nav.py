"""
inject_nav.py
Strips the hardcoded <aside>...</aside> sidebar from all HTML pages
and injects <script src="shared-nav.js"></script> right before </body>.
"""
import os, re, glob

FRONTEND = r"c:\Users\Admin\Desktop\ERP\frontend"
files = glob.glob(os.path.join(FRONTEND, "*.html"))
# Skip login page
SKIP = {"index.html"}

aside_re = re.compile(r'<aside\b[^>]*>.*?</aside>', re.DOTALL | re.IGNORECASE)
script_tag = '<script src="shared-nav.js"></script>'

for path in files:
    basename = os.path.basename(path)
    if basename in SKIP:
        print(f"  SKIP: {basename}")
        continue

    with open(path, "r", encoding="utf-8") as f:
        html = f.read()

    original = html

    # 1. Remove ALL existing <aside> blocks
    html = aside_re.sub('', html)

    # 2. Remove any old standalone logoutBtn listeners that reference logoutBtn
    #    (they'll conflict with shared-nav.js — remove simple onclick patterns)
    # Nothing to regex here; shared-nav.js attaches logout by ID safely.

    # 3. Remove duplicate shared-nav.js script tags if already present
    html = html.replace(script_tag, '')

    # 4. Inject shared-nav.js before </body>
    if '</body>' in html:
        html = html.replace('</body>', f'{script_tag}\n</body>', 1)

    if html != original:
        with open(path, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"  UPDATED: {basename}")
    else:
        print(f"  NO CHANGE: {basename}")

print("\nDone.")
