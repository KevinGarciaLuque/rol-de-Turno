const jwt = require('jsonwebtoken');

// En producción esto DEBE venir de una variable de entorno (Railway → Variables).
const JWT_SECRET = process.env.JWT_SECRET || 'rol-turno-dev-secret-cambiar-en-produccion';
const TOKEN_EXPIRES_IN = '12h';

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, full_name: user.full_name },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRES_IN }
  );
}

// Verifica el token y adjunta req.user. Bloquea si no hay sesión válida.
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
}

// Restringe a uno o varios roles. Uso: requireRole('admin') o requireRole('admin', 'supervisor')
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'No tienes permiso para esta acción' });
    }
    next();
  };
}

// ¿El usuario puede acceder a un área concreta?
// admin: todas. supervisor/jefe/lector: solo las asignadas en user_departments.
async function userCanAccessDepartment(db, user, departmentId) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const row = await db.get(
    'SELECT 1 FROM user_departments WHERE user_id = ? AND department_id = ?',
    [user.id, departmentId]
  );
  return !!row;
}

module.exports = { signToken, authenticate, requireRole, userCanAccessDepartment, JWT_SECRET };
