import AuditLog from '../models/auditLog.model.js';

// Action strings are stable identifiers, do not rename even during product rebranding.
export const logAudit = async (req, action, target, metadata = {}) => {
  try {
    if (!req.user) {
      console.warn('[Audit] Skipping audit log — no req.user found');
      return;
    }

    await AuditLog.create({
      actor: req.user._id,
      action,
      target,
      metadata,
      ip: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });
  } catch (error) {
    console.error('[Audit] Failed to write audit log:', error.message);
  }
};
