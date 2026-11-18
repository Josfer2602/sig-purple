import openpyxl
from datetime import datetime

wb = openpyxl.load_workbook('Cuadro de Gestión Comercial Purple BTL V7777777 (20 20 20 20 20) (6).xlsm', data_only=True)
ws_bd = wb['BASE DE DATOS']

print(f"Max row: {ws_bd.max_row}")

def format_date(val):
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.strftime('%Y-%m-%d')
    s = str(val).strip()
    return s if s else None

projects = []
for r in range(15, ws_bd.max_row + 1):
    cliente = ws_bd.cell(r, 4).value
    actividad = ws_bd.cell(r, 5).value
    if not cliente or not actividad or str(cliente).strip() == '' or str(actividad).strip() == '':
        continue
    
    f_prop = format_date(ws_bd.cell(r, 1).value)
    mes = ws_bd.cell(r, 2).value
    anio = ws_bd.cell(r, 3).value
    contacto = ws_bd.cell(r, 6).value
    pm = ws_bd.cell(r, 7).value
    servicio = ws_bd.cell(r, 8).value
    tipo_servicio = ws_bd.cell(r, 9).value
    n_meses = ws_bd.cell(r, 10).value
    estado = ws_bd.cell(r, 11).value
    f_estado = format_date(ws_bd.cell(r, 12).value)
    status_act = ws_bd.cell(r, 13).value
    moneda = ws_bd.cell(r, 14).value
    pres_est = ws_bd.cell(r, 15).value
    subtotal = ws_bd.cell(r, 16).value
    oc = ws_bd.cell(r, 19).value
    nro_oc = ws_bd.cell(r, 20).value
    facturado = ws_bd.cell(r, 21).value
    f_fact = format_date(ws_bd.cell(r, 22).value)
    nro_fact = ws_bd.cell(r, 23).value
    tipo_cred = ws_bd.cell(r, 24).value
    dias_cred = ws_bd.cell(r, 25).value
    f_est_pago = format_date(ws_bd.cell(r, 26).value)
    comentarios = ws_bd.cell(r, 28).value
    
    projects.append({
        'row': r,
        'f_prop': f_prop,
        'mes': mes,
        'anio': anio,
        'cliente': str(cliente).strip(),
        'actividad': str(actividad).strip(),
        'contacto': str(contacto).strip() if contacto else None,
        'pm': str(pm).strip() if pm else 'Eric Higa',
        'servicio': str(servicio).strip() if servicio else 'PURPLE VISIBILITY',
        'tipo_servicio': str(tipo_servicio).strip() if tipo_servicio else 'INDIVIDUAL',
        'estado': str(estado).strip() if estado else '1.EN ESPERA CP',
        'f_estado': f_estado,
        'status_act': str(status_act).strip() if status_act else None,
        'subtotal': float(subtotal) if subtotal and isinstance(subtotal, (int, float)) else 0.0,
        'oc': str(oc).strip() if oc else None,
        'nro_oc': str(nro_oc).strip() if nro_oc else None,
        'facturado': str(facturado).strip() if facturado else None,
        'f_fact': f_fact,
        'nro_fact': str(nro_fact).strip() if nro_fact else None,
        'tipo_cred': str(tipo_cred).strip() if tipo_cred else None,
        'dias_cred': int(dias_cred) if dias_cred and str(dias_cred).isdigit() else 30,
        'f_est_pago': f_est_pago,
        'comentarios': str(comentarios).strip() if comentarios else None
    })

print(f"Total valid projects found: {len(projects)}")
print(f"Sample 1: {projects[0]}")
print(f"Sample last: {projects[-1]}")
