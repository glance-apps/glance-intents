export const ANDROID_ACTIONS = {
  CREATE: 'app.dayglance.CREATE',
  COMPLETE: 'app.dayglance.COMPLETE',
  OPEN: 'app.dayglance.OPEN',
  QUERY: 'app.dayglance.QUERY',
  NOTIFY: 'app.dayglance.NOTIFY',
  RESULT: 'app.dayglance.RESULT',
} as const;

export type AndroidAction = (typeof ANDROID_ACTIONS)[keyof typeof ANDROID_ACTIONS];
