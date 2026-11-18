import openpyxl

wb = openpyxl.load_workbook('Cuadro de Gestión Comercial Purple BTL V7777777 (20 20 20 20 20) (6).xlsm', data_only=True)
ws_oc = wb['OC, Facturas y Cobranzas']

print("Scanning 'OC, Facturas y Cobranzas' for headers/sections:")
for r in range(1, min(ws_oc.max_row + 1, 150)):
    val_b = ws_oc.cell(r, 2).value
    val_c = ws_oc.cell(r, 3).value
    # Check if this row looks like a header or section
    vals = [str(ws_oc.cell(r, c).value) for c in range(1, 15) if ws_oc.cell(r, c).value is not None]
    if any(k in " ".join(vals).upper() for k in ["PENDIENTE", "FACTURA", "COBRANZA", "DETRACCION", "RETENCION", "TOTAL", "STATUS", "EMISION"]):
        print(f"Row {r}: {vals[:8]}")
