import openpyxl
wb = openpyxl.load_workbook('../Plantilla Cotización.xlsm', keep_vba=True)
ws = wb['Datos 2']
print("Datos 2 row 12 merges:")
for mc in ws.merged_cells.ranges:
    if mc.min_row == 12:
        print(mc.coord)

ws_int = wb['Cotizacion Interna']
print("Cotizacion Interna row 10 merges:")
for mc in ws_int.merged_cells.ranges:
    if mc.min_row == 10:
        print(mc.coord)
