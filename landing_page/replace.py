import sys

file_path = "styles.css"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace purples with blues
content = content.replace("168, 85, 247", "59, 130, 246")
content = content.replace("139, 92, 246", "96, 165, 250")
content = content.replace("#E59CFF", "#38BDF8")
content = content.replace("#BA9CFF", "#3B82F6")
content = content.replace("#9CB2FF", "#2563EB")
content = content.replace("#c084fc", "#93c5fd") # lighter blue
content = content.replace("#A855F7", "#3B82F6") # purple to blue

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Colors replaced successfully.")
