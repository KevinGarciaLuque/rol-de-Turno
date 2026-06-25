// Registra una acción en la bitácora. Nunca lanza error para no interrumpir la operación principal.
async function log(db, user, action, entity, entityId, detail) {
  try {
    await db.run(
      'INSERT INTO bitacora (user_id, user_name, action, entity, entity_id, detail) VALUES (?,?,?,?,?,?)',
      [
        user?.id || null,
        user?.full_name || user?.username || 'Sistema',
        action,
        entity || null,
        entityId || null,
        JSON.stringify(detail || {}),
      ]
    );
  } catch (e) {
    console.error('[bitacora] Error al registrar:', e.message);
  }
}

module.exports = { log };
