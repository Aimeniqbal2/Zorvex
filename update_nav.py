import os
import glob

FRONTEND_DIR = os.path.join("c:\\Users\\Admin\\Desktop\\ERP", "frontend")
files = glob.glob(os.path.join(FRONTEND_DIR, "*.html"))

# Old compact nav to replace with the expanded nav
OLD_NAV_BLOCKS = [
    # Pattern seen in inventory.html / services.html style
    '''            <a href="dashboard.html" class="nav-item">
                <span style="font-size: 18px;">📊</span> Dashboard Focus
            </a>
            <a href="inventory.html" class="nav-item">
                <span style="font-size: 18px;">📦</span> Inventory
            </a>
            <a href="services.html" class="nav-item">
                <span style="font-size: 18px;">🛠️</span> Services
            </a>
            <a href="#" class="nav-item">
                <span style="font-size: 18px;">💳</span> POS
            </a>''',
    # Pattern seen in team.html style 
    '''            <a href="dashboard.html" class="nav-item">
                <span style="font-size: 18px;">📊</span> Dashboard
            </a>
            <a href="inventory.html" class="nav-item">
                <span style="font-size: 18px;">📦</span> Inventory
            </a>
            <a href="services.html" class="nav-item">
                <span style="font-size: 18px;">🛠️</span> Services
            </a>
            <a href="pos.html" class="nav-item">
                <span style="font-size: 18px;">💳</span> POS
            </a>''',
]

# New standard nav (active class is handled per-page so we strip it from non-matched pages)
NEW_NAV = '''            <a href="dashboard.html" class="nav-item">
                <span style="font-size: 18px;">📊</span> Dashboard
            </a>
            <a href="inventory.html" class="nav-item">
                <span style="font-size: 18px;">📦</span> Inventory
            </a>
            <a href="vendors.html" class="nav-item">
                <span style="font-size: 18px;">🏭</span> Vendors
            </a>
            <a href="service-logs.html" class="nav-item">
                <span style="font-size: 18px;">🛠️</span> Service Dispatch
            </a>
            <a href="pos.html" class="nav-item">
                <span style="font-size: 18px;">💳</span> POS
            </a>
            <a href="credit.html" class="nav-item">
                <span style="font-size: 18px;">📒</span> Credit Ledger
            </a>
            <a href="team.html" class="nav-item">
                <span style="font-size: 18px;">👥</span> Team
            </a>'''

updated = 0
for file_path in files:
    # Skip new pages - they already have proper nav
    basename = os.path.basename(file_path)
    if basename in ['vendors.html', 'credit.html', 'service-logs.html']:
        continue
    
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    changed = False
    for old in OLD_NAV_BLOCKS:
        if old in content:
            content = content.replace(old, NEW_NAV)
            changed = True
            break
    
    if changed:
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Updated: {basename}")
        updated += 1
    else:
        print(f"Skipped (no match): {basename}")

print(f"\nDone. Updated {updated} files.")
