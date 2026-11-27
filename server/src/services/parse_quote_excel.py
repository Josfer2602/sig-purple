import sys
import json
import re
import unicodedata
import os

_current_dir = os.path.dirname(os.path.abspath(__file__))
_vendor_candidates = [
    os.path.join(_current_dir, 'vendor'),
    os.path.join(_current_dir, '..', 'vendor'),
    os.path.join(os.getcwd(), 'server', 'src', 'services', 'vendor'),
    os.path.join(os.getcwd(), 'src', 'services', 'vendor'),
]
for _vd in _vendor_candidates:
    if os.path.isdir(_vd) and _vd not in sys.path:
        sys.path.insert(0, _vd)

import openpyxl

def norm(s):
    if not s:
        return ""
    s = unicodedata.normalize("NFD", str(s).lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn").strip()

def clean_tokens(s):
    s = re.sub(r'\(.*?\)', '', str(s or ''))
    s = norm(s)
    tokens = set(re.findall(r'[a-z0-9]+', s))
    stopwords = {'de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'para', 'con', 'un', 'una'}
    return tokens - stopwords

def clean_str(s):
    s = re.sub(r'\(.*?\)', '', str(s or ''))
    s = norm(s)
    s = re.sub(r'[^a-z0-9\s]', ' ', s)
    return ' '.join(s.split())

def find_sheet(wb, keywords):
    for name in wb.sheetnames:
        n_clean = norm(name)
        if all(k in n_clean for k in keywords):
            return wb[name]
    return None

def parse_excel_quote(filepath):
    wb = openpyxl.load_workbook(filepath, data_only=True)
    
    ws_det = find_sheet(wb, ['detalle', 'proveedor']) or find_sheet(wb, ['detalle'])
    ws_int = find_sheet(wb, ['cotizacion', 'interna']) or find_sheet(wb, ['interna']) or wb.active
    
    metadata = {
        'client': '',
        'brand': '',
        'requirement': '',
        'date': '',
        'businessName': '',
        'paymentConditions': ''
    }
    
    if ws_int:
        try:
            metadata['client'] = str(ws_int['G2'].value or '').strip()
            metadata['brand'] = str(ws_int['G3'].value or '').strip()
            metadata['requirement'] = str(ws_int['G4'].value or '').strip()
            metadata['date'] = str(ws_int['G5'].value or '').strip()
            metadata['businessName'] = str(ws_int['K2'].value or '').strip()
            metadata['paymentConditions'] = str(ws_int['K4'].value or '').strip()
        except Exception:
            pass

    # 1. Parse Detalle Proveedor if present
    # Store list of blocks: [ { 'category': ..., 'item': ..., 'subItems': [...] } ]
    detalle_blocks = []
    if ws_det:
        current_cat_name = ''
        current_item_name = ''
        collecting_subitems = False
        current_subitems = []
        
        for r in range(1, ws_det.max_row + 1):
            col2 = ws_det.cell(r, 2).value
            col3 = ws_det.cell(r, 3).value
            col4 = ws_det.cell(r, 4).value
            col5 = ws_det.cell(r, 5).value
            col6 = ws_det.cell(r, 6).value
            col7 = ws_det.cell(r, 7).value
            col9 = ws_det.cell(r, 9).value
            
            val2_str = str(col2).strip() if col2 is not None else ''
            val3_str = str(col3).strip() if col3 is not None else ''
            val5_str = str(col5).strip() if col5 is not None else ''
            
            # Check for Header row ('Sub Ítem', 'Sub Item')
            if 'sub' in val2_str.lower() and ('item' in norm(val2_str)):
                collecting_subitems = True
                continue
                
            # Check for Total or Cantidad (end of subitems)
            if 'total' in val2_str.lower() or val5_str.lower() == 'cantidad':
                if current_item_name and current_subitems:
                    detalle_blocks.append({
                        'category': current_cat_name,
                        'item': current_item_name,
                        'subItems': list(current_subitems),
                        'used': False
                    })
                collecting_subitems = False
                current_subitems = []
                continue
                
            # If collecting subitems
            if collecting_subitems:
                if val2_str or val3_str:
                    # Ignore rows where col2 is purely numeric (like subtotal)
                    try:
                        float(val2_str)
                        continue
                    except ValueError:
                        pass
                    
                    try:
                        q_val = float(col4) if col4 is not None else 1.0
                    except (ValueError, TypeError):
                        q_val = 1.0
                        
                    try:
                        d_val = float(col5) if col5 is not None else 1.0
                    except (ValueError, TypeError):
                        d_val = 1.0
                        
                    try:
                        u_val = float(col6) if col6 is not None else 0.0
                    except (ValueError, TypeError):
                        u_val = 0.0

                    try:
                        t_val = float(col7) if col7 is not None else 0.0
                    except (ValueError, TypeError):
                        t_val = 0.0

                    # Fallback: if unit cost is 0 or empty but total cost > 0, calculate unit cost
                    if (u_val == 0.0 or u_val is None) and t_val > 0.0:
                        denom = (q_val * d_val) if (q_val * d_val) > 0 else 1.0
                        u_val = round(t_val / denom, 2)
                    
                    sub_name = val2_str or val3_str
                    if 'imprevisto' in norm(sub_name):
                        sub_name = 'Imprevistos'

                    sub = {
                        'name': sub_name,
                        'description': val3_str if (val3_str != val2_str and 'imprevisto' not in norm(val3_str)) else '',
                        'quantity': q_val,
                        'dates': d_val,
                        'unitCost': u_val,
                        'providerName': str(col9).strip() if col9 else ''
                    }
                    current_subitems.append(sub)
                continue
                
            # Detect Category and Item rows
            if val2_str and col3 is None and col4 is None and col5 is None:
                # Lookahead to see if next row is the header
                next_val2 = ws_det.cell(r + 1, 2).value
                next_str = str(next_val2 or '').strip()
                if 'sub' in next_str.lower() and ('item' in norm(next_str)):
                    current_item_name = val2_str
                else:
                    current_cat_name = val2_str

        # Flush any trailing subitems if sheet ended without explicit Total
        if collecting_subitems and current_item_name and current_subitems:
            detalle_blocks.append({
                'category': current_cat_name,
                'item': current_item_name,
                'subItems': list(current_subitems),
                'used': False
            })

    # 2. Parse Cotizacion Interna (Category headers, items, multipliers)
    categories = []
    current_cat = None
    
    start_row = 10
    # Search for header row if row 10 doesn't seem right
    for r in range(1, 15):
        c6 = ws_int.cell(r, 6).value
        if c6 and any(k in norm(str(c6)) for k in ['descripcion', 'concepto', 'item']):
            start_row = r + 1
            break
            
    item_index = 0
    
    for r in range(start_row, ws_int.max_row + 1):
        col5 = ws_int.cell(r, 5).value # Counter (1, 1.1, 2, 2.1)
        col6 = ws_int.cell(r, 6).value # Name
        if not col6:
            continue
        name_str = str(col6).strip()
        n_clean = norm(name_str)
        if any(k in n_clean for k in ['sub total', 'total general', 'fee de agencia', 'fee agencia']):
            break
            
        qty_val = ws_int.cell(r, 7).value
        # If col7 (Quantity) is empty/None, this is a Category Header!
        if qty_val is None or str(qty_val).strip() == '':
            current_cat = {
                'name': name_str,
                'items': []
            }
            categories.append(current_cat)
        else:
            # This is an Item row!
            if current_cat is None:
                current_cat = {'name': 'General', 'items': []}
                categories.append(current_cat)
                
            try:
                qty = float(qty_val)
            except (ValueError, TypeError):
                qty = 1.0
                
            try:
                dates = float(ws_int.cell(r, 8).value or 1.0)
            except (ValueError, TypeError):
                dates = 1.0
                
            desc = ws_int.cell(r, 9).value or ''
            
            try:
                unit_cost = float(ws_int.cell(r, 10).value or 0.0)
            except (ValueError, TypeError):
                unit_cost = 0.0
                
            try:
                mult = float(ws_int.cell(r, 12).value or 0.0)
                if mult and mult < 1.0:
                    mult = mult * 100.0
            except (ValueError, TypeError):
                mult = 10.0
                
            contact = ws_int.cell(r, 19).value or ''
            prod_time = ws_int.cell(r, 20).value or ''
            
            details = []
            for raw_line in str(desc).replace('\r\n', '\n').replace('\r', '\n').split('\n'):
                s_strip = raw_line.strip()
                if not s_strip:
                    continue
                if s_strip.startswith('*'):
                    if raw_line.startswith('  *') or raw_line.startswith('\t') or raw_line.startswith('   '):
                        details.append('  * ' + s_strip.lstrip('*').strip())
                    else:
                        details.append('* ' + s_strip.lstrip('*').strip())
                elif s_strip.startswith('-'):
                    details.append('- ' + s_strip.lstrip('-').strip())
                elif s_strip.startswith('•'):
                    details.append('• ' + s_strip.lstrip('•').strip())
                else:
                    details.append(s_strip)
            
            # Multi-tier matching against Detalle Proveedor blocks:
            matched_subs = None
            matched_block = None
            it_norm = norm(name_str)
            it_clean = clean_str(name_str)
            it_toks = clean_tokens(name_str)
            cat_norm = norm(current_cat['name'])

            # Tier 1: exact category + item name on unused blocks
            for b in detalle_blocks:
                if not b.get('used') and norm(b['item']) == it_norm and norm(b['category']) == cat_norm:
                    matched_block = b
                    break

            # Tier 2: exact item name on unused blocks
            if not matched_block:
                for b in detalle_blocks:
                    if not b.get('used') and norm(b['item']) == it_norm:
                        matched_block = b
                        break

            # Tier 3: clean string match (without parentheses, dates, punctuation)
            if not matched_block:
                for b in detalle_blocks:
                    if not b.get('used') and clean_str(b['item']) == it_clean:
                        matched_block = b
                        break

            # Tier 4: containment on clean string
            if not matched_block:
                for b in detalle_blocks:
                    if not b.get('used'):
                        b_clean = clean_str(b['item'])
                        if (b_clean and b_clean in it_clean) or (it_clean and it_clean in b_clean):
                            matched_block = b
                            break

            # Tier 5: token overlap >= 50%
            if not matched_block and it_toks:
                for b in detalle_blocks:
                    if not b.get('used'):
                        b_toks = clean_tokens(b['item'])
                        if b_toks:
                            common = it_toks & b_toks
                            ratio = len(common) / max(len(it_toks), len(b_toks))
                            if ratio >= 0.5 or (len(it_toks) == 1 and len(common) == 1):
                                matched_block = b
                                break

            # Tier 6: sequential positional fallback (since Cotizacion Interna and Detalle Proveedor are in 1-to-1 order)
            if not matched_block:
                if item_index < len(detalle_blocks) and not detalle_blocks[item_index].get('used'):
                    matched_block = detalle_blocks[item_index]
                else:
                    for b in detalle_blocks:
                        if not b.get('used'):
                            matched_block = b
                            break

            if matched_block:
                matched_block['used'] = True
                matched_subs = matched_block['subItems']

            item_index += 1

            if not matched_subs:
                matched_subs = [{
                    'name': name_str,
                    'description': '',
                    'quantity': qty,
                    'dates': dates,
                    'unitCost': unit_cost,
                    'providerName': ''
                }]
                
            has_imp = any('imprevisto' in str(s.get('name', '')).strip().lower() for s in matched_subs)
            if not has_imp:
                matched_subs.append({
                    'name': 'Imprevistos',
                    'description': '',
                    'quantity': 1,
                    'dates': 1,
                    'unitCost': 0.0,
                    'providerName': ''
                })
            matched_subs = sorted(matched_subs, key=lambda s: 1 if 'imprevisto' in str(s.get('name', '')).strip().lower() else 0)
                
            item = {
                'name': name_str,
                'quantity': qty,
                'dates': dates,
                'details': details,
                'internalMultiplierPercent': round(mult, 2) if mult else 10.0,
                'financialExpensePercent': 10.0,
                'providerContact': str(contact).strip() if contact else '',
                'productionTime': str(prod_time).strip() if prod_time else '',
                'subItems': matched_subs
            }
            current_cat['items'].append(item)
            
    # Remove empty categories if any
    categories = [c for c in categories if len(c['items']) > 0]
    
    return {
        'metadata': metadata,
        'categories': categories
    }

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python parse_quote_excel.py <input_excel> <output_json>")
        sys.exit(1)
        
    in_file = sys.argv[1]
    out_file = sys.argv[2]
    
    res = parse_excel_quote(in_file)
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(res, f, ensure_ascii=False, indent=2)
    print(f"OK: {len(res['categories'])} categories extracted")
