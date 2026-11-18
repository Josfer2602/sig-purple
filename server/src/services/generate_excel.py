import sys
import json
import copy
import os
import zipfile
import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill, Border
import datetime


def parse_date(date_val):
    if isinstance(date_val, (datetime.date, datetime.datetime)):
        return date_val if isinstance(date_val, datetime.date) else date_val.date()
    if not date_val:
        return None
    date_str = str(date_val).strip()
    for fmt in ('%d/%m/%Y', '%d-%m-%Y', '%Y-%m-%d', '%Y/%m/%d', '%d/%m/%y'):
        try:
            return datetime.datetime.strptime(date_str, fmt).date()
        except ValueError:
            pass
    if '/' in date_str:
        parts = date_str.split('/')
        if len(parts) == 3:
            try:
                p0, p1, p2 = int(parts[0]), int(parts[1]), int(parts[2])
                if p0 > 1000:
                    return datetime.date(p0, p1, p2)
                else:
                    if p2 < 100: p2 += 2000
                    return datetime.date(p2, p1, p0)
            except Exception:
                pass
    return None

template_path = sys.argv[1]
output_path = sys.argv[2]
json_path = sys.argv[3]

with open(json_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

wb = openpyxl.load_workbook(template_path, keep_vba=True)

ws_interna = wb['Cotizacion Interna']
ws_datos2 = wb['Datos 2']
ws_detalle = wb['Cot Interna - Detalle Proveedor']
ws_cliente = wb['Cotización Cliente']


def copy_cell_style(src_cell, dst_cell):
    if src_cell.has_style:
        dst_cell.font = copy.copy(src_cell.font)
        dst_cell.border = copy.copy(src_cell.border)
        dst_cell.fill = copy.copy(src_cell.fill)
        dst_cell.number_format = src_cell.number_format
        dst_cell.protection = copy.copy(src_cell.protection)
        dst_cell.alignment = copy.copy(src_cell.alignment)


def copy_row_format(src_sheet, src_row_num, dst_sheet, dst_row_num, col_count=28):
    """Copy only STYLE (not values/formulas) from source row to destination row."""
    for col_idx in range(1, col_count + 1):
        src_cell = src_sheet.cell(row=src_row_num, column=col_idx)
        dst_cell = dst_sheet.cell(row=dst_row_num, column=col_idx)
        if type(dst_cell).__name__ == 'MergedCell':
            continue
        copy_cell_style(src_cell, dst_cell)
    src_dim = src_sheet.row_dimensions.get(src_row_num)
    if src_dim and src_dim.height:
        dst_sheet.row_dimensions[dst_row_num].height = src_dim.height


def safe_set(sheet, row, col, value):
    """Write a value only if the cell is not a slave MergedCell."""
    cell = sheet.cell(row=row, column=col)
    if type(cell).__name__ == 'MergedCell':
        return
    cell.value = value


def apply_row_merges(src_sheet, src_row, dst_sheet, dst_row):
    for mc in list(src_sheet.merged_cells.ranges):
        if mc.min_row == src_row and mc.max_row == src_row:
            try:
                dst_sheet.merge_cells(
                    start_row=dst_row, start_column=mc.min_col,
                    end_row=dst_row, end_column=mc.max_col
                )
            except Exception:
                pass


def clear_row_values(sheet, row, col_count=28):
    """Clear all cell values in a row (keeps formatting)."""
    for col_idx in range(1, col_count + 1):
        cell = sheet.cell(row=row, column=col_idx)
        if type(cell).__name__ != 'MergedCell':
            cell.value = None


def format_item_details(item):
    """Format description lines with hyphens/bullets, preserving original bullets."""
    details_data = item.get('details', [])
    if isinstance(details_data, str):
        try:
            details_data = json.loads(details_data)
        except:
            details_data = [details_data] if details_data.strip() else []

    parts = []
    if isinstance(details_data, list) and len(details_data) > 0:
        for d in details_data:
            lines = str(d).split('\n')
            for line in lines:
                s_strip = line.strip()
                if not s_strip:
                    continue
                if s_strip.startswith('*'):
                    parts.append('  * ' + s_strip.lstrip('*').strip())
                elif s_strip.startswith('-'):
                    parts.append(' - ' + s_strip.lstrip('-').strip())
                elif s_strip.startswith('•'):
                    parts.append(' - ' + s_strip.lstrip('•').strip())
                else:
                    parts.append(' - ' + s_strip)

    if not parts:
        subitems = item.get('subItems', [])
        for sub in subitems:
            sub_name = sub.get('name', '')
            sub_desc = sub.get('description', '')
            if sub_name and sub_desc:
                parts.append(f' - {sub_name}: {sub_desc}')
            elif sub_name:
                parts.append(f' - {sub_name}')
            elif sub_desc:
                parts.append(f' - {sub_desc}')

    if not parts:
        parts = [f' - {item.get("name", "")}']

    return '\n' + '\n'.join(parts) + '\n'


# ─── 1. Fill static header in Cotizacion Interna ────────────────────────────
ws_interna['G2'] = data.get('client', '')
ws_interna['G3'] = data.get('brand', '')
ws_interna['G4'] = data.get('requirement', '')
date_str = data.get('date', '')
if date_str:
    parsed_d = parse_date(date_str)
    if parsed_d:
        ws_interna['G5'] = parsed_d
        ws_interna['G5'].number_format = 'DD/MM/YYYY'
    else:
        ws_interna['G5'] = date_str

agency_companies = ['purple btl', 'apl consulting', 'brand geeks']
business_name = data.get('businessName', '')
if business_name and any(ac in business_name.lower() for ac in agency_companies):
    ws_interna['K2'] = business_name

payment = data.get('paymentConditions', '')
if payment:
    ws_interna['K4'] = payment

categories = data.get('categories', [])

# ─── 2. Fill Cot Interna - Detalle Proveedor ────────────────────────────────
all_items = []
for cat in categories:
    for item in cat.get('items', []):
        item['_cat_name'] = cat.get('name', '')
        all_items.append(item)

# Capture template rows 2-10 from ws_detalle BEFORE clearing
template_block = []
for r in range(2, 12):
    row_data = []
    for c in range(1, 11):
        cell = ws_detalle.cell(row=r, column=c)
        row_data.append({
            'value': cell.value,
            'font': copy.copy(cell.font) if cell.has_style else None,
            'fill': copy.copy(cell.fill) if cell.has_style else None,
            'border': copy.copy(cell.border) if cell.has_style else None,
            'alignment': copy.copy(cell.alignment) if cell.has_style else None,
            'number_format': cell.number_format
        })
    template_block.append(row_data)

empty_fill = PatternFill(fill_type=None)
empty_border = Border()
empty_font = Font()
empty_alignment = Alignment()

# Unmerge rows >= 2 in detalle and completely clear their values and styles
for mc in list(ws_detalle.merged_cells.ranges):
    if mc.min_row >= 2:
        try:
            ws_detalle.unmerge_cells(str(mc))
        except:
            pass

for r in range(2, max(ws_detalle.max_row + 1, 200)):
    for c in range(1, 15):
        try:
            cell = ws_detalle.cell(row=r, column=c)
            cell.value = None
            cell.fill = empty_fill
            cell.border = empty_border
            cell.font = empty_font
            cell.alignment = empty_alignment
            cell.number_format = 'General'
        except:
            pass


def apply_tpl_row_detalle(tpl_idx, dst_row):
    for c_idx, td in enumerate(template_block[tpl_idx], start=1):
        cell = ws_detalle.cell(row=dst_row, column=c_idx)
        if type(cell).__name__ == 'MergedCell':
            continue
        cell.value = td['value']
        cell.font = copy.copy(td['font']) if td['font'] else empty_font
        cell.fill = copy.copy(td['fill']) if td['fill'] else empty_fill
        cell.border = copy.copy(td['border']) if td['border'] else empty_border
        cell.alignment = copy.copy(td['alignment']) if td['alignment'] else empty_alignment
        cell.number_format = td['number_format'] or 'General'


current_r = 2

for item in all_items:
    # Row 2 template (Idx 0) -> Black Category row
    apply_tpl_row_detalle(0, current_r)
    ws_detalle.cell(row=current_r, column=2).value = item.get('_cat_name', '')
    try:
        ws_detalle.merge_cells(start_row=current_r, start_column=2, end_row=current_r, end_column=9)
    except:
        pass
    current_r += 1

    # Row 3 template (Idx 1) -> Grey Item row
    apply_tpl_row_detalle(1, current_r)
    ws_detalle.cell(row=current_r, column=2).value = item.get('name', '')
    try:
        ws_detalle.merge_cells(start_row=current_r, start_column=2, end_row=current_r, end_column=9)
    except:
        pass
    current_r += 1

    header_row = current_r
    # Row 4 template (Idx 2) -> Purple Headers
    apply_tpl_row_detalle(2, current_r)
    current_r += 1

    subitems = item.get('subItems', [])
    if not subitems:
        subitems = [{'name': item.get('name', ''), 'description': '', 'quantity': item.get('quantity', 1),
                     'dates': item.get('dates', 1), 'unitCost': 0, 'providerName': ''}]
    else:
        # Asegurar que cualquier sub-ítem de Imprevistos se sitúe siempre al final
        subitems = sorted(subitems, key=lambda s: 1 if 'imprevisto' in str(s.get('name', '')).strip().lower() else 0)

    for sub in subitems:
        is_imprevisto = 'imprevisto' in str(sub.get('name', '')).strip().lower()
        if is_imprevisto:
            # Idx 5 = Plantilla fila Imprevistos (sombreada en amarillo FFFFFF00 y texto en negrita)
            apply_tpl_row_detalle(5, current_r)
            yellow_fill = copy.copy(template_block[5][1]['fill']) or PatternFill(start_color='FFFF00', end_color='FFFF00', fill_type='solid')
            # Pintar de amarillo las columnas entre B e I, excluyendo la columna H (8)
            for c_i in [2, 3, 4, 5, 6, 7, 9]:
                cell_to_fill = ws_detalle.cell(row=current_r, column=c_i)
                if yellow_fill:
                    cell_to_fill.fill = copy.copy(yellow_fill)
            ws_detalle.cell(row=current_r, column=8).fill = copy.copy(empty_fill)
        else:
            apply_tpl_row_detalle(3, current_r)

        ws_detalle.cell(row=current_r, column=2).value = sub.get('name', '')

        desc_cell = ws_detalle.cell(row=current_r, column=3)
        desc_text = sub.get('description', '') or sub.get('name', '')
        desc_cell.value = desc_text
        if desc_cell.alignment:
            new_align = copy.copy(desc_cell.alignment)
            new_align.wrap_text = True
            desc_cell.alignment = new_align
        else:
            desc_cell.alignment = Alignment(wrap_text=True, vertical='center')

        ws_detalle.cell(row=current_r, column=4).value = sub.get('quantity', 1)
        ws_detalle.cell(row=current_r, column=5).value = sub.get('dates', 1)
        ws_detalle.cell(row=current_r, column=6).value = sub.get('unitCost', 0)
        ws_detalle.cell(row=current_r, column=7).value = f"=D{current_r}*E{current_r}*F{current_r}"
        ws_detalle.cell(row=current_r, column=9).value = sub.get('providerName', '')
        current_r += 1

    total_row = current_r
    # Idx 6 = dark purple Total row
    apply_tpl_row_detalle(6, current_r)
    # Paint columns 2 to 6 with dark purple fill and font
    purple_fill = copy.copy(template_block[6][1]['fill'])
    purple_font = copy.copy(template_block[6][1]['font'])
    for c in range(2, 7):
        p_cell = ws_detalle.cell(row=current_r, column=c)
        if purple_fill:
            p_cell.fill = copy.copy(purple_fill)
        if purple_font:
            p_cell.font = copy.copy(purple_font)
    ws_detalle.cell(row=current_r, column=2).value = 'Total'
    ws_detalle.cell(row=current_r, column=7).value = f"=SUM(G{header_row + 1}:G{total_row - 1})"
    try:
        ws_detalle.merge_cells(start_row=current_r, start_column=2, end_row=current_r, end_column=6)
    except:
        pass
    current_r += 1

    cantidad_row = current_r
    # Idx 7 = Cantidad row
    apply_tpl_row_detalle(7, current_r)
    # Explicitly ensure columns 2, 3, 4 are empty with NO fill and NO border
    for c in range(2, 5):
        c_cell = ws_detalle.cell(row=current_r, column=c)
        c_cell.value = None
        c_cell.fill = empty_fill
        c_cell.border = empty_border
    item_qty = item.get('quantity', 1) or 1
    item_dates = item.get('dates', 1) or 1
    ws_detalle.cell(row=current_r, column=5).value = 'Cantidad'
    ws_detalle.cell(row=current_r, column=6).value = item_qty
    ws_detalle.cell(row=current_r, column=7).value = f"=G{total_row}/F{cantidad_row}/F{cantidad_row + 1}"
    current_r += 1

    fechas_row = current_r
    # Idx 8 = Fechas row
    apply_tpl_row_detalle(8, current_r)
    # Explicitly ensure columns 2, 3, 4, 7, 8, 9 are empty with NO fill and NO border
    for c in [2, 3, 4, 7, 8, 9]:
        c_cell = ws_detalle.cell(row=current_r, column=c)
        c_cell.value = None
        c_cell.fill = empty_fill
        c_cell.border = empty_border
    ws_detalle.cell(row=current_r, column=5).value = 'Fechas'
    ws_detalle.cell(row=current_r, column=6).value = item_dates
    current_r += 1

    # Store the row of Cantidad G cell to link from Cotizacion Interna
    item['g9_row'] = cantidad_row

    # Clean blank separator row
    for c in range(1, 12):
        s_cell = ws_detalle.cell(row=current_r, column=c)
        s_cell.value = None
        s_cell.fill = empty_fill
        s_cell.border = empty_border
    current_r += 1  # blank separator row


# ─── 3. Build dynamic item rows in Cotizacion Interna ────────────────────────
total_rows = 0
for cat in categories:
    total_rows += 1  # 1 row for category header
    total_rows += len(cat.get('items', []))

original_subtotal_row = None
for r in range(10, ws_interna.max_row + 1):
    val = ws_interna.cell(row=r, column=6).value
    if val and 'Sub Total' in str(val):
        original_subtotal_row = r
        break

if original_subtotal_row is None:
    original_subtotal_row = 12

available_rows = original_subtotal_row - 10

# Unmerge ALL rows >= 10
for mc in list(ws_interna.merged_cells.ranges):
    if mc.max_row >= 10:
        try:
            ws_interna.unmerge_cells(str(mc))
        except:
            pass

rows_to_insert = max(0, total_rows - available_rows)
if rows_to_insert > 0:
    ws_interna.insert_rows(10, rows_to_insert)

for r in range(10, 10 + max(total_rows, available_rows)):
    clear_row_values(ws_interna, r, col_count=28)

current_row = 10
item_counter = 1

for cat in categories:
    # Category Header row
    copy_row_format(ws_datos2, 5, ws_interna, current_row)
    apply_row_merges(ws_datos2, 5, ws_interna, current_row)
    safe_set(ws_interna, current_row, 6, cat.get('name', ''))
    current_row += 1

    for item in cat.get('items', []):
        r = current_row
        item['_interna_row'] = r  # Save exact row in Cotizacion Interna!
        copy_row_format(ws_datos2, 12, ws_interna, r)
        apply_row_merges(ws_datos2, 12, ws_interna, r)

        # Core item data
        safe_set(ws_interna, r, 5, item_counter)
        safe_set(ws_interna, r, 6, item.get('name', ''))
        safe_set(ws_interna, r, 7, item.get('quantity', 0))
        safe_set(ws_interna, r, 8, item.get('dates') or 1)

        # Details with preserved hyphens
        details_text = format_item_details(item)
        desc_cell = ws_interna.cell(row=r, column=9)
        if type(desc_cell).__name__ != 'MergedCell':
            desc_cell.value = details_text
            desc_cell.alignment = Alignment(wrap_text=True, vertical='center')

        # Link to Detalle Proveedor
        g9_row = item.get('g9_row')
        if g9_row:
            safe_set(ws_interna, r, 10, f"='Cot Interna - Detalle Proveedor'!G{g9_row}")

        # Formulas
        safe_set(ws_interna, r, 11, f"=G{r}*H{r}*J{r}")
        mult_pct = item.get('internalMultiplierPercent', 0) or 0
        safe_set(ws_interna, r, 12, mult_pct / 100 if mult_pct else 0)
        safe_set(ws_interna, r, 13, f"=K{r}*L{r}")
        fin_pct = item.get('financialExpensePercent', 10) or 10
        safe_set(ws_interna, r, 14, f"=K{r}*{fin_pct/100}")
        safe_set(ws_interna, r, 15, f"=IFERROR(P{r}/G{r}/H{r},0)")
        safe_set(ws_interna, r, 16, f"=ROUND(K{r}+M{r}+N{r},0)")
        safe_set(ws_interna, r, 25, f"=X{r}*G{r}*H{r}")
        safe_set(ws_interna, r, 26, f"=K{r}-Y{r}")

        prov_contact = item.get('providerContact', '')
        if not prov_contact:
            # Fallback a nombres de proveedores asignados en subItems
            prov_names = [s.get('providerName') for s in item.get('subItems', []) if s.get('providerName') and not 'imprevisto' in str(s.get('name', '')).lower()]
            if prov_names:
                prov_contact = ', '.join(dict.fromkeys(prov_names))

        safe_set(ws_interna, r, 19, prov_contact)
        safe_set(ws_interna, r, 20, item.get('productionTime', ''))

        item_counter += 1
        current_row += 1

# Totals in Cotizacion Interna
subtotal_row = original_subtotal_row + rows_to_insert
fee_row = subtotal_row + 1
total_interna_row = subtotal_row + 2

for row_n in [subtotal_row, fee_row, total_interna_row]:
    try:
        ws_interna.merge_cells(start_row=row_n, start_column=6, end_row=row_n, end_column=9)
    except:
        pass

try:
    ws_interna.merge_cells(
        start_row=subtotal_row, start_column=19,
        end_row=total_interna_row, end_column=21
    )
except:
    pass

safe_set(ws_interna, subtotal_row, 1, 1)
safe_set(ws_interna, subtotal_row, 6, 'Sub Total (Sin IGV)')
safe_set(ws_interna, subtotal_row, 11, '=SUM(INDIRECT("K10:K"&ROW()-1))')
safe_set(ws_interna, subtotal_row, 16, '=SUM(INDIRECT("P10:P"&ROW()-1))')
safe_set(ws_interna, subtotal_row, 19, 'PROVEEDORES')
safe_set(ws_interna, subtotal_row, 25, '=SUM(INDIRECT("Y10:Y"&ROW()-1))')
safe_set(ws_interna, subtotal_row, 26, '=SUM(INDIRECT("Z10:Z"&ROW()-1))')

safe_set(ws_interna, fee_row, 1, 1)
safe_set(ws_interna, fee_row, 6, 'Fee de Agencia (12%)')
safe_set(ws_interna, fee_row, 16, f"=P{subtotal_row}*0.12")

safe_set(ws_interna, total_interna_row, 1, 1)
safe_set(ws_interna, total_interna_row, 5, 1)
safe_set(ws_interna, total_interna_row, 6, 'Total (Sin IGV)')
safe_set(ws_interna, total_interna_row, 11, f"=K{subtotal_row}")
safe_set(ws_interna, total_interna_row, 15, 'TOTAL')
safe_set(ws_interna, total_interna_row, 16, f"=P{fee_row}+P{subtotal_row}")
safe_set(ws_interna, total_interna_row, 25, f"=Y{subtotal_row}")

# Margin formulas (Presupuestado vs Real)
safe_set(ws_interna, 3, 16, f"=P{total_interna_row}-K{total_interna_row}")
safe_set(ws_interna, 3, 25, f"=P{total_interna_row}-Y{total_interna_row}")
safe_set(ws_interna, 4, 16, f"=IFERROR((P{total_interna_row}-K{total_interna_row})/K{total_interna_row},0)")
safe_set(ws_interna, 4, 25, f"=IFERROR((P{total_interna_row}-Y{total_interna_row})/Y{total_interna_row},0)")
safe_set(ws_interna, 5, 16, f"=IFERROR((P{total_interna_row}-K{total_interna_row})/P{total_interna_row},0)")
safe_set(ws_interna, 5, 25, f"=IFERROR((P{total_interna_row}-Y{total_interna_row})/P{total_interna_row},0)")


# ─── 4. Fill Cotización Cliente Sheet ────────────────────────────────────────
# Capture styles from template rows 16 (category) and 17 (item)
cat_template_cells = [copy.copy(ws_cliente.cell(row=16, column=c)) for c in range(1, 10)]
item_template_cells = [copy.copy(ws_cliente.cell(row=17, column=c)) for c in range(1, 10)]

# Header formulas in Cotización Cliente linked dynamically to Cotizacion Interna
ws_cliente['A1'] = "='Cotizacion Interna'!G1"
ws_cliente['G3'] = "=IF('Cotizacion Interna'!K2=\"\",\"\",'Cotizacion Interna'!K2)"
ws_cliente['G4'] = "=CONCATENATE(\"RUC\",\":\",\" \",'Cotizacion Interna'!K3)"
ws_cliente['H7'] = "=IF('Cotizacion Interna'!G5=\"\",\"\",'Cotizacion Interna'!G5)"
ws_cliente['H8'] = '=IFERROR(H7+7,"")'
ws_cliente['D11'] = "=IF('Cotizacion Interna'!G2>0,'Cotizacion Interna'!G2,\"\")"
ws_cliente['D12'] = "=IF('Cotizacion Interna'!G3>0,'Cotizacion Interna'!G3,\"\")"
ws_cliente['D13'] = "=IF('Cotizacion Interna'!G4>0,'Cotizacion Interna'!G4,\"\")"

currency = data.get('currency', 'PEN')
currency_label = 'Soles' if currency == 'PEN' else 'Dólares'
exchange_rate = data.get('exchangeRate', 1.0)

original_subtotal_row_cliente = 18
for r in range(15, ws_cliente.max_row + 1):
    val = ws_cliente.cell(row=r, column=3).value
    if val and 'Sub Total' in str(val):
        original_subtotal_row_cliente = r
        break

data_start_c = 16
# Rows needed in client sheet: 1 row per category + 1 row per item
rows_needed_c = sum(1 + len(cat.get('items', [])) for cat in categories)
available_c = original_subtotal_row_cliente - data_start_c
rows_to_insert_c = max(0, rows_needed_c - available_c)

# Unmerge rows >= 16 in client sheet
for mc in list(ws_cliente.merged_cells.ranges):
    if mc.max_row >= data_start_c:
        try:
            ws_cliente.unmerge_cells(str(mc))
        except:
            pass

if rows_to_insert_c > 0:
    ws_cliente.insert_rows(data_start_c, rows_to_insert_c)

for r in range(data_start_c, data_start_c + max(rows_needed_c, available_c)):
    clear_row_values(ws_cliente, r, col_count=10)

cur_r_c = data_start_c
for cat in categories:
    # 1. Category row in client sheet
    r_cat = cur_r_c
    for c_idx in range(1, 10):
        src_c = cat_template_cells[c_idx - 1]
        dst_c = ws_cliente.cell(row=r_cat, column=c_idx)
        copy_cell_style(src_c, dst_c)
    ws_cliente.row_dimensions[r_cat].height = 28
    safe_set(ws_cliente, r_cat, 3, cat.get('name', ''))
    try:
        ws_cliente.merge_cells(start_row=r_cat, start_column=3, end_row=r_cat, end_column=6)
    except:
        pass
    cur_r_c += 1

    # 2. Item rows in client sheet
    for item in cat.get('items', []):
        r_item = cur_r_c
        for c_idx in range(1, 10):
            src_c = item_template_cells[c_idx - 1]
            dst_c = ws_cliente.cell(row=r_item, column=c_idx)
            copy_cell_style(src_c, dst_c)

        interna_row = item.get('_interna_row', 10)

        safe_set(ws_cliente, r_item, 3, item.get('name', ''))
        safe_set(ws_cliente, r_item, 4, item.get('quantity', 1))
        safe_set(ws_cliente, r_item, 5, item.get('dates', 1) or 1)

        # Build detail with hyphens preserved
        detail_text_c = format_item_details(item)
        desc_cell_c = ws_cliente.cell(row=r_item, column=6)
        desc_cell_c.value = detail_text_c
        desc_cell_c.alignment = Alignment(wrap_text=True, vertical='center')

        # Link to Cotizacion Interna
        safe_set(ws_cliente, r_item, 7, f"='Cotizacion Interna'!O{interna_row}")
        safe_set(ws_cliente, r_item, 8, f"='Cotizacion Interna'!P{interna_row}")

        cur_r_c += 1

# Subtotals in Cotización Cliente
subtotal_r_c = original_subtotal_row_cliente + rows_to_insert_c
fee_r_c = subtotal_r_c + 1
total_r_c = subtotal_r_c + 2

# Re-merge C:F for totals in client sheet
for r_tot in [subtotal_r_c, fee_r_c, total_r_c]:
    try:
        ws_cliente.merge_cells(start_row=r_tot, start_column=3, end_row=r_tot, end_column=6)
    except:
        pass

safe_set(ws_cliente, subtotal_r_c, 3, 'Sub Total (Sin IGV)')
safe_set(ws_cliente, subtotal_r_c, 8, f"='Cotizacion Interna'!P{subtotal_row}")

safe_set(ws_cliente, fee_r_c, 3, 'Fee de Agencia (12%)')
safe_set(ws_cliente, fee_r_c, 8, f"='Cotizacion Interna'!P{fee_row}")

safe_set(ws_cliente, total_r_c, 3, 'Total (Sin IGV)')
safe_set(ws_cliente, total_r_c, 7, 'TOTAL')
safe_set(ws_cliente, total_r_c, 8, f"='Cotizacion Interna'!P{total_interna_row}")

# Conditions rows below totals (re-merge condition cells)
cond_r = total_r_c + 4
payment_cond = data.get('paymentConditions', '30 días de crédito.')
currency_note = f"2. Tipo de Moneda: {currency_label}."
if currency == 'USD' and exchange_rate and exchange_rate != 1.0:
    currency_note += f" (TC: S/ {exchange_rate:.2f})"

conditions_list = [
    ('CONDICIONES DE VENTA:', 2, 5),
    ('1. Los Precios no incluyen IGV.', 2, 5),
    (currency_note, 2, 5),
    (f"3. Condiciones de pago: {payment_cond}", 2, 10),
    ('4. Comprobante de pago: Factura.', 2, 5),
    ('5. Cualquier variación en las cantidades y/o características de esta proforma, afectará el precio final.', 2, 9),
]

for idx, (c_text, start_col, end_col) in enumerate(conditions_list):
    r_target = cond_r + idx
    safe_set(ws_cliente, r_target, start_col, c_text)
    try:
        ws_cliente.merge_cells(start_row=r_target, start_column=start_col, end_row=r_target, end_column=end_col)
    except:
        pass

# Force full recalculation on load
wb.calculation.fullCalcOnLoad = True

wb.save(output_path)

# ─── 5. Restore original drawings and template assets (buttons, macros, media) ──
try:
    with zipfile.ZipFile(template_path, 'r') as z_tmpl:
        tmpl_files = {item.filename: item for item in z_tmpl.infolist()}
        d1_bytes = z_tmpl.read('xl/drawings/drawing1.xml') if 'xl/drawings/drawing1.xml' in tmpl_files else None
        d2_bytes = z_tmpl.read('xl/drawings/drawing2.xml') if 'xl/drawings/drawing2.xml' in tmpl_files else None

        temp_zip = output_path + '.tmp'
        with zipfile.ZipFile(output_path, 'r') as z_in:
            existing_names = set(z_in.namelist())
            with zipfile.ZipFile(temp_zip, 'w', compression=zipfile.ZIP_DEFLATED) as z_out:
                for item in z_in.infolist():
                    if item.filename == 'xl/drawings/drawing1.xml' and d1_bytes:
                        z_out.writestr(item, d1_bytes)
                    elif item.filename == 'xl/drawings/drawing2.xml' and d2_bytes:
                        z_out.writestr(item, d2_bytes)
                    else:
                        z_out.writestr(item, z_in.read(item.filename))

                # Inject any missing assets from template dropped by openpyxl (e.g. xl/media/image3.png, drawing3.xml, printerSettings)
                for fname, item in tmpl_files.items():
                    if fname not in existing_names:
                        # Skip generated worksheets, calcChain, and sharedStrings
                        if fname.startswith('xl/worksheets/sheet') and fname.endswith('.xml'):
                            continue
                        if fname in ('xl/calcChain.xml', 'xl/sharedStrings.xml'):
                            continue
                        if fname.startswith('xl/worksheets/_rels/sheet') and fname in existing_names:
                            continue
                        z_out.writestr(item, z_tmpl.read(fname))

        os.replace(temp_zip, output_path)
except Exception as e:
    print(f"WARN: Error restoring drawing buttons: {e}", file=sys.stderr)

print(f"OK:{output_path}")
