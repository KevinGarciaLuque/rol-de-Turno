# Rol de Turno — Hospital María Especialidades Pediátricas (HMEP)

Aplicación para la programación de turnos de enfermería del Hospital María Especialidades Pediátricas (áreas de Nefrología y Hemodiálisis). Permite editar el rol mensual, ver reportes de cobertura e **imprimir el rol con el formato oficial**.

## Stack

- **Frontend:** Expo SDK 56 (React Native) — web, Android e iOS desde un solo código
- **Backend:** Node.js + Express + SQLite
- **UI:** React Native Paper (Material Design 3) + React Navigation v7

## Estructura

```
.
├── backend/        API REST (puerto 3001)
│   └── src/        rutas, base de datos y seed
├── app/            App Expo (puerto 8081 en web)
│   └── src/        screens, components, utils, constants
└── start.bat       Inicia backend y frontend juntos
```

## Cómo iniciar

```bash
# 1. Instalar dependencias
cd backend && npm install
cd ../app && npm install

# 2. Iniciar todo (Windows)
start.bat
```

- API: http://localhost:3001/api/health
- Web: http://localhost:8081

## Imprimir el rol

En la pantalla **Horario**, el botón de impresora genera el rol con el formato oficial
del HMEP (encabezado con espacios para logos, rejilla a color, totales, conteos diarios,
firmas y leyenda) y abre el diálogo de impresión del navegador (impresora física o PDF).
El filtro de categoría activo determina qué hoja se imprime.

## Notas

- La base de datos (`backend/data/rolturno.db`) se genera automáticamente con el seed y no se versiona.
- Los logos del encabezado de impresión son marcadores que se reemplazan en `app/src/utils/printSchedule.js`.
