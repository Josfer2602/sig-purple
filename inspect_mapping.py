import openpyxl, os, sys, json, urllib.request
sys.stdout.reconfigure(encoding='utf-8')

req = urllib.request.Request('https://purple.devlian.de/api/proyectos', headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req) as resp:
    db_projects = json.loads(resp.read().decode('utf-8'))

# Sort DB projects by id
db_projects.sort(key=lambda x: x['id'])
print('First 10 DB projects:')
for p in db_projects[:10]:
    print(f"  {p['id']} | {p['fechaRegistro']} | {p['nombre'][:40]} | S/{p['subtotal']:,.2f}")

fname = [f for f in os.listdir('.') if f.endswith('.xlsm') and '(6)' in f][0]
wb = openpyxl.load_workbook(fname, data_only=True)
sheet = wb['BASE DE DATOS']

print('\nFirst 10 rows in Excel (15-25):')
for r in range(15, 25):
    f_prop = str(sheet.cell(r, 1).value).split(' ')[0]
    act = sheet.cell(r, 5).value
    sub = sheet.cell(r, 16).value
    print(f"  Row {r} | {f_prop} | {str(act)[:40]} | S/{float(sub or 0):,.2f}")
