import sys
sys.path.insert(0, '.')

# Simulate running with real data
import json

# Read last temp file if exists, else create test data
test_data = {
    "client": "TechCorp S.A.",
    "brand": "TechCompBrand",
    "requirement": "Activación BTL Mall",
    "date": "2026-07-25",
    "categories": [
        {
            "name": "Producción BTL",
            "items": [
                {
                    "name": "Módulo de Exhibición",
                    "quantity": 1,
                    "dates": 1,
                    "details": "[\"Estructura de madera\", \"Iluminación LED\"]",
                    "providerContact": "Carlos",
                    "productionTime": "3 días",
                    "subItems": [
                        {
                            "name": "Carpintería",
                            "description": "Armado de módulo principal",
                            "quantity": 1,
                            "dates": 1,
                            "unitCost": 2000.0,
                            "providerName": "Prov123"
                        },
                        {
                            "name": "Impresión de Viniles",
                            "description": "Gráficas para módulo",
                            "quantity": 1,
                            "dates": 1,
                            "unitCost": 500.0,
                            "providerName": "Prov123"
                        }
                    ]
                }
            ]
        }
    ]
}

with open('test_data_manual.json', 'w', encoding='utf-8') as f:
    json.dump(test_data, f, ensure_ascii=False)

print("Test data written to test_data_manual.json")
