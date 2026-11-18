import openpyxl
wb = openpyxl.load_workbook('../Plantilla Cotización.xlsm', keep_vba=True)
ws = wb['Cot Interna - Detalle Proveedor']
for mc in ws.merged_cells.ranges:
    if mc.min_row in (2, 3, 4, 8):
        print(f"Merge: {mc.coord}")
