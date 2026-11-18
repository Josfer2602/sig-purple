import zipfile, os

def check_drawings(path, label):
    print(f"\n=== {label}: {path} ===")
    with zipfile.ZipFile(path, 'r') as z:
        names = z.namelist()
        # drawings
        drawings = [n for n in names if 'drawing' in n.lower()]
        controls = [n for n in names if 'control' in n.lower() or 'activeX' in n.lower() or 'ActiveX' in n]
        vba = [n for n in names if 'vba' in n.lower()]
        print(f"  Drawings: {drawings}")
        print(f"  Controls: {controls}")
        print(f"  VBA:      {vba}")
        # Print drawing content snippets
        for d in drawings:
            if d.endswith('.xml') and 'rels' not in d:
                content = z.read(d).decode('utf-8', errors='ignore')
                # Look for button/macro references
                if 'button' in content.lower() or 'macro' in content.lower() or 'sp ' in content.lower() or 'nvSpPr' in content.lower():
                    print(f"\n  [{d}] snippet:")
                    print(content[:500])

check_drawings('../Plantilla Cotización.xlsm', 'TEMPLATE')
check_drawings('test_output_multi2.xlsm', 'OUTPUT')
