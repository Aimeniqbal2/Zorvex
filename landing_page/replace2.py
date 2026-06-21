import sys

file_path = "styles.css"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Make the deep dark background more navy/blue tinted instead of purple tinted
content = content.replace("#030014", "#020617")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Background color updated.")
