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
export declare function successResponse<T>(data: T, meta?: PaginatedMeta): ApiResponse<T>;
export declare function paginatedResponse<T>(data: T[], total: number, page: number, perPage: number): ApiResponse<T[]>;
export declare function errorResponse(errors: string | string[]): ApiResponse<null>;
export interface PaginationQuery {
    page?: number;
    perPage?: number;
}
export declare function parsePagination(query: PaginationQuery): {
    skip: number;
    take: number;
    page: number;
    perPage: number;
};
