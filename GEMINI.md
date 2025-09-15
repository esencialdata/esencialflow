# Metodología de Ingeniería de Contexto

Esta metodología describe un proceso sistemático para interactuar con un codebase, asegurando que las modificaciones sean seguras, consistentes y eficientes. Se contrapone al "vibe coding" o programación por intuición, que a menudo conduce a errores, inconsistencias y deuda técnica.

El principio fundamental es: **Nunca asumir. Siempre verificar.**

---

## Pasos Clave de la Ingeniería de Contexto

### 1. **Comprender la Solicitud y el Objetivo Final**
Antes de escribir o modificar código, es crucial entender completamente la meta del usuario.
- **Acción:** Descomponer la petición del usuario en objetivos concretos y requerimientos específicos.
- **Ejemplo:** Si el usuario pide "arreglar el login", se debe investigar qué significa "arreglar": ¿es un bug específico? ¿una nueva funcionalidad? ¿un cambio de estilo?

### 2. **Explorar y Mapear el Entorno Relevante**
Identificar todos los archivos y artefactos que se verán afectados por el cambio. No limitarse solo al archivo que parece más obvio.
- **Acción:** Usar herramientas como `glob` y `search_file_content` para localizar archivos relevantes, tests, configuraciones, y definiciones de dependencias.
- **Ejemplo:** Para un cambio en una función de `auth.py`, buscar `grep -r "nombre_de_la_funcion" .` para encontrar dónde se utiliza, y buscar `tests/test_auth.py` para entender cómo se prueba.

### 3. **Leer y Analizar el Código Existente**
Una vez identificados los archivos, leer su contenido para entender las convenciones, patrones de diseño y estilo del proyecto.
- **Acción:** Utilizar `read_file` o `read_many_files` para analizar la estructura del código, las importaciones, el formato, y la lógica de negocio.
- **Ejemplo:** Observar si el proyecto usa `async/await`, promesas o callbacks; si sigue un estilo de nombramiento específico (camelCase, snake_case); o si prefiere un framework particular.

### 4. **Formular un Plan Detallado**
Basado en el análisis, crear un plan paso a paso antes de realizar cualquier modificación. Para tareas complejas, compartir este plan con el usuario para su validación.
- **Acción:** Escribir una lista de cambios específicos. "1. Añadir la dependencia `X` en `requirements.txt`. 2. Modificar la función `Y` en `auth.py` para usar la nueva dependencia. 3. Actualizar `test_auth.py` para cubrir el nuevo caso de uso."
- **Ejemplo:** "Primero, leeré `src/api.js` para entender cómo se hacen las llamadas. Luego, crearé un nuevo componente en `src/components/NewFeature.jsx` replicando el estilo de `ExistingComponent.jsx`. Finalmente, añadiré una ruta en `App.js`."

### 5. **Ejecutar y Verificar Rigurosamente**
Implementar el plan y, de manera crítica, verificar que los cambios no hayan roto nada.
- **Acción:** Usar `replace` o `write_file` para aplicar los cambios. Inmediatamente después, ejecutar los comandos de verificación del proyecto (linters, formateadores, compiladores y, sobre todo, tests).
- **Ejemplo:** Después de modificar el código, ejecutar `npm run test`, `npm run lint` o `pytest`. Si los tests fallan, detenerse y corregir los problemas antes de continuar.

---

Al seguir estos pasos, se minimiza el riesgo, se respeta la arquitectura existente y se entrega un trabajo de mayor calidad de forma consistente.
