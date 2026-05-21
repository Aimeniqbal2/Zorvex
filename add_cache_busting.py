import os
import re

TEMPLATES_DIR = r"c:\Users\Aimen Iqbal\Desktop\ERP\templates"
files = [os.path.join(TEMPLATES_DIR, f) for f in os.listdir(TEMPLATES_DIR) if f.endswith(".html")]

static_pattern = re.compile(r"({%\s*static\s+['\"]([^'\"]+)['\"]\s*%})(?!\?v=)")

def add_version(match):
    full_tag = match.group(1)
    filename = match.group(2)
    # We apply cache-busting to .js and .css files
    if filename.endswith(".js") or filename.endswith(".css"):
        return f"{full_tag}?v=1.2"
    return full_tag

updated_count = 0

for file_path in files:
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    new_content, count = static_pattern.subn(add_version, content)
    
    if count > 0:
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"Updated {os.path.basename(file_path)}: added {count} cache-busting version query parameters.")
        updated_count += 1
    else:
        print(f"No assets needed updating in {os.path.basename(file_path)}")

print(f"\nDone. Updated {updated_count} templates.")
