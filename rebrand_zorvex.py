"""
rebrand_zorvex.py
Global search and replace for 'NextGen' -> 'Zorvex' and cleanup of old brand assets.
Also removes duplicate logout listeners from JS files.
"""
import os, glob, re

FRONTEND = r"c:\Users\Admin\Desktop\ERP\frontend"
HTML_FILES = glob.glob(os.path.join(FRONTEND, "*.html"))
JS_FILES = glob.glob(os.path.join(FRONTEND, "*.js"))

# 1. Global String Replacement in HTML (Titles, etc.)
for path in HTML_FILES:
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()
    
    new_content = content.replace("NextGen ERP", "Zorvex ERP")
    new_content = new_content.replace("NextGen", "Zorvex")
    
    if new_content != content:
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"  REBRANDED HTML: {os.path.basename(path)}")

# 2. Global String Replacement in JS (Alerts, etc.)
for path in JS_FILES:
    # Skip shared-nav.js as I already updated it manually
    if "shared-nav.js" in path: continue
    
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()
    
    # Also remove duplicate logout handlers while we are at it
    # Pattern: document.getElementById('logoutBtn').addEventListener('click', ...);
    logout_re = re.compile(r"document\.getElementById\(['\"]logoutBtn['\"]\)\.addEventListener\(['\"]click['\"].*?\);", re.DOTALL)
    
    new_content = logout_re.sub('/* Removed duplicate logout listener - handled by shared-nav.js */', content)
    new_content = new_content.replace("NextGen", "Zorvex")
    
    if new_content != content:
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"  REBRANDED JS: {os.path.basename(path)}")

# 3. Final sanity check on titles
print("\nRebranding Complete.")
