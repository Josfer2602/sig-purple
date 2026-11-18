import openpyxl, os, sys, json, urllib.request
from collections import defaultdict

# 1. Fetch DB projects and clients
req = urllib.request.Request("https://purple.devlian.de/api/proyectos", headers={"User-Agent": "Mozilla/5.0"})
with urllib.request.urlopen(req) as resp:
    db_projects = json.loads(resp.read().decode('utf-8'))

req_c = urllib.request.Request("https://purple.devlian.de/api/clientes", headers={"User-Agent": "Mozilla/5.0"})
with urllib.request.urlopen(req_c) as resp:
    db_clients = json.loads(resp.read().decode('utf-8'))

client_map = {c['id']: c['empresa'] for c in db_clients}

# 2. Load Excel
fname = [f for f in os.listdir('.') if f.endswith('.xlsm') and '(6)' in f][0]
wb = openpyxl.load_workbook(fname, data_only=True)
sheet = wb['BASE DE DATOS']

excel_rows = []
for r in range(15, sheet.max_row + 1):
    c = sheet.cell(r, 4).value
    a = sheet.cell(r, 5).value
    if not a and not c:
        continue
    sub = sheet.cell(r, 16).value
    f_prop = sheet.cell(r, 1).value
    f_est = sheet.cell(r, 12).value
    est = sheet.cell(r, 11).value
    
    sub_val = 0.0
    if sub is not None:
        try: sub_val = float(sub)
        except: sub_val = 0.0
        
    excel_rows.append({
        'row': r,
        'cliente': str(c or '').strip(),
        'actividad': str(a or '').strip(),
        'subtotal': round(sub_val, 2),
        'estado': str(est or '').strip(),
        'fechaProp': str(f_prop or '').split(' ')[0],
        'fechaEst': str(f_est or '').split(' ')[0]
    })

print(f"Total Excel rows: {len(excel_rows)}")
print(f"Total DB projects: {len(db_projects)}")

# Let's inspect DB project ID pattern: e.g. PRJ-YYYY-NNN
# Notice that each DB project has fechaRegistro, id, etc.
# Let's see how many DB projects match Excel rows by (cliente, actividad)
def norm(s):
    if not s: return ""
    import unicodedata
    s = s.strip().lower()
    s = unicodedata.normalize('NFKD', s).encode('ASCII', 'ignore').decode('utf-8')
    return ' '.join(s.split())

# Check how DB projects were originally mapped
# Let's inspect all 128 mismatches
mismatches_detail = []
for erow in excel_rows:
    e_act = norm(erow['actividad'])
    e_cli = norm(erow['cliente'])
    e_sub = erow['subtotal']
    
    # Candidate matches in DB
    cand = []
    for p in db_projects:
        p_act = norm(p['nombre'])
        if p_act == e_act:
            cand.append(p)
            
    if not cand:
        # try substring or fuzzy
        for p in db_projects:
            p_act = norm(p['nombre'])
            if (e_act in p_act or p_act in e_act) and len(e_act) > 10:
                cand.append(p)
                
    # Check if any candidate matches subtotal
    has_exact = any(abs(round(float(p.get('subtotal') or 0), 2) - e_sub) < 0.05 for p in cand)
    if not has_exact:
        mismatches_detail.append({
            'row': erow['row'],
            'cliente': erow['cliente'],
            'actividad': erow['actividad'],
            'excel_subtotal': e_sub,
            'fechaProp': erow['fechaProp'],
            'estado': erow['estado'],
            'candidates': [{
                'id': p['id'],
                'nombre': p['nombre'],
                'cliente': client_map.get(p.get('clienteId'), p.get('clienteId')),
                'subtotal': round(float(p.get('subtotal') or 0), 2),
                'fechaRegistro': p.get('fechaRegistro'),
                'estado': p.get('estado')
            } for p in cand]
        })

print(f"Total non-matching rows: {len(mismatches_detail)}")

with open('mismatches_detailed.json', 'w', encoding='utf-8') as f:
    json.dump(mismatches_detail, f, indent=2, ensure_ascii=False)

print("Saved to mismatches_detailed.json")
