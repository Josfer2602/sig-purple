import openpyxl
import json
from datetime import datetime

wb_path = 'Cuadro de Gestión Comercial Purple BTL V7777777 (20 20 20 20 20) (6).xlsm'
print("Loading workbook...")
wb = openpyxl.load_workbook(wb_path, data_only=True)
print("Workbook loaded.")

def format_date(val):
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.strftime('%Y-%m-%d')
    s = str(val).strip()
    if not s or s.upper() in ['NONE', 'NO APLICA', '-', 'N/A']:
        return None
    # If date string like 2026-09-18 00:00:00
    if ' ' in s:
        s = s.split(' ')[0]
    return s

def clean_str(val):
    if val is None:
        return None
    s = str(val).strip()
    return s if s and s.upper() != 'NONE' else None

def clean_float(val, default=0.0):
    if val is None:
        return default
    try:
        f = float(val)
        return f if not (f != f) else default # check NaN
    except (ValueError, TypeError):
        return default

# 1. Rentabilidad por Proyecto
ws_rent = wb['Rentabilidad por Proyecto']
rent_map = {}
for r in range(11, ws_rent.max_row + 1):
    act = clean_str(ws_rent.cell(r, 5).value)
    cli = clean_str(ws_rent.cell(r, 6).value)
    if act and cli:
        key = (cli.lower(), act.lower())
        cost = clean_float(ws_rent.cell(r, 11).value)
        gastos_ad = clean_float(ws_rent.cell(r, 12).value)
        fact = clean_float(ws_rent.cell(r, 13).value)
        factoring = clean_float(ws_rent.cell(r, 14).value)
        margen = clean_float(ws_rent.cell(r, 15).value)
        markup = clean_float(ws_rent.cell(r, 16).value)
        markdown = clean_float(ws_rent.cell(r, 17).value)
        status = clean_str(ws_rent.cell(r, 18).value)
        obs = clean_str(ws_rent.cell(r, 19).value)
        rent_map[key] = {
            'costoSinIgv': round(cost, 2),
            'gastosAdicionales': round(gastos_ad, 2),
            'facturacionSinIgv': round(fact, 2),
            'factoring': round(factoring, 2),
            'margen': round(margen, 2),
            'markup': round(markup, 4),
            'markdown': round(markdown, 4),
            'statusRent': status,
            'observaciones': obs
        }

print(f"Loaded Rentabilidad entries: {len(rent_map)}")

# 2. ADICIONALES
ws_ad = wb['ADICIONALES']
adicionales_map = {}
adicionales_list = []
for r in range(10, ws_ad.max_row + 1):
    cli = clean_str(ws_ad.cell(r, 4).value)
    proy = clean_str(ws_ad.cell(r, 5).value)
    desc = clean_str(ws_ad.cell(r, 6).value)
    resp = clean_str(ws_ad.cell(r, 7).value)
    f_reg = format_date(ws_ad.cell(r, 8).value)
    monto = clean_float(ws_ad.cell(r, 12).value)
    if cli and proy and monto > 0:
        key = (cli.lower(), proy.lower())
        adicionales_map[key] = adicionales_map.get(key, 0.0) + monto
        adicionales_list.append({
            'cliente': cli,
            'proyecto': proy,
            'descripcion': desc,
            'responsable': resp,
            'fecha': f_reg,
            'monto': round(monto, 2)
        })

print(f"Loaded Adicionales: {len(adicionales_list)} items, {len(adicionales_map)} grouped projects")

# 3. BASE DE DATOS
ws_bd = wb['BASE DE DATOS']
clientes_set = set()
proyectos_list = []

