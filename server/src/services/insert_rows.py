
import sys
import openpyxl

template_path = sys.argv[1]
temp_path = sys.argv[2]
rows_to_insert = int(sys.argv[3])

wb = openpyxl.load_workbook(template_path, keep_vba=True)
ws = wb['Cotizacion Interna']

if rows_to_insert > 0:
    ws.insert_rows(14, rows_to_insert)

wb.save(temp_path)
