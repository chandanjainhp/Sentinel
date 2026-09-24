// ========== EVENT TYPES (industrial project) ==========
export const EVENT_TYPES = {
  EQUIPMENT_ANOMALY: 'equipment_anomaly',
  SCADA_ALARM: 'scada_alarm',
  SUPPLY_DELAY: 'supply_delay',
  SAFETY_INCIDENT: 'safety_incident',
};

export const EVENT_TYPE_VALUES = Object.values(EVENT_TYPES);

// ========== SEVERITY LEVELS ==========
export const SEVERITY_LEVELS = {
  SERIOUS: 'serious',
  MINOR: 'minor',
  HARMLESS: 'harmless',
  UNCERTAIN: 'uncertain',
};

export const SEVERITY_VALUES = Object.values(SEVERITY_LEVELS);

// ========== INCIDENT STATUS ==========
export const INCIDENT_STATUS = {
  OPEN: 'open',
  INVESTIGATING: 'investigating',
  REVIEWED: 'reviewed',
  ESCALATED: 'escalated',
  CLOSED: 'closed',
};

export const INCIDENT_STATUS_VALUES = Object.values(INCIDENT_STATUS);

// ========== INVESTIGATION STATUS ==========
export const INVESTIGATION_STATUS = {
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETE: 'complete',
  FAILED: 'failed',
};

export const INVESTIGATION_STATUS_VALUES = Object.values(INVESTIGATION_STATUS);

// ========== BRIEFING STATUS ==========
export const BRIEFING_STATUS = {
  DRAFT: 'draft',
  GENERATING: 'generating',
  APPROVED: 'approved',
  FAILED: 'failed',
};

export const BRIEFING_STATUS_VALUES = Object.values(BRIEFING_STATUS);

// ========== BRIEFING SECTIONS ==========
export const BRIEFING_SECTIONS = {
  EXECUTIVE_SUMMARY: 'executive_summary',
  INCIDENTS: 'incidents',
  RECOMMENDATIONS: 'recommendations',
  ANOMALIES: 'anomalies',
  FOLLOW_UP: 'follow_up',
};

export const BRIEFING_SECTION_VALUES = Object.values(BRIEFING_SECTIONS);

// ========== AI CONFIGURATION ==========
export const AI_CONFIG = {
  CLAUDE_MODEL: 'claude-sonnet-4-20250514',
  MAX_TOOL_CALLS: 12,
  MAX_TOKENS_PER_CALL: 2000,
  INVESTIGATION_CONCURRENCY: 3,
};

// ========== QUEUE NAMES ==========
export const QUEUE_NAMES = {
  INVESTIGATION_QUEUE: 'investigations',
  EVENT_QUEUE: 'events',
};

// ========== REDIS KEY PREFIXES ==========
export const REDIS_KEY_PREFIXES = {
  AGENT_STATE_PREFIX: 'agent:state:',
  AGENT_CONV_PREFIX: 'agent:conv:',
  SITE_FACTS_PREFIX: 'site:facts:',
};

// ========== SITE CONFIGURATION ==========
export const SITE_CONFIG = {
  DEFAULT_TIMEZONE: 'UTC',
};

// ========== TASK STATUS (Legacy) ==========
export const TaskStatusEnum = {
  TODO: 'todo',
  IN_PROGRESS: 'in_progress',
  DONE: 'done',
};

export const AvailableTaskStatues = Object.values(TaskStatusEnum);
