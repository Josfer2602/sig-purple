import openpyxl, os, sys, json, urllib.request, unicodedata
from collections import defaultdict

def norm(s):
    if not s: return ""
    s = s.strip().lower()
    s = unicodedata.normalize('NFKD', s).encode('ASCII', 'ignore').decode('utf-8')
    return ' '.join(s.split())

# 1. Fetch DB
req = urllib.request.Request("https://purple.devlian.de/api/proyectos", headers={"User-Agent": "Mozilla/5.0"})
with urllib.request.urlopen(req) as resp:
    db_projects = json.loads(resp.read().decode('utf-8'))

req_c = urllib.request.Request("https://purple.devlian.de/api/clientes", headers={"User-Agent": "Mozilla/5.0"})
with urllib.request.urlopen(req_c) as resp:
    db_clients = json.loads(resp.read().decode('utf-8'))

client_map = {c['id']: norm(c['empresa']) for c in db_clients}

# 2. Load Excel
fname = [f for f in os.listdir('.') if f.endswith('.xlsm') and '(6)' in f][0]
wb = openpyxl.load_workbook(fname, data_only=True)
sheet = wb['BASE DE DATOS']

# Build index of DB projects by normalized name and (client, name)
db_by_name = defaultdict(list)
db_by_cli_name = defaultdict(list)
for p in db_projects:
    p_name = norm(p['nombre'])
    c_name = client_map.get(p.get('clienteId'), '')
    db_by_name[p_name].append(p)
    db_by_cli_name[(c_name, p_name)].append(p)

# Also special manual override
manual_mapping = {
    49: 'PRJ-2026-027', # Artilegio - Implementación Banco Ripley en Latin Pop Festival
}

resolved_mapping = [] # (excel_row, db_project_id, excel_subtotal, current_db_subtotal, is_mismatch)
unresolved_excel_rows = []

for r in range(15, sheet.max_row + 1):
    c = sheet.cell(r, 4).value
    a = sheet.cell(r, 5).value
    if not a and not c:
        continue
    sub = sheet.cell(r, 16).value
    sub_val = 0.0
    if sub is not None:
        try: sub_val = float(sub)
        except: sub_val = 0.0
    sub_val = round(sub_val, 2)
    
    e_cli = norm(str(c or ''))
    e_act = norm(str(a or ''))
    
    if r in manual_mapping:
        target_id = manual_mapping[r]
        target_proj = next(p for p in db_projects if p['id'] == target_id)
        db_sub = round(float(target_proj.get('subtotal') or 0), 2)
        resolved_mapping.append((r, target_id, sub_val, db_sub, abs(sub_val - db_sub) >= 0.05, str(c), str(a)))
        continue

    # Try matching by (client, activity)
    cand = db_by_cli_name.get((e_cli, e_act), [])
    
    # If not found by exact client name, try partial client name or just activity name
    if not cand:
        # Check if any client contains e_cli or vice versa
        for (cli_n, act_n), plist in db_by_cli_name.items():
            if act_n == e_act and (cli_n in e_cli or e_cli in cli_n or 'opeluce' in cli_n and 'opeluce' in e_cli):
                cand.extend(plist)
                
    if not cand:
        # Fallback to activity name
        cand = db_by_name.get(e_act, [])
        
    if len(cand) == 1:
        target_proj = cand[0]
        db_sub = round(float(target_proj.get('subtotal') or 0), 2)
        resolved_mapping.append((r, target_proj['id'], sub_val, db_sub, abs(sub_val - db_sub) >= 0.05, str(c), str(a)))
    elif len(cand) > 1:
        # Multiple candidates! Let's filter by client or year or exact subtotal
        # 1) If one candidate has exact client match
        cli_matches = [p for p in cand if e_cli in client_map.get(p.get('clienteId'), '') or client_map.get(p.get('clienteId'), '') in e_cli]
        if len(cli_matches) == 1:
            target_proj = cli_matches[0]
            db_sub = round(float(target_proj.get('subtotal') or 0), 2)
            resolved_mapping.append((r, target_proj['id'], sub_val, db_sub, abs(sub_val - db_sub) >= 0.05, str(c), str(a)))
        else:
            # 2) Check if one candidate has the same subtotal
            sub_matches = [p for p in cand if abs(round(float(p.get('subtotal') or 0), 2) - sub_val) < 0.05]
            if len(sub_matches) == 1:
                target_proj = sub_matches[0]
                db_sub = round(float(target_proj.get('subtotal') or 0), 2)
                resolved_mapping.append((r, target_proj['id'], sub_val, db_sub, False, str(c), str(a)))
            else:
                unresolved_excel_rows.append((r, str(c), str(a), sub_val, [p['id'] for p in cand]))
    else:
        unresolved_excel_rows.append((r, str(c), str(a), sub_val, []))

print(f"Total resolved mappings: {len(resolved_mapping)}")
print(f"Total unresolved rows: {len(unresolved_excel_rows)}")
if unresolved_excel_rows:
    print("Unresolved:", unresolved_excel_rows)

# Check for duplicate DB project assignments
db_id_counts = defaultdict(list)
for item in resolved_mapping:
    db_id_counts[item[1]].append(item[0])

dup_assignments = {k: v for k, v in db_id_counts.items() if len(v) > 1}
print(f"DB projects mapped to multiple Excel rows: {len(dup_assignments)}")
for k, v in list(dup_assignments.items())[:10]:
    print(f"  Project {k} assigned to rows: {v}")

mismatches = [m for m in resolved_mapping if m[4]]
print(f"\nTotal Mismatches to reconcile: {len(mismatches)}")
print("Sample 10 mismatches:")
for m in mismatches[:10]:
    print(f"  Row {m[0]} -> DB {m[1]} | {m[5]} | {m[6][:30]} | Excel: S/{m[2]:,.2f} vs DB: S/{m[3]:,.2f} (diff: S/{m[3]-m[2]:,.2f})")
