export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
}

export function generateBillNumber(prefix: string, sequence: number): string {
  return `${prefix}-${new Date().getFullYear()}-${String(sequence).padStart(5, '0')}`;
}

export function generateSKU(name: string, category: string): string {
  const nameCode = name.substring(0, 3).toUpperCase().replace(/\s/g, '');
  const catCode = category.substring(0, 3).toUpperCase().replace(/\s/g, '');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${catCode}-${nameCode}-${rand}`;
}