for r in range(15, ws_bd.max_row + 1):
    cli = clean_str(ws_bd.cell(r, 4).value)
    act = clean_str(ws_bd.cell(r, 5).value)
    if not cli or not act:
        continue
    
    clientes_set.add(cli)
    
    f_prop = format_date(ws_bd.cell(r, 1).value)
    mes = ws_bd.cell(r, 2).value
    anio = ws_bd.cell(r, 3).value
    contacto = clean_str(ws_bd.cell(r, 6).value)
    pm = clean_str(ws_bd.cell(r, 7).value) or 'Eric Higa'
    serv = clean_str(ws_bd.cell(r, 8).value) or 'PURPLE VISIBILITY'
    tipo_serv = clean_str(ws_bd.cell(r, 9).value) or 'INDIVIDUAL'
    estado_raw = clean_str(ws_bd.cell(r, 11).value) or '1.EN ESPERA CP'
    f_estado = format_date(ws_bd.cell(r, 12).value)
    status_act = clean_str(ws_bd.cell(r, 13).value)
    subtotal = clean_float(ws_bd.cell(r, 16).value)
    oc = clean_str(ws_bd.cell(r, 19).value)
    nro_oc = clean_str(ws_bd.cell(r, 20).value)
    facturado = clean_str(ws_bd.cell(r, 21).value)
    f_fact = format_date(ws_bd.cell(r, 22).value)
    nro_fact = clean_str(ws_bd.cell(r, 23).value)
    tipo_cred = clean_str(ws_bd.cell(r, 24).value) or 'Contado'
    dias_cred_val = ws_bd.cell(r, 25).value
    try:
        dias_cred = int(dias_cred_val) if dias_cred_val is not None else 30
    except (ValueError, TypeError):
        dias_cred = 30
    f_est_pago = format_date(ws_bd.cell(r, 26).value)
    comentarios = clean_str(ws_bd.cell(r, 28).value)
    
    # Map estado
    estado_norm = 'Registrado'
    if 'APROBADO' in estado_raw.upper():
        estado_norm = 'Aprobado'
    elif 'RECHAZADO' in estado_raw.upper():
        estado_norm = 'Rechazado'
    elif 'STAND BY' in estado_raw.upper():
        estado_norm = 'Registrado'
    
    # Match Rentabilidad info if available
    key = (cli.lower(), act.lower())
    rent_info = rent_map.get(key)
    
    # Additional expenses
    gastos_adic_val = adicionales_map.get(key, 0.0)
    if rent_info and rent_info['gastosAdicionales'] > 0:
        gastos_adic_val = max(gastos_adic_val, rent_info['gastosAdicionales'])
        
    proy_obj = {
        'row': r,
        'cliente': cli,
        'nombre': act,
        'fechaRegistro': f_prop or f_estado or f"{anio or 2026}-01-01",
        'fechaAprobacion': f_estado if estado_norm == 'Aprobado' else None,
        'contactoNombre': contacto,
        'projectManager': pm,
        'tipoServicio': serv,
        'tipoProyecto': tipo_serv,
        'estado': estado_norm,
        'estadoRaw': estado_raw,
        'statusActividad': status_act,
        'subtotal': round(subtotal, 2),
        'ordenesCompra': nro_oc or oc,
        'comentarios': comentarios,
        'gastosAdicionales': round(gastos_adic_val, 2),
        'anio': anio,
        'mes': mes,
        'factura': {
            'numeroFactura': nro_fact,
            'numeroOrden': nro_oc or oc or '-',
            'fechaEmision': f_fact or f_prop,
            'condicionPago': tipo_cred,
            'diasPago': dias_cred,
            'fechaPago': f_est_pago,
            'facturado': facturado,
            'montoSinIgv': round(subtotal, 2),
            'montoConIgv': round(subtotal * 1.18, 2)
        } if nro_fact and nro_fact not in ['-', 'NO APLICA'] else None,
        'rentabilidad': rent_info
    }
    
    proyectos_list.append(proy_obj)

print(f"Loaded Proyectos from BASE DE DATOS: {len(proyectos_list)}")
print(f"Total Unique Clients: {len(clientes_set)}")

# 4. Pago Proveedores
ws_pp = wb['Pago Proveedores']
pp_list = []
for r in range(10, ws_pp.max_row + 1):
    serv = clean_str(ws_pp.cell(r, 2).value)
    tipo_serv = clean_str(ws_pp.cell(r, 3).value)
    cli = clean_str(ws_pp.cell(r, 4).value)
    act = clean_str(ws_pp.cell(r, 5).value)
    pm = clean_str(ws_pp.cell(r, 6).value)
    prov = clean_str(ws_pp.cell(r, 7).value)
    det = clean_str(ws_pp.cell(r, 8).value)
    moneda = clean_str(ws_pp.cell(r, 9).value)
    monto_sin_igv = clean_float(ws_pp.cell(r, 10).value)
    igv = clean_float(ws_pp.cell(r, 11).value)
    total = clean_float(ws_pp.cell(r, 12).value)
    f_pago = format_date(ws_pp.cell(r, 13).value)
    status_pago = clean_str(ws_pp.cell(r, 14).value)
    tipo_doc = clean_str(ws_pp.cell(r, 15).value)
    nro_doc = clean_str(ws_pp.cell(r, 16).value)
    obs = clean_str(ws_pp.cell(r, 18).value)
    
    if prov and (act or cli) and total > 0:
        pp_list.append({
            'row': r,
            'servicio': serv,
            'tipoServicio': tipo_serv,
            'cliente': cli,
            'actividad': act,
            'pm': pm or 'Eric Higa',
            'proveedor': prov,
            'detalle': det,
            'moneda': moneda or 'PEN',
            'montoSinIgv': round(monto_sin_igv, 2),
            'igv': round(igv, 2),
            'total': round(total, 2),
            'fechaPago': f_pago,
            'statusPago': status_pago or 'Pagado',
            'tipoDocumento': tipo_doc or 'Factura',
            'nroDocumento': nro_doc,
            'observaciones': obs
        })

print(f"Loaded Pago Proveedores: {len(pp_list)}")

dataset = {
    'clientes': sorted(list(clientes_set)),
    'proyectos': proyectos_list,
    'adicionales': adicionales_list,
    'pagoProveedores': pp_list
}

out_path = 'history_dataset.json'
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(dataset, f, ensure_ascii=False, indent=2)

print(f"Successfully exported dataset to {out_path} ({len(json.dumps(dataset))} bytes)")
