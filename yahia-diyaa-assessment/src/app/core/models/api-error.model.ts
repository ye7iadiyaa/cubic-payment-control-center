export interface ApiErrorBody {
  code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'STALE_VERSION' | 'VALIDATION_ERROR' | 'UNEXPECTED_ERROR' | 'NOT_FOUND';
  message: string;
  currentRowVersion?: number;
  fieldErrors?: Record<string, string>;
}
