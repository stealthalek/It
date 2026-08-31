const ALL_PERMISSIONS = [
  'automations_manage',
  'holidays_manage',
  'canned_responses_manage',
  'templates_manage',
  'onboarding_catalog_manage',
  'assets_delete',
  'audit_view',
  'reports_view',
  'tickets_delete',
];

function resolvePermissions(user) {
  if (user.role === 'admin' && !user.role_id) return ALL_PERMISSIONS;
  if (Array.isArray(user.role_permissions)) return user.role_permissions;
  return [];
}

function hasPermission(user, key) {
  if (!user) return false;
  if (user.is_super_admin) return true;
  const perms = Array.isArray(user.permissions) ? user.permissions : resolvePermissions(user);
  return perms.includes(key);
}

function requirePermission(key) {
  return (req, res, next) => {
    if (!hasPermission(req.user, key)) {
      return res.status(403).json({ error: 'Permessi insufficienti' });
    }
    next();
  };
}

module.exports = { ALL_PERMISSIONS, resolvePermissions, hasPermission, requirePermission };
