"""
unify_api_urls.py
Replaces 'localhost:8000' with '127.0.0.1:8000' to avoid potential DNS delays on Windows.
"""
import os, glob

FRONTEND = r"c:\Users\Admin\Desktop\ERP\frontend"
JS_FILES = glob.glob(os.path.join(FRONTEND, "*.js"))

for path in JS_FILES:
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()
    
    new_content = content.replace("localhost:8000", "127.0.0.1:8000")
    
    if new_content != content:
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"  UNIFIED: {os.path.basename(path)}")

print("\nUnification Complete.")
