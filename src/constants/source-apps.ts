export const SOURCE_APPS = {
  DAYGLANCE: 'app.dayglance',
  LASTGLANCE: 'app.lastglance',
  LIFEGLANCE: 'app.lifeglance',
} as const;

export type SourceApp = (typeof SOURCE_APPS)[keyof typeof SOURCE_APPS];
