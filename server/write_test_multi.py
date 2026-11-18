import json

# Multi-item test: 2 categories, 3 items
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
                        {"name": "Carpintería", "description": "Armado de módulo principal", "quantity": 1, "dates": 1, "unitCost": 2000.0, "providerName": "Prov A"},
                        {"name": "Impresión de Viniles", "description": "Gráficas para módulo", "quantity": 1, "dates": 1, "unitCost": 500.0, "providerName": "Prov B"}
                    ]
                },
                {
                    "name": "Activación Promotoras",
                    "quantity": 2,
                    "dates": 3,
                    "details": "[\"Uniforme incluido\"]",
                    "providerContact": "María",
                    "productionTime": "1 semana",
                    "subItems": [
                        {"name": "Promotoras", "description": "Personal femenino 2 jornadas", "quantity": 2, "dates": 3, "unitCost": 150.0, "providerName": "Agencia X"}
                    ]
                }
            ]
        },
        {
            "name": "Logística",
            "items": [
                {
                    "name": "Transporte",
                    "quantity": 1,
                    "dates": 2,
                    "details": "[\"Camión de 3 toneladas\"]",
                    "providerContact": "Pedro",
                    "productionTime": "Inmediato",
                    "subItems": [
                        {"name": "Flete", "description": "Transporte Lima-Miraflores", "quantity": 1, "dates": 2, "unitCost": 400.0, "providerName": "Trans. Lima"}
                    ]
                }
            ]
        }
    ]
}

with open('test_data_multi.json', 'w', encoding='utf-8') as f:
    json.dump(test_data, f, ensure_ascii=False)
print("Written test_data_multi.json")
