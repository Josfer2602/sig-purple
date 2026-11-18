import csv
import json
import re

with open('server/history_dataset.json', 'r', encoding='utf-8') as f:
    dataset = json.load(f)

# Index projects by invoice number
# Column 23 had things like "E001-678 / E001-680", "FE001-1539", "E001-454"
invoice_to_proj = {}

def clean_inv(inv_str):
    if not inv_str:
        return []
    # Replace FE001 -> E001 or normalize
    # Split by /, y, and, comma
    parts = re.split(r'[/,y\+]', str(inv_str))
    res = []
    for p in parts:
        clean = p.strip()
        if clean and len(clean) > 2 and clean not in ['-', 'NO APLICA']:
            res.append(clean)
            # Also store normalized version (e.g. E001-1539 and FE001-1539)
            norm = clean.replace('FE001-', 'E001-').replace('FE01-', 'E001-')
            if norm != clean:
                res.append(norm)
    return res

for p in dataset['proyectos']:
    if p.get('factura') and p['factura'].get('numeroFactura'):
        invs = clean_inv(p['factura']['numeroFactura'])
        for inv in invs:
            invoice_to_proj[inv.upper()] = p

print(f"Total distinct invoice tokens mapped from projects: {len(invoice_to_proj)}")

# Read google_facturas.csv
with open('google_facturas.csv', 'r', encoding='utf-8', errors='ignore') as f:
    reader = csv.reader(f)
    rows = [r for r in reader if any(r)]

headers = rows[1]
google_facturas = rows[2:]

matched = 0
unmatched = []

for r in google_facturas:
    nro_fact = r[2].strip() if len(r) > 2 else ''
    cli = r[3].strip() if len(r) > 3 else ''
    if not nro_fact:
        continue
    
    # Try exact match
    norm_nro = nro_fact.upper()
    alt_nro = norm_nro.replace('FE001-', 'E001-').replace('FE01-', 'E001-')
    
    proj = invoice_to_proj.get(norm_nro) or invoice_to_proj.get(alt_nro)
    if proj:
        matched += 1
    else:
        unmatched.append((nro_fact, cli, r[8] if len(r) > 8 else ''))

print(f"Matched facturas to projects: {matched} / {len(google_facturas)}")
print(f"Unmatched: {len(unmatched)}")
if unmatched:
    print("Sample 10 unmatched:", unmatched[:10])
