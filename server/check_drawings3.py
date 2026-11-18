import zipfile, re

with zipfile.ZipFile('test_output_drawings.xlsm', 'r') as z:
    names = z.namelist()
    drawings = [n for n in names if 'drawing' in n.lower() or 'vml' in n.lower()]
    print('Drawing files in OUTPUT:', drawings)
    for sr in [n for n in names if 'worksheets/_rels' in n]:
        c = z.read(sr).decode('utf-8', errors='ignore')
        refs = re.findall(r'Target="\.\./drawings/([^"]+)"', c)
        if refs:
            print(f'  {sr} -> {refs}')
    for dfile in ['xl/drawings/drawing1.xml', 'xl/drawings/drawing3.xml']:
        if dfile in names:
            c = z.read(dfile).decode('utf-8', errors='ignore')
            macros = re.findall(r'macro="([^"]+)"', c)
            print(f'  {dfile} macros: {macros}')
