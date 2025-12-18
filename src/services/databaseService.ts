import { supabase } from "./supabaseClient";
import type {
  Customer,
  Invoice,
  Payment,
  PaymentAllocation,
  Expense,
  LedgerEntry,
  CompanySettings,
} from "../types";

// Customer operations
export const customerService = {
  async getAllCustomers(): Promise<Customer[]> {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getCustomerById(id: string): Promise<Customer | null> {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    return data;
  },

  async createCustomer(
    customer: Omit<Customer, "id" | "created_at" | "updated_at">
  ): Promise<Customer> {
    const { data, error } = await supabase
      .from("customers")
      .insert([customer])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateCustomer(
    id: string,
    updates: Partial<Customer>
  ): Promise<Customer> {
    const { data, error } = await supabase
      .from("customers")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteCustomer(id: string): Promise<void> {
    const { error } = await supabase.from("customers").delete().eq("id", id);

    if (error) throw error;
  },
};

// Invoice operations
export const invoiceService = {
  async getAllInvoices(): Promise<Invoice[]> {
    const { data, error } = await supabase
      .from("invoices")
      .select(
        `
        *,
        customer:customers(*)
      `
      )
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async createInvoice(
    invoice: Omit<Invoice, "id" | "created_at" | "updated_at">
  ): Promise<Invoice> {
    const { data, error } = await supabase
      .from("invoices")
      .insert([invoice])
      .select(
        `
        *,
        customer:customers(*)
      `
      )
      .single();

    if (error) throw error;
    return data;
  },
};

// Payment operations with allocations
export const paymentService = {
  async createPaymentWithAllocations(
    payment: Omit<Payment, "id" | "created_at" | "updated_at">,
    allocations: Omit<
      PaymentAllocation,
      "id" | "created_at" | "updated_at" | "payment_id"
    >[]
  ): Promise<{ payment: Payment; allocations: PaymentAllocation[] }> {
    // First create the payment
    const { data: paymentData, error: paymentError } = await supabase
      .from("payments")
      .insert([payment])
      .select()
      .single();

    if (paymentError) throw paymentError;

    // Then create allocations with the payment ID
    const allocationsWithPaymentId = allocations.map((allocation) => ({
      ...allocation,
      payment_id: paymentData.id,
    }));

    const { data: allocationData, error: allocationError } = await supabase
      .from("payment_allocations")
      .insert(allocationsWithPaymentId)
      .select();

    if (allocationError) throw allocationError;

    return {
      payment: paymentData,
      allocations: allocationData || [],
    };
  },

  async getPaymentWithAllocations(
    paymentId: string
  ): Promise<{ payment: Payment; allocations: PaymentAllocation[] }> {
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select(
        `
        *,
        invoice:invoices(*),
        customer:customers(*)
      `
      )
      .eq("id", paymentId)
      .single();

    if (paymentError) throw paymentError;

    const { data: allocations, error: allocationError } = await supabase
      .from("payment_allocations")
      .select("*")
      .eq("payment_id", paymentId)
      .order("created_at", { ascending: true });

    if (allocationError) throw allocationError;

    return {
      payment,
      allocations: allocations || [],
    };
  },
};

// Ledger operations
export const ledgerService = {
  async getCustomerLedger(customerId: string): Promise<LedgerEntry[]> {
    const { data, error } = await supabase
      .from("ledger_entries")
      .select(
        `
        *,
        customer:customers(*)
      `
      )
      .eq("customer_id", customerId)
      .order("date", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw error;
    return data || [];
  },
};

// Settings operations
export const settingsService = {
  async getCompanySettings(): Promise<CompanySettings> {
    try {
      const { data, error } = await supabase
        .from("company_settings")
        .select("*")
        .limit(1)
        .maybeSingle(); // Use maybeSingle instead of single

      if (error) {
        console.warn("Error fetching company settings:", error.message);
        // If table doesn't exist or no settings, return defaults
        return {
          id: "default",
          company_name: "Ahsan Dogar Rubber Works",
          currency: "PKR",
          date_format: "DD/MM/YYYY",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }

      // If no data, return defaults
      if (!data) {
        return {
          id: "default",
          company_name: "Ahsan Dogar Rubber Works",
          currency: "PKR",
          date_format: "DD/MM/YYYY",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }

      return data;
    } catch (error) {
      console.error("Error in getCompanySettings:", error);
      // Return defaults on any error
      return {
        id: "default",
        company_name: "Ahsan Dogar Rubber Works",
        currency: "PKR",
        date_format: "DD/MM/YYYY",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }
  },

  async updateCompanySettings(
    settings: Partial<CompanySettings>
  ): Promise<CompanySettings> {
    const { data, error } = await supabase
      .from("company_settings")
      .upsert([settings])
      .select()
      .single();

    if (error) throw error;
    return data;
  },
};

// REMOVE ALL TYPE DEFINITIONS FROM HERE - they should only exist in /src/types/index.ts
