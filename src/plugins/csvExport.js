/**
 * Export data to CSV file and trigger download.
 * @param {Array<Object>} headers - Array of { title, key } column definitions
 * @param {Array<Object>} items - Array of row data objects
 * @param {string} filename - Name for the downloaded file
 */
export function exportToCsv(headers, items, filename = 'export.csv') {
  const csvHeaders = headers.map(h => h.title);

  const csvRows = items.map(item => {
    return headers.map(h => {
      const value = getNestedValue(item, h.key);
      const stringVal = value != null ? String(value) : '';
      // Escape quotes and wrap in quotes if contains comma/quote/newline
      if (stringVal.includes(',') || stringVal.includes('"') || stringVal.includes('\n')) {
        return `"${stringVal.replace(/"/g, '""')}"`;
      }
      return stringVal;
    }).join(',');
  });

  const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => {
    if (current == null) return undefined;
    // Handle array index notation like "versions[0]"
    const match = key.match(/^(\w+)\[(\d+)\]$/);
    if (match) {
      return current[match[1]]?.[parseInt(match[2])];
    }
    return current[key];
  }, obj);
}
