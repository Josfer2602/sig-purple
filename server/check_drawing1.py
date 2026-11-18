import zipfile, re

for fname in ['test_output_drawings2.xlsm', '../Plantilla Cotización.xlsm']:
    with zipfile.ZipFile(fname, 'r') as z:
        c = z.read('xl/drawings/drawing1.xml').decode('utf-8', errors='ignore')
        macros = re.findall(r'macro="([^"]+)"', c)
        button_refs = re.findall(r'<xdr:sp[^>]*>', c)[:3]
        print(f"\n{fname}")
        print(f"  macro= occurrences: {len(re.findall('macro=', c))}")
        print(f"  macros found: {macros[:5]}")
        print(f"  first 300 chars: {c[:300]}")
