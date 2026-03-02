export interface ApiErrorBody {
  code: string;
  message: string;
  requestId: string;
}

export const buildErrorResponse = (requestId: string, code: string, message: string): ApiErrorBody => ({
  code,
  message,
  requestId
});
