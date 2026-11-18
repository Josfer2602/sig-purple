import os
import re
import sys
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

sys.path.append('server/src/services')
from parse_quote_excel import parse_excel_quote

base_dir = r'G:\Unidades compartidas\Proyectos'

def win_path(p):
    abs_p = os.path.abspath(p)
    if not abs_p.startswith('\\\\?\\'):
        return '\\\\?\\' + abs_p
    return abs_p

def get_version_score(path_str):
    p_lower = path_str.lower()
    score = 1
    if 'aprobado' in p_lower or 'ok' in p_lower or 'v2_ ok' in p_lower:
        score += 100
    match = re.search(r'[vV](\d+)', path_str)
    if match:
        score += int(match.group(1))
    return score

def get_project_folder(root, cl_path, f):
    try:
        rel = os.path.relpath(root, win_path(cl_path))
    except Exception:
        rel = root
    parts = [p for p in rel.split(os.sep) if p and p != '.']
    parts_lower = [p.lower() for p in parts]
    
    # 1. Look for 'cuentas'
    for i, p in enumerate(parts_lower):
        if p == 'cuentas' and i > 0:
            return parts[i-1]
            
    # 2. Look for 'cotiz'
    for i, p in enumerate(parts_lower):
        if 'cotiz' in p and i > 0:
            if parts_lower[i-1] == 'cuentas' and i > 1:
                return parts[i-2]
            return parts[i-1]
            
    # 3. If version folder like V1, V2
    if len(parts) >= 2 and re.match(r'^v\d+', parts[-1], re.I):
        if len(parts) >= 3 and parts_lower[-2] in ['cuentas', 'cotización cliente', 'cotizacion cliente']:
            return parts[-3]
        return parts[-2]
        
    # 4. Fallback to valid non-technical parts
    valid_parts = [p for p in parts if p.lower() not in ['cuentas', 'cotización cliente', 'cotizacion cliente', 'producción', 'produccion', 'administrativo', 'diseño']]
    if valid_parts:
        return valid_parts[-1]
        
    return os.path.splitext(f)[0]

def collect_best_quotes():
    client_dirs = [d for d in os.listdir(base_dir) if os.path.isdir(os.path.join(base_dir, d))]
    projects_map = {}
    
    for cl in client_dirs:
        cl_path = os.path.join(base_dir, cl)
        for root, dirs, files in os.walk(win_path(cl_path)):
            for f in files:
                f_lower = f.lower()
                if ('cotiz' in f_lower or 'ppto' in f_lower or 'presupuesto' in f_lower) and f_lower.endswith(('.xlsm', '.xlsx')) and not f.startswith('~$'):
                    norm_root = root.lower()
                    if 'proveedor' in norm_root or 'producci' in norm_root or 'fotos' in norm_root:
                        continue
                    
                    full_path = os.path.join(root, f)
                    try:
                        proy_name = get_project_folder(root, cl_path, f)
                        v_score = get_version_score(full_path)
                        mtime = os.path.getmtime(full_path)
                        
                        opc_match = re.search(r'opc\w*\s*\d+', f_lower)
                        opc_suffix = opc_match.group(0).lower() if opc_match else ''
                        
                        key = (cl.lower(), proy_name.lower(), opc_suffix)
                        
                        if key not in projects_map:
                            projects_map[key] = (v_score, mtime, full_path, cl, proy_name, f)
                        else:
                            curr_score, curr_mtime, _, _, _, _ = projects_map[key]
                            if v_score > curr_score or (v_score == curr_score and mtime > curr_mtime):
                                projects_map[key] = (v_score, mtime, full_path, cl, proy_name, f)
                    except Exception:
                        pass
    return list(projects_map.values())

def parse_single_quote(item):
    v_score, mtime, file_path, client_name, proy_name, file_name = item
    try:
        clean_path = file_path.replace('\\\\?\\', '')
        parsed = parse_excel_quote(file_path)
        
        if not parsed or not parsed.get('categories') or len(parsed['categories']) == 0:
            return None
            
        return {
            'clientFolder': client_name,
            'projectFolder': proy_name,
            'fileName': file_name,
            'filePath': clean_path,
            'version': v_score % 100 if v_score >= 100 else v_score,
            'mtime': mtime,
            'metadata': parsed.get('metadata', {}),
            'categories': parsed.get('categories', [])
        }
    except Exception:
        return None

if __name__ == '__main__':
    t0 = time.time()
    print("Iniciando rastreo exhaustivo de cotizaciones en Google Drive...")
    candidates = collect_best_quotes()
    print(f"Candidatos encontrados: {len(candidates)}. Iniciando extraccion concurrente con 8 hilos...")
    
    results = []
    completed = 0
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(parse_single_quote, item): item for item in candidates}
        for future in as_completed(futures):
            completed += 1
            if completed % 50 == 0 or completed == len(candidates):
                print(f"  -> Progreso: {completed}/{len(candidates)} archivos procesados...")
            res = future.result()
            if res:
                results.append(res)
                
    t1 = time.time()
    print(f"\n=================================================")
    print(f"EXTRACCION COMPLETADA CON EXITO:")
    print(f" - Cotizaciones parseadas con exito: {len(results)} de {len(candidates)}")
    print(f" - Tiempo transcurrido: {t1 - t0:.2f} segundos")
    print(f"=================================================\n")
    
    out_file = 'server/extracted_quotes.json'
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"Guardado en {out_file} ({os.path.getsize(out_file)} bytes)")
