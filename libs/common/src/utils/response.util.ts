export interface PaginatedMeta {
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  meta?: PaginatedMeta;
  errors?: string | string[] | null;
}

export function successResponse<T>(data: T, meta?: PaginatedMeta): ApiResponse<T> {
  return { success: true, data, meta, errors: null };
}

export function paginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  perPage: number,
): ApiResponse<T[]> {
  return {
    success: true,
    data,
    meta: {
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    },
    errors: null,
  };
}

export function errorResponse(errors: string | string[]): ApiResponse<null> {
  return { success: false, data: null, errors };
}

export interface PaginationQuery {
  page?: number;
  perPage?: number;
}

export function parsePagination(query: PaginationQuery): { skip: number; take: number; page: number; perPage: number } {
  const page = Math.max(1, Number(query.page) || 1);
  const perPage = Math.min(100, Math.max(1, Number(query.perPage) || 20));
  return { skip: (page - 1) * perPage, take: perPage, page, perPage };
}
