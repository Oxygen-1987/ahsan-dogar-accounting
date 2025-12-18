// src/utils/searchUtils.ts
export const searchUtils = {
  // Debounce search function
  debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  },

  // Highlight search terms in text
  highlightText(text: string, query: string): string {
    if (!query.trim()) return text;

    const regex = new RegExp(`(${this.escapeRegex(query)})`, "gi");
    return text.replace(regex, "<mark>$1</mark>");
  },

  // Escape special regex characters
  escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  },

  // Format search query for display
  formatQuery(query: string): string {
    return query.trim().replace(/\s+/g, " ");
  },

  // Get search suggestions
  getSearchSuggestions(query: string): string[] {
    const suggestions: string[] = [];

    // Add type-specific suggestions
    if (
      query.toLowerCase().includes("inv") ||
      query.toLowerCase().includes("invoice")
    ) {
      suggestions.push("invoice");
    }
    if (
      query.toLowerCase().includes("pay") ||
      query.toLowerCase().includes("payment")
    ) {
      suggestions.push("payment");
    }
    if (
      query.toLowerCase().includes("cust") ||
      query.toLowerCase().includes("customer")
    ) {
      suggestions.push("customer");
    }

    // Add amount suggestions if query contains numbers
    const amountMatch = query.match(/\d+/);
    if (amountMatch) {
      suggestions.push(`amount: ${amountMatch[0]}`);
    }

    return suggestions;
  },
};
