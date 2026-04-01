import os
import glob

FRONTEND_DIR = os.path.join("c:\\Users\\Admin\\Desktop\\ERP", "frontend")
files = glob.glob(os.path.join(FRONTEND_DIR, "*.html"))

REPLACEMENTS = {
    "Terminate Session": "Logout",
    "Transaction POS": "POS",
    "Work Order Scope": "Services",
    "Inventory Core": "Inventory",
    "Dashboard Analytics": "Dashboard",
    "Identity & Access": "Employees",
    "Identity Elements": "My Account",
    "Main Applications": "Main Menu",
    "Enterprise Terminal - POS": "POS",
    "Advanced Checkout Terminal": "POS Terminal",
    "Operations / HR Management": "HR Management",
    "Operations / Retail Hardware": "Retail",
    "Operations / Repair Pipeline": "Repairs",
    "Enterprise Identity Access": "Employee Management",
    "Active Workbench Architecture": "Active Service Orders",
    "Synchronized Access Registry": "Employee Registry",
    "Enterprise Repair Pipeline": "Service Desk",
    "Intercepting Product Catalog...": "Loading Products...",
    "Intercepting Product API Engine...": "Loading Products...",
    "Intercepting Product API...": "Loading Products...",
    "Transmitting to Cloud...": "Processing...",
    "Transact Total": "Charge Total",
    "Generating mathematically on execution": "Receipt will preview here...",
    "Generate New Identity": "Add Employee"
}

for file_path in files:
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    for old_text, new_text in REPLACEMENTS.items():
        content = content.replace(old_text, new_text)
    
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

print("Massive string simplification successfully bounded.")
