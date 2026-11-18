import csv
import re
import json

def parse_currency(val):
    if not val:
        return 0.0
    s = str(val).replace('S/.', '').replace('S/', '').replace('$', '').replace(',', '').strip()
    try:
        return float(s)
    except ValueError:
        return 0.0

def parse_date(val):
    if not val:
        return None
    s = str(val).strip()
    if not s or s.upper() in ['NONE', 'NO APLICA', '-', 'N/A']:
        return None
    # If DD/MM/YYYY or D/M/YYYY
    if '/' in s:
        parts = s.split('/')
        if len(parts) == 3:
            d, m, y = parts
            return f"{y.zfill(4)}-{m.zfill(2)}-{d.zfill(2)}"
    return s

with open('google_facturas.csv', 'r', encoding='utf-8', errors='ignore') as f:
    reader = csv.reader(f)
    rows = [r for r in reader if any(r)]

headers = rows[1]
google_rows = rows[2:]

clean_google_invoices = []
for r in google_rows:
    nro_oc = r[1].strip() if len(r) > 1 else '-'
    nro_fact = r[2].strip() if len(r) > 2 else ''
    cli = r[3].strip() if len(r) > 3 else ''
    tipo = r[4].strip() if len(r) > 4 else 'Servicio'
    f_emision = parse_date(r[5]) if len(r) > 5 else None
    dias_cred_str = r[6].strip() if len(r) > 6 else '30'
    try:
        dias_cred = int(dias_cred_str)
    except ValueError:
        dias_cred = 30
    f_vcto = parse_date(r[7]) if len(r) > 7 else None
    tot_sin = parse_currency(r[8]) if len(r) > 8 else 0.0
    tot_con = parse_currency(r[9]) if len(r) > 9 else 0.0
    ret_3 = parse_currency(r[10]) if len(r) > 10 else 0.0
    det_12 = parse_currency(r[11]) if len(r) > 11 else 0.0
    neto = parse_currency(r[12]) if len(r) > 12 else 0.0
    f_pago = parse_date(r[13]) if len(r) > 13 else None
    status = r[14].strip() if len(r) > 14 else 'Pendiente'
    recibido = parse_currency(r[15]) if len(r) > 15 else 0.0
    
    if not nro_fact:
        continue
        
    is_paid = status.lower() in ['cobrado', 'pagado', 'cancelado']
    
    clean_google_invoices.append({
        'numeroFactura': nro_fact,
        'numeroOrden': nro_oc if nro_oc not in ['No aplica', '-'] else '-',
        'cliente': cli,
        'tipoOrden': 'OC' if 'oc' in nro_oc.lower() else 'Servicio',
        'fechaEmision': f_emision,
        'diasPago': dias_cred,
        'fechaVencimiento': f_vcto,
        'montoSinIgv': round(tot_sin, 2),
        'igv': round(tot_con - tot_sin, 2),
        'montoConIgv': round(tot_con, 2),
        'aplicaRetencion': ret_3 > 0,
        'aplicaDetraccion': det_12 > 0,
        'montoDetraccion': round(det_12, 2),
        'montoRetencion': round(ret_3, 2),
        'importeRecibido': round(recibido or neto or tot_con, 2) if is_paid else 0.0,
        'fechaPago': f_pago,
        'estado': 'Pagado' if is_paid else 'Pendiente'
    })

print(f"Total clean facturas from Google Sheet: {len(clean_google_invoices)}")
print("Sample 3 facturas:")
for f in clean_google_invoices[:3]:
    print(f)
