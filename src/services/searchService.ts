// src/services/searchService.ts
import { supabase } from "./supabaseClient";
import type { Customer, Invoice, Payment } from "../types";

export interface SearchResult {
  id: string;
  type: "customer" | "invoice" | "payment";
  title: string;
  description: string;
  route: string;
  data: any;
  score: number;
}

export const searchService = {
  // Global search across all entities
  async globalSearch(query: string): Promise<SearchResult[]> {
    if (!query.trim()) {
      return [];
    }

    const results: SearchResult[] = [];
    const searchTerm = query.toLowerCase().trim();

    try {
      // Search customers
      const customerResults = await this.searchCustomers(searchTerm);
      results.push(...customerResults);

      // Search invoices
      const invoiceResults = await this.searchInvoices(searchTerm);
      results.push(...invoiceResults);

      // Search payments
      const paymentResults = await this.searchPayments(searchTerm);
      results.push(...paymentResults);

      // Sort by relevance score
      return results.sort((a, b) => b.score - a.score);
    } catch (error) {
      console.error("Error in global search:", error);
      return [];
    }
  },

  // Search customers
  async searchCustomers(searchTerm: string): Promise<SearchResult[]> {
    try {
      const { data: customers, error } = await supabase
        .from("customers")
        .select("*")
        .or(
          `company_name.ilike.%${searchTerm}%,first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,mobile.ilike.%${searchTerm}%`
        )
        .limit(10);

      if (error) throw error;

      return (customers || []).map((customer) => {
        const score = this.calculateCustomerScore(customer, searchTerm);
        return {
          id: customer.id,
          type: "customer",
          title: customer.company_name,
          description: `${customer.first_name} ${customer.last_name} • ${
            customer.mobile
          } • ${customer.city || "No city"}`,
          route: `/customers/${customer.id}`,
          data: customer,
          score,
        };
      });
    } catch (error) {
      console.error("Error searching customers:", error);
      return [];
    }
  },

  // Search invoices
  async searchInvoices(searchTerm: string): Promise<SearchResult[]> {
    try {
      // First try to parse as invoice number
      let query = supabase
        .from("invoices")
        .select("*, customer:customers(*)")
        .limit(10);

      const cleanSearchTerm = `%${searchTerm}%`;

      // Try exact invoice number match first
      if (searchTerm.toUpperCase().includes("INV")) {
        query = query.ilike("invoice_number", cleanSearchTerm);
      } else {
        // Search in various fields - FIXED SYNTAX
        const { data: invoices, error } = await supabase
          .from("invoices")
          .select("*, customer:customers(*)")
          .or(
            `invoice_number.ilike.${cleanSearchTerm},customer.company_name.ilike.${cleanSearchTerm}`
          )
          .limit(10);

        if (error) throw error;
        return this.formatInvoiceResults(invoices || [], searchTerm);
      }

      const { data: invoices, error } = await query;
      if (error) throw error;
      return this.formatInvoiceResults(invoices || [], searchTerm);
    } catch (error) {
      console.error("Error searching invoices:", error);
      return [];
    }
  },

  // Search payments
  async searchPayments(searchTerm: string): Promise<SearchResult[]> {
    try {
      const cleanSearchTerm = `%${searchTerm}%`;
      let query = supabase
        .from("payments")
        .select("*, customer:customers(*)")
        .limit(10);

      // Try exact payment number match first
      if (searchTerm.toUpperCase().includes("PAY")) {
        query = query.ilike("payment_number", cleanSearchTerm);
      } else {
        // Search in various fields - SIMPLIFIED
        const { data: payments, error } = await supabase
          .from("payments")
          .select("*, customer:customers(*)")
          .or(
            `payment_number.ilike.${cleanSearchTerm},customer.company_name.ilike.${cleanSearchTerm}`
          )
          .limit(10);

        if (error) throw error;
        return this.formatPaymentResults(payments || [], searchTerm);
      }

      const { data: payments, error } = await query;
      if (error) throw error;
      return this.formatPaymentResults(payments || [], searchTerm);
    } catch (error) {
      console.error("Error searching payments:", error);
      return [];
    }
  },

  // Add helper functions
  formatInvoiceResults(invoices: any[], searchTerm: string): SearchResult[] {
    return invoices.map((invoice) => {
      const score = this.calculateInvoiceScore(invoice, searchTerm);
      return {
        id: invoice.id,
        type: "invoice",
        title: invoice.invoice_number || `Invoice #${invoice.id}`,
        description: `${invoice.customer?.company_name || "Unknown"} • PKR ${
          invoice.total_amount?.toLocaleString() || "0"
        } • ${invoice.status || "Unknown"}`,
        route: `/invoices?view=${invoice.id}`,
        data: invoice,
        score,
      };
    });
  },

  formatPaymentResults(payments: any[], searchTerm: string): SearchResult[] {
    return payments.map((payment) => {
      const score = this.calculatePaymentScore(payment, searchTerm);
      return {
        id: payment.id,
        type: "payment",
        title: payment.payment_number || `Payment #${payment.id}`,
        description: `${payment.customer?.company_name || "Unknown"} • PKR ${
          payment.total_received?.toLocaleString() || "0"
        } • ${payment.status || "Unknown"}`,
        route: `/payments?view=${payment.id}`,
        data: payment,
        score,
      };
    });
  },

  // Calculate relevance score for customers
  calculateCustomerScore(customer: any, searchTerm: string): number {
    let score = 0;
    const searchLower = searchTerm.toLowerCase();

    // Exact company name match
    if (customer.company_name?.toLowerCase() === searchLower) {
      score += 100;
    }
    // Partial company name match
    else if (customer.company_name?.toLowerCase().includes(searchLower)) {
      score += 50;
    }

    // Exact name match
    const fullName =
      `${customer.first_name} ${customer.last_name}`.toLowerCase();
    if (fullName === searchLower) {
      score += 80;
    } else if (fullName.includes(searchLower)) {
      score += 40;
    }

    // Mobile match (exact)
    if (customer.mobile?.includes(searchTerm)) {
      score += 60;
    }

    // City match
    if (customer.city?.toLowerCase().includes(searchLower)) {
      score += 20;
    }

    return score;
  },

  // Calculate relevance score for invoices
  calculateInvoiceScore(invoice: any, searchTerm: string): number {
    let score = 0;
    const searchLower = searchTerm.toLowerCase();

    // Exact invoice number match
    if (invoice.invoice_number?.toLowerCase() === searchLower) {
      score += 100;
    }
    // Partial invoice number match
    else if (invoice.invoice_number?.toLowerCase().includes(searchLower)) {
      score += 60;
    }

    // Customer name match
    if (invoice.customer?.company_name?.toLowerCase().includes(searchLower)) {
      score += 40;
    }

    // Amount match (if search term is a number)
    if (!isNaN(Number(searchTerm))) {
      const amount = parseFloat(searchTerm);
      if (invoice.total_amount === amount) {
        score += 30;
      }
    }

    return score;
  },

  // Calculate relevance score for payments
  calculatePaymentScore(payment: any, searchTerm: string): number {
    let score = 0;
    const searchLower = searchTerm.toLowerCase();

    // Exact payment number match
    if (payment.payment_number?.toLowerCase() === searchLower) {
      score += 100;
    }
    // Partial payment number match
    else if (payment.payment_number?.toLowerCase().includes(searchLower)) {
      score += 60;
    }

    // Customer name match
    if (payment.customer?.company_name?.toLowerCase().includes(searchLower)) {
      score += 40;
    }

    // Reference number match
    if (payment.reference_number?.toLowerCase().includes(searchLower)) {
      score += 30;
    }

    // Amount match (if search term is a number)
    if (!isNaN(Number(searchTerm))) {
      const amount = parseFloat(searchTerm);
      if (payment.total_received === amount) {
        score += 30;
      }
    }

    return score;
  },

  // Quick search for recent items
  async quickSearch(query: string, limit: number = 5): Promise<SearchResult[]> {
    const results = await this.globalSearch(query);
    return results.slice(0, limit);
  },

  // Search with filters
  async searchWithFilters(
    query: string,
    filters: {
      types?: ("customer" | "invoice" | "payment")[];
      dateRange?: { start: string; end: string };
      minAmount?: number;
      maxAmount?: number;
    }
  ): Promise<SearchResult[]> {
    let results = await this.globalSearch(query);

    // Apply type filter
    if (filters.types && filters.types.length > 0) {
      results = results.filter((result) =>
        filters.types!.includes(result.type)
      );
    }

    // Apply date range filter
    if (filters.dateRange) {
      results = results.filter((result) => {
        let date: string | undefined;

        switch (result.type) {
          case "customer":
            date = result.data.created_at;
            break;
          case "invoice":
            date = result.data.issue_date;
            break;
          case "payment":
            date = result.data.payment_date;
            break;
        }

        if (!date) return false;

        const itemDate = new Date(date);
        const startDate = new Date(filters.dateRange!.start);
        const endDate = new Date(filters.dateRange!.end);

        return itemDate >= startDate && itemDate <= endDate;
      });
    }

    // Apply amount filter
    if (filters.minAmount !== undefined || filters.maxAmount !== undefined) {
      results = results.filter((result) => {
        let amount: number | undefined;

        switch (result.type) {
          case "invoice":
            amount = result.data.total_amount;
            break;
          case "payment":
            amount = result.data.total_received;
            break;
          case "customer":
            amount = result.data.current_balance;
            break;
        }

        if (amount === undefined) return false;

        if (filters.minAmount !== undefined && amount < filters.minAmount)
          return false;
        if (filters.maxAmount !== undefined && amount > filters.maxAmount)
          return false;

        return true;
      });
    }

    return results;
  },
};
