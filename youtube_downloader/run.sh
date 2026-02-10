#!/bin/bash

# Asegurar que estamos en el directorio del script
cd "$(dirname "$0")"

echo "=== Iniciando Youtube Downloader ==="

# Verificar si existe el entorno virtual
if [ ! -d "venv" ]; then
    echo "📦 Creando entorno virtual aislado (para evitar conflictos)..."
    python3 -m venv venv
    
    # Activar y actualizar pip
    source venv/bin/activate
    pip install --upgrade pip
    
    echo "⬇️  Instalando dependencias..."
    pip install -r requirements.txt
else
    # Activar si ya existe
    source venv/bin/activate
fi

# Ejecutar la aplicación
echo "🚀 Arrancando servidor..."
echo "---------------------------------------"
python app.py
