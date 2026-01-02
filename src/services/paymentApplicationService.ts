import { supabase } from "./supabaseClient";
import type { CustomerPaymentApplication } from "../types";

export const paymentApplicationService = {
  // Apply payment to invoice or opening balance
  async applyPayment(paymentApplication: {
    payment_id: string;
    customer_id: string;
    invoice_id?: string;
    amount: number;
    application_date: string;
    notes?: string;
  }): Promise<CustomerPaymentApplication> {
    const { data, error } = await supabase
      .from("customer_payment_applications")
      .insert([paymentApplication])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Get applications for a payment
  async getPaymentApplications(paymentId: string): Promise<CustomerPaymentApplication[]> {
    const { data, error } = await supabase
      .from("customer_payment_applications")
      .select("*")
      .eq("payment_id", paymentId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return data || [];
  },

  // Get customer's payment applications
  async getCustomerPaymentApplications(customerId: string): Promise<CustomerPaymentApplication[]> {
    const { data, error } = await supabase
      .from("customer_payment_applications")
      .select("*")
      .eq("customer_id", customerId)
      .order("application_date", { ascending: false });

    if (error) throw error;
    return data || [];
  },

  // Get opening balance payments for a customer
  async getOpeningBalancePayments(customerId: string): Promise<{
    totalPaid: number;
    applications: CustomerPaymentApplication[];
  }> {
    const { data, error } = await supabase
      .from("customer_payment_applications")
      .select("*")
      .eq("customer_id", customerId)
      .is("invoice_id", null) // Opening balance applications have no invoice_id
      .order("application_date", { ascending: true });

    if (error) throw error;

    const totalPaid = (data || []).reduce((sum, app) => sum + app.amount, 0);

    return {
      totalPaid,
      applications: data || [],
    };
  },

  // Delete an application
  async deleteApplication(applicationId: string): Promise<void> {
    const { error } = await supabase
      .from("customer_payment_applications")
      .delete()
      .eq("id", applicationId);

    if (error) throw error;
  },

  // Update customer's opening balance based on payments
  async updateCustomerOpeningBalance(customerId: string): Promise<number> {
    try {
      // Get customer's current opening balance
      const { data: customer } = await supabase
        .from("customers")
        .select("opening_balance")
        .eq("id", customerId)
        .single();

      if (!customer) throw new Error("Customer not found");

      // Get total opening balance payments
      const { totalPaid } = await this.getOpeningBalancePayments(customerId);

      // Calculate remaining opening balance
      const remainingBalance = Math.max(0, customer.opening_balance - totalPaid);

      // Update customer record if needed
      if (Math.abs(customer.opening_balance - totalPaid - remainingBalance) > 0.01) {
        await supabase
          .from("customers")
          .update({ 
            opening_balance: remainingBalance,
            updated_at: new Date().toISOString()
          })
          .eq("id", customerId);
      }

      return remainingBalance;
    } catch (error) {
      console.error("Error updating customer opening balance:", error);
      throw error;
    }
  },
};