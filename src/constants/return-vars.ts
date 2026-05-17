// Query-specific return variables. Set by the `query` action when reading state.
// Spec: "Returned variables" table under the `query` action.
export const QUERY_RETURN_VARS = {
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
} as const;

// Universal return variables. Set by every inbound action (create/complete/open/query).
// Spec: "Return variables (inbound actions)" table.
export const UNIVERSAL_RETURN_VARS = {
  SUCCESS: '%dg_success',
  TASK_ID: '%dg_task_id',
  ERROR: '%dg_error',
  WARNING: '%dg_warning',
} as const;

// Combined namespace. Tasker-style transports surface every returned variable
// together regardless of which action set it; consumers index into this map.
export const RETURN_VARS = {
  ...QUERY_RETURN_VARS,
  ...UNIVERSAL_RETURN_VARS,
} as const;

export type QueryReturnVar = (typeof QUERY_RETURN_VARS)[keyof typeof QUERY_RETURN_VARS];
export type UniversalReturnVar = (typeof UNIVERSAL_RETURN_VARS)[keyof typeof UNIVERSAL_RETURN_VARS];
export type ReturnVar = QueryReturnVar | UniversalReturnVar;

export const RETURN_VAR_TYPES: Record<ReturnVar, 'integer' | 'string' | 'boolean'> = {
  [QUERY_RETURN_VARS.COUNT_TODAY]: 'integer',
  [QUERY_RETURN_VARS.COUNT_OVERDUE]: 'integer',
  [QUERY_RETURN_VARS.COUNT_WEEK]: 'integer',
  [QUERY_RETURN_VARS.COUNT_TOTAL]: 'integer',
  [QUERY_RETURN_VARS.COUNT_INBOX]: 'integer',
  [QUERY_RETURN_VARS.IN_PROGRESS_TITLE]: 'string',
  [QUERY_RETURN_VARS.IN_PROGRESS_END]: 'string',
  [QUERY_RETURN_VARS.IN_PROGRESS_REMAINING_MIN]: 'integer',
  [QUERY_RETURN_VARS.NEXT_TITLE]: 'string',
  [QUERY_RETURN_VARS.NEXT_TIME]: 'string',
  [UNIVERSAL_RETURN_VARS.SUCCESS]: 'boolean',
  [UNIVERSAL_RETURN_VARS.TASK_ID]: 'string',
  [UNIVERSAL_RETURN_VARS.ERROR]: 'string',
  [UNIVERSAL_RETURN_VARS.WARNING]: 'string',
};
