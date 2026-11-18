import openpyxl
import json
from datetime import datetime

wb_path = 'Cuadro de Gestión Comercial Purple BTL V7777777 (20 20 20 20 20) (6).xlsm'
wb = openpyxl.load_workbook(wb_path, data_only=True)

def inspect_sheet(sname, header_row_idx, max_sample=5):
    if sname not in wb.sheetnames:
        print(f"Sheet {sname} not found!")
        return
    ws = wb[sname]
    print(f"\n==========================================")
    print(f"SHEET: {sname} (Rows: {ws.max_row}, Cols: {ws.max_column})")
    print(f"==========================================")
    
    # Get header row
    headers = []
    for c in range(1, ws.max_column + 1):
        val = ws.cell(header_row_idx, c).value
        headers.append(str(val).strip() if val is not None else f"Col_{c}")
    
    print(f"Header Row {header_row_idx}:")
    for i, h in enumerate(headers):
        if not h.startswith("Col_") or i < 15:
            print(f"  [{i+1}] {h}")
            
    # Sample rows
    print("\nSample Data Rows:")
    samples_found = 0
    row_idx = header_row_idx + 1
    years_found = set()
    clients_found = set()
    total_valid_rows = 0
    
    while row_idx <= ws.max_row:
        vals = [ws.cell(row_idx, c).value for c in range(1, ws.max_column + 1)]
        # Check if row is not completely empty
        non_empty = [v for v in vals if v is not None and str(v).strip() != '']
        if non_empty:
            total_valid_rows += 1
            if samples_found < max_sample:
                # print a clean dict of key-value
                row_dict = {}
                for idx, h in enumerate(headers):
                    if idx < len(vals) and vals[idx] is not None:
                        val_str = str(vals[idx])
                        if isinstance(vals[idx], datetime):
                            val_str = vals[idx].strftime('%Y-%m-%d')
                        row_dict[h] = val_str
                print(f"Row {row_idx}: {row_dict}")
                samples_found += 1
        row_idx += 1
        
    print(f"\nTotal valid data rows: {total_valid_rows}")

# Inspect BASE DE DATOS
# Let's find the header row for BASE DE DATOS
ws_bd = wb['BASE DE DATOS']
for r in range(1, 15):
    vals = [ws_bd.cell(r, c).value for c in range(1, 20)]
    if any('Cliente' in str(v) or 'Proyecto' in str(v) or 'Actividad' in str(v) for v in vals if v):
        print(f"BASE DE DATOS header candidate at row {r}: {vals[:10]}")

# Inspect Rentabilidad por Proyecto
ws_rent = wb['Rentabilidad por Proyecto']
for r in range(1, 15):
    vals = [ws_rent.cell(r, c).value for c in range(1, 20)]
    if any('Cliente' in str(v) or 'Proyecto' in str(v) or 'Rentabilidad' in str(v) for v in vals if v):
        print(f"Rentabilidad por Proyecto header candidate at row {r}: {vals[:10]}")

# Inspect OC, Facturas y Cobranzas
ws_oc = wb['OC, Facturas y Cobranzas']
for r in range(1, 15):
    vals = [ws_oc.cell(r, c).value for c in range(1, 20)]
    if any('Cliente' in str(v) or 'Factura' in str(v) or 'Cobranza' in str(v) or 'Monto' in str(v) for v in vals if v):
        print(f"OC, Facturas y Cobranzas header candidate at row {r}: {vals[:10]}")
