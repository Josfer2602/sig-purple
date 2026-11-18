import openpyxl

wb = openpyxl.load_workbook('test_output_multi2.xlsm', keep_vba=True)
ws = wb['Cotizacion Interna']

print("=== Merged cells rows 10+ ===")
for mc in sorted(ws.merged_cells.ranges, key=lambda x: (x.min_row, x.min_col)):
    if mc.min_row >= 10:
        print(f"  {mc.coord}  cols {mc.min_col}-{mc.max_col}  rows {mc.min_row}-{mc.max_row}")

print("\n=== Cotizacion Interna rows 9-20 ===")
for r in range(9, 21):
    vals = {}
    for c in range(5, 22):
        cell = ws.cell(row=r, column=c)
        if cell.value is not None:
            vals[cell.column_letter] = repr(cell.value)[:60]
    if vals:
        print(f"  Row {r}: {vals}")
