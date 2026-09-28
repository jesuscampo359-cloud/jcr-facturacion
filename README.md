# JCR Telecomunicaciones — Sistema de facturación

## Incluye
- Dashboard
- Clientes
- Planes
- Facturación mensual
- Registro de pagos y cartera
- WhatsApp mediante enlaces `wa.me`
- Usuarios y roles (Administrador / Operador)
- Exportación de clientes a Excel
- Base de datos SQLite centralizada
- Interfaz adaptable a PC, tablet y Android

## Planes iniciales
- 5 Mbps Residencial — $40.000
- 6 Mbps Residencial — $50.000
- 7 Mbps Residencial — $60.000

## Instalación
Requiere Node.js 18+.

```bash
npm install
npm start
```

Abrir: http://localhost:3000

Usuario inicial:
- usuario: `admin`
- contraseña: `admin123`

**Cambiar la contraseña y `JWT_SECRET` antes de ponerla en producción.**

## Nube
La aplicación está preparada como aplicación web Node.js. Para uso desde cualquier dispositivo debe desplegarse en un servidor/cloud con almacenamiento persistente y HTTPS. La base central queda en `data/jcr.db`; Excel funciona como importación/exportación/respaldo, no como base multiusuario en tiempo real.
