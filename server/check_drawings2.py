import zipfile, os, re, shutil

def check_full_drawings(path, label):
    print(f"\n=== {label}: {path} ===")
    with zipfile.ZipFile(path, 'r') as z:
        names = z.namelist()
        drawings = [n for n in names if 'drawing' in n.lower() or 'vml' in n.lower()]
        print(f"  Files: {drawings}")
        for d in drawings:
            if d.endswith('.xml') and 'rels' not in d and 'vml' not in d:
                content = z.read(d).decode('utf-8', errors='ignore')
                # Find macro references
                macros = re.findall(r'macro="([^"]+)"', content)
                if macros:
                    print(f"  [{d}] macros: {macros}")
                # Find which sheet references this drawing
        # Check sheet rels for drawing references
        sheet_rels = [n for n in names if 'worksheets/_rels' in n]
        for sr in sheet_rels:
            content = z.read(sr).decode('utf-8', errors='ignore')
            if 'drawing' in content.lower():
                draw_refs = re.findall(r'Target="\.\.\/drawings\/([^"]+)"', content)
                print(f"  [{sr}] -> drawings: {draw_refs}")

check_full_drawings('../Plantilla Cotización.xlsm', 'TEMPLATE')
check_full_drawings('test_output_multi2.xlsm', 'OUTPUT')
