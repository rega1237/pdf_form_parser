import json
import os

# Tu JSON original
# Usar ruta absoluta basada en la ubicación del script
script_dir = os.path.dirname(os.path.abspath(__file__))
json_path = os.path.join(script_dir, 'pre_action.json')

data = json.load(open(json_path))


# Encontrar todos los campos Pass/Fail
pass_fail_fields = [field for field in data if field["type"] == "Pass/Fail"]

# Contador para pass_photo
pass_photo_counter = 1

# Lista para almacenar los nuevos campos
new_pass_photo_fields = []

# Para cada campo Pass/Fail, crear un campo pass_photo correspondiente
for pass_fail_field in pass_fail_fields:
    # Verificar si ya existe un pass_photo para este section
    section_name = pass_fail_field["section_name"]
    page_number = pass_fail_field["page_number"]
    
    # Crear el nuevo campo pass_photo
    new_field = {
        "id": f"pass_photo_{pass_photo_counter}",
        "name": f"pass_photo_{pass_photo_counter}",
        "original_name": "Deficiency Field 377",
        "type": "pass_photo",
        "value": "",
        "human_label": f"pass_photo_{pass_photo_counter}",
        "label_name": "Pass Photo",
        "section_name": section_name,
        "page_number": page_number,
        "column_width": "9",
        "required": False,
        "photo_attachment_id": None
    }
    
    new_pass_photo_fields.append(new_field)
    pass_photo_counter += 1

# Insertar los nuevos campos en el JSON original después de sus respectivos campos Pass/Fail
for new_field in new_pass_photo_fields:
    section_name = new_field["section_name"]
    page_number = new_field["page_number"]
    
    # Encontrar el índice del campo Pass/Fail correspondiente
    for i, field in enumerate(data):
        if (field["type"] == "Pass/Fail" and 
            field["section_name"] == section_name and 
            field["page_number"] == page_number):
            
            # Insertar después del campo Pass/Fail
            data.insert(i + 1, new_field)
            break

# Guardar en un nuevo archivo JSON
with open('jsonpython.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print("Archivo jsonpython.json creado exitosamente!")