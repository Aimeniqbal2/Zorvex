"""
repair_frontend.py
Fixes syntax errors and accidental redirects introduced by the previous rebranding script.
Also ensures all remaining 'NextGen' strings are converted to 'Zorvex'.
"""
import os, glob, re

FRONTEND = r"c:\Users\Admin\Desktop\ERP\frontend"
JS_FILES = glob.glob(os.path.join(FRONTEND, "*.js"))

# 1. Precise Code Cleanup
for path in JS_FILES:
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()

    # The broken pattern looks like:
    # /* Removed duplicate logout listener - handled by shared-nav.js */ window.location.href='index.html'; });
    # We want to remove the COMMENT and the extra code following it until the next valid block or end of file.
    
    # Let's remove the specific broken line and trailing fragments
    new_content = re.sub(r'/\* Removed duplicate logout listener.*?\*/.*?;?\s*\}\);?', '', content)
    
    # Ensure Zorvex is used in receipts etc.
    new_content = new_content.replace("NEXTGEN ERP S.A.A.S.", "ZORVEX ERP S.A.A.S.")
    new_content = new_content.replace("NextGen ERP", "Zorvex ERP")
    new_content = new_content.replace("NextGen", "Zorvex")

    if new_content != content:
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"  REPAIRED: {os.path.basename(path)}")

print("\nRepair Complete.")
