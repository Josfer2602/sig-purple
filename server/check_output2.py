import openpyxl

wb = openpyxl.load_workbook('test_output2.xlsm', keep_vba=True)
ws = wb['Cotizacion Interna']

print("=== Cotizacion Interna - merged cells ===")
for mc in sorted(ws.merged_cells.ranges, key=lambda x: x.min_row):
    if mc.min_row >= 10:
        print(f"  {mc.coord}  rows {mc.min_row}-{mc.max_row}")

print("\n=== Cotizacion Interna rows 9-17 ===")
for r in range(9, 18):
    vals = {}
    for c in range(5, 21):
        cell = ws.cell(row=r, column=c)
        if cell.value is not None:
            vals[f"{cell.column_letter}"] = repr(cell.value)[:70]
    if vals:
        print(f"  Row {r}: {vals}")

print("\n=== Cot Interna - Detalle Proveedor rows 1-14 ===")
ws2 = wb['Cot Interna - Detalle Proveedor']
for r in range(1, 15):
    vals = {}
    for c in range(1, 10):
        cell = ws2.cell(row=r, column=c)
        if cell.value is not None:
            vals[f"C{c}"] = repr(cell.value)[:50]
    if vals:
        print(f"  Row {r}: {vals}")
