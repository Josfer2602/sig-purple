import openpyxl
from collections import Counter
from datetime import datetime

wb = openpyxl.load_workbook('Cuadro de Gestión Comercial Purple BTL V7777777 (20 20 20 20 20) (6).xlsm', data_only=True)

# 1. BASE DE DATOS
ws_bd = wb['BASE DE DATOS']
bd_rows = []
for r in range(15, ws_bd.max_row + 1):
    vals = [ws_bd.cell(r, c).value for c in range(1, 30)]
    if any(v is not None and str(v).strip() != '' for v in vals):
        bd_rows.append(vals)

print(f"=== BASE DE DATOS: Total rows = {len(bd_rows)} ===")

# Columns in BASE DE DATOS:
# 0: F. PROPUESTA, 1: MES, 2: AÑO, 3: CLIENTE, 4: ACTIVIDAD, 5: CONTACTO, 6: PROJECT MANAGER,
# 7: SERVICIO, 8: TIPO DE SERVICIO, 9: Nº DE MESES, 10: ESTADO, 11: F. ESTADO, 12: STATUS ACTIVIDAD,
# 13: MONEDA, 14: PRESUPUESTO ESTABLECIDO, 15: SUBTOTAL, 16: PROM DE, 17: PROM HASTA,
# 18: ORDEN DE COMPRA, 19: NRO OC, 20: FACTURADO, 21: F FACTURACION, 22: NRO FACTURA,
# 23: TIPO CREDITO, 24: DIAS CREDITO, 25: F ESTIMADA PAGO, 26: DIAS RETRASO, 27: COMENTARIOS

years = Counter()
clients = Counter()
pms = Counter()
estados = Counter()
servicios = Counter()
status_actividad = Counter()

coincidences = []

for r in bd_rows:
    f_prop, mes, anio, cliente, actividad, contacto, pm, serv, tipo_serv, n_meses, estado, f_estado, status_act, moneda, pres_est, subtotal = r[:16]
    
    if anio:
        years[str(anio)] += 1
    if cliente:
        clients[str(cliente).strip()] += 1
    if pm:
        pms[str(pm).strip()] += 1
    if estado:
        estados[str(estado).strip()] += 1
    if serv:
        servicios[str(serv).strip()] += 1
    if status_act:
        status_actividad[str(status_act).strip()] += 1
        
    act_str = str(actividad or "").lower()
    cli_str = str(cliente or "").lower()
    
    # Check for AAP, A365, IZIPAY, Stand Perú Sostenible
    for target in ['aap', 'a365', 'izipay', 'sostenible', 'teleoperador', 'mayorista']:
        if target in act_str or target in cli_str:
            coincidences.append({
                'match': target,
                'cliente': cliente,
                'actividad': actividad,
                'anio': anio,
                'estado': estado,
                'subtotal': subtotal,
                'oc': r[19] if len(r) > 19 else None,
                'factura': r[22] if len(r) > 22 else None
            })

print(f"\nYears distribution:")
for y, c in sorted(years.items()):
    print(f"  {y}: {c} rows")

print(f"\nEstados distribution:")
for e, c in estados.most_common():
    print(f"  {e}: {c}")

print(f"\nTop 15 Clientes (out of {len(clients)} unique clients):")
for cl, c in clients.most_common(15):
    print(f"  {cl}: {c}")

print(f"\nProject Managers:")
for p, c in pms.most_common():
    print(f"  {p}: {c}")

print(f"\nServicios:")
for s, c in servicios.most_common():
    print(f"  {s}: {c}")

print(f"\nStatus Actividad:")
for sa, c in status_actividad.most_common():
    print(f"  {sa}: {c}")

print(f"\nCoincidences found with current DB data ({len(coincidences)}):")
for coin in coincidences:
    print(f"  -> {coin}")
