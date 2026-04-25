"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSlug = generateSlug;
exports.generateBillNumber = generateBillNumber;
exports.generateSKU = generateSKU;
function generateSlug(name) {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 50);
}
function generateBillNumber(prefix, sequence) {
    return `${prefix}-${new Date().getFullYear()}-${String(sequence).padStart(5, '0')}`;
}
function generateSKU(name, category) {
    const nameCode = name.substring(0, 3).toUpperCase().replace(/\s/g, '');
    const catCode = category.substring(0, 3).toUpperCase().replace(/\s/g, '');
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${catCode}-${nameCode}-${rand}`;
}
