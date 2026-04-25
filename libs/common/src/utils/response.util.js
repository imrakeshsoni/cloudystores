"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.successResponse = successResponse;
exports.paginatedResponse = paginatedResponse;
exports.errorResponse = errorResponse;
exports.parsePagination = parsePagination;
function successResponse(data, meta) {
    return { success: true, data, meta, errors: null };
}
function paginatedResponse(data, total, page, perPage) {
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
function errorResponse(errors) {
    return { success: false, data: null, errors };
}
function parsePagination(query) {
    const page = Math.max(1, Number(query.page) || 1);
    const perPage = Math.min(100, Math.max(1, Number(query.perPage) || 20));
    return { skip: (page - 1) * perPage, take: perPage, page, perPage };
}
