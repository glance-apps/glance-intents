export const RETURN_VARS = {
  COUNT_TODAY: '%dg_count_today',
  COUNT_OVERDUE: '%dg_count_overdue',
  COUNT_WEEK: '%dg_count_week',
  COUNT_TOTAL: '%dg_count_total',
  COUNT_INBOX: '%dg_count_inbox',
  IN_PROGRESS_TITLE: '%dg_in_progress_title',
  IN_PROGRESS_END: '%dg_in_progress_end',
  IN_PROGRESS_REMAINING_MIN: '%dg_in_progress_remaining_min',
  NEXT_TITLE: '%dg_next_title',
  NEXT_TIME: '%dg_next_time',
  // Populated by `complete` on ambiguous title match, not by `query`. Shares
  // the return-variable namespace because Tasker-style transports surface
  // all returned variables together regardless of which action set them.
  WARNING: '%dg_warning',
} as const;

export type ReturnVar = (typeof RETURN_VARS)[keyof typeof RETURN_VARS];

export const RETURN_VAR_TYPES: Record<ReturnVar, 'integer' | 'string'> = {
  [RETURN_VARS.COUNT_TODAY]: 'integer',
  [RETURN_VARS.COUNT_OVERDUE]: 'integer',
  [RETURN_VARS.COUNT_WEEK]: 'integer',
  [RETURN_VARS.COUNT_TOTAL]: 'integer',
  [RETURN_VARS.COUNT_INBOX]: 'integer',
  [RETURN_VARS.IN_PROGRESS_TITLE]: 'string',
  [RETURN_VARS.IN_PROGRESS_END]: 'string',
  [RETURN_VARS.IN_PROGRESS_REMAINING_MIN]: 'integer',
  [RETURN_VARS.NEXT_TITLE]: 'string',
  [RETURN_VARS.NEXT_TIME]: 'string',
  [RETURN_VARS.WARNING]: 'string',
};
