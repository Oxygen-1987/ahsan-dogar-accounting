import { supabase } from "./supabaseClient";
import type {
  Payment,
  PaymentDistribution,
  PaymentStatus,
  PaymentMethod,
  PaymentDistributionFormData,
  PaymentFormData,
} from "../types";
import { ledgerService } from "./ledgerService";
import { discountService } from "./discountService";
import dayjs from "dayjs";

export const paymentService = {
  // Get all payments
  async getAllPayments(): Promise<{ payments: Payment[]; summary: any }> {
    try {
      const { data: payments, error } = await supabase
        .from("payments")
        .select(
          `
        *,
        customer:customers(
          id,
          company_name,
          first_name,
          last_name,
          mobile,
          phone,
          email,
          address,
          city,
          state,
          country,
          notes,
          opening_balance,
          current_balance,
          status
        ),
        distributions:payment_distributions(*)
      `
        )
        .order("created_at", { ascending: false });

      if (error) {
        console.log("Supabase error loading payments:", error.message);
        throw error;
      }

      const paymentsList = payments || [];

      const totalReceived = paymentsList.reduce(
        (sum, payment) => sum + payment.total_received,
        0
      );

      const totalDistributed = paymentsList.reduce(
        (sum, payment) =>
          sum +
          (payment.distributions?.reduce(
            (distSum, dist) => distSum + dist.amount,
            0
          ) || 0),
        0
      );

      const summary = {
        totalPayments: paymentsList.length,
        totalReceived,
        totalDistributed,
        availableForDistribution: totalReceived - totalDistributed,
      };

      return {
        payments: paymentsList,
        summary,
      };
    } catch (error) {
      console.log("Error loading payments:", error);
      throw error;
    }
  },

  // Get payment by ID
  async getPaymentById(id: string): Promise<Payment | null> {
    try {
      const { data: payment, error } = await supabase
        .from("payments")
        .select(
          `
        *,
        customer:customers(*),
        distributions:payment_distributions(*)
      `
        )
        .eq("id", id)
        .single();

      if (error) {
        console.log("Supabase error loading payment:", error.message);
        return null;
      }

      return payment;
    } catch (error) {
      console.log("Error getting payment:", error);
      return null;
    }
  },

  // Get customer outstanding balance
  async getCustomerOutstandingBalance(customerId: string): Promise<number> {
    try {
      // Get customer opening balance
      const { data: customer } = await supabase
        .from("customers")
        .select("opening_balance")
        .eq("id", customerId)
        .single();

      if (!customer) return 0;

      // Get total invoices amount
      const { data: invoices } = await supabase
        .from("invoices")
        .select("total_amount")
        .eq("customer_id", customerId);

      const totalInvoices =
        invoices?.reduce((sum, inv) => sum + (inv.total_amount || 0), 0) || 0;

      // Get total payments (completed only)
      const { data: payments } = await supabase
        .from("payments")
        .select("total_received")
        .eq("customer_id", customerId)
        .eq("status", "completed");

      const totalPayments =
        payments?.reduce((sum, p) => sum + (p.total_received || 0), 0) || 0;

      // Get total discounts
      const { data: discounts } = await supabase
        .from("discounts")
        .select("amount")
        .eq("customer_id", customerId);

      const totalDiscounts =
        discounts?.reduce((sum, d) => sum + (d.amount || 0), 0) || 0;

      // Calculate: Opening Balance + Total Invoices - Total Payments - Total Discounts
      const outstandingBalance =
        (customer.opening_balance || 0) +
        totalInvoices -
        totalPayments -
        totalDiscounts;

      return outstandingBalance;
    } catch (error) {
      console.error("Error calculating outstanding balance:", error);
      return 0;
    }
  },

  // Create customer payment
  async createCustomerPayment(paymentData: {
    customer_id: string;
    payment_number?: string; // This should come from form
    payment_date: string;
    total_received: number;
    payment_method: PaymentMethod;
    reference_number?: string;
    bank_name?: string;
    cheque_date?: string;
    notes?: string;
  }): Promise<Payment> {
    try {
      console.log("Creating payment with data:", paymentData);

      // Use the payment number from the form, or generate if not provided
      let paymentNumber = paymentData.payment_number;

      // If no payment number provided, generate one
      if (!paymentNumber || paymentNumber.trim() === "") {
        const { data: lastPayment, error: lastPaymentError } = await supabase
          .from("payments")
          .select("payment_number")
          .order("created_at", { ascending: false })
          .limit(1);

        const currentYear = new Date().getFullYear();
        let nextSequence = 1;

        if (!lastPaymentError && lastPayment && lastPayment.length > 0) {
          const lastNumber = lastPayment[0].payment_number;
          console.log("Last payment number:", lastNumber);

          const match = lastNumber.match(/PAY-(\d+)-(\d+)/);
          if (match && parseInt(match[1]) === currentYear) {
            nextSequence = parseInt(match[2]) + 1;
          }
        }

        paymentNumber = `PAY-${currentYear}-${nextSequence
          .toString()
          .padStart(3, "0")}`;
      }

      console.log("Using payment number:", paymentNumber);

      // Determine payment status
      let paymentStatus: PaymentStatus = "completed";
      if (
        paymentData.payment_method === "cheque" ||
        paymentData.payment_method === "parchi"
      ) {
        paymentStatus = "pending";
      }

      console.log("Payment status determined:", {
        method: paymentData.payment_method,
        status: paymentStatus,
      });

      const paymentInsertData: any = {
        payment_number: paymentNumber,
        customer_id: paymentData.customer_id,
        payment_date: paymentData.payment_date,
        total_received: paymentData.total_received,
        payment_method: paymentData.payment_method,
        status: paymentStatus,
        notes: paymentData.notes || null,
      };

      if (paymentData.reference_number) {
        paymentInsertData.reference_number = paymentData.reference_number;
      }
      if (paymentData.bank_name) {
        paymentInsertData.bank_name = paymentData.bank_name;
      }
      if (paymentData.cheque_date) {
        paymentInsertData.cheque_date = paymentData.cheque_date;
      }

      console.log("Inserting payment data:", paymentInsertData);

      // Create payment
      const { data: payment, error } = await supabase
        .from("payments")
        .insert([paymentInsertData])
        .select()
        .single();

      if (error) {
        console.log("Supabase error details:", error);
        throw new Error(`Failed to create payment: ${error.message}`);
      }

      console.log("Payment created successfully:", payment);

      // Create ledger entry
      try {
        await ledgerService.addLedgerEntry({
          customer_id: paymentData.customer_id,
          date: paymentData.payment_date,
          type: "payment",
          reference_id: payment.id,
          reference_number: payment.payment_number,
          debit: 0,
          credit: paymentData.total_received,
          description: `Payment ${payment.payment_number}`,
        });

        console.log("✅ Ledger entry created");
      } catch (ledgerError: any) {
        console.error("❌ Failed to create ledger entry:", ledgerError.message);
      }

      // Recalculate customer balance
      await ledgerService.recalculateCustomerBalance(paymentData.customer_id);

      // Fetch the complete payment with customer data
      try {
        const { data: fullPayment, error: fetchError } = await supabase
          .from("payments")
          .select(
            `
      *,
      customer:customers(*),
      distributions:payment_distributions(*)
    `
          )
          .eq("id", payment.id)
          .single();

        if (fetchError) {
          console.error("Error fetching payment with customer:", fetchError);
          return {
            ...payment,
            distributions: [],
          };
        }

        return fullPayment;
      } catch (fetchError: any) {
        console.error("Error in final fetch:", fetchError);
        return {
          ...payment,
          distributions: [],
        };
      }
    } catch (error: any) {
      console.error("Error in createCustomerPayment:", error);
      throw new Error(
        `Payment creation failed: ${error.message || "Unknown error"}`
      );
    }
  },

  // Update payment
  async updatePayment(
    paymentId: string,
    updates: Partial<PaymentFormData>
  ): Promise<Payment | null> {
    try {
      console.log("Updating payment:", { paymentId, updates });

      const { data: currentPayment, error: fetchError } = await supabase
        .from("payments")
        .select("*")
        .eq("id", paymentId)
        .single();

      if (fetchError || !currentPayment) {
        console.error("Error fetching current payment:", fetchError);
        throw new Error("Payment not found");
      }

      const updateData: any = {
        ...updates,
        updated_at: new Date().toISOString(),
      };

      if (updates.payment_method) {
        if (["cheque", "parchi"].includes(updates.payment_method)) {
          if (!updates.cheque_date) {
            updateData.cheque_date =
              currentPayment.cheque_date ||
              updates.payment_date ||
              currentPayment.payment_date;
          }
        } else {
          if (["cheque", "parchi"].includes(currentPayment.payment_method)) {
            updateData.cheque_date = null;
          }
        }
      }

      if (
        updates.payment_method === "cheque" ||
        updates.payment_method === "parchi"
      ) {
        if (!updates.status) {
          updateData.status = "pending";
        } else if (updates.status === "completed") {
          const chequeDate =
            updates.cheque_date ||
            updateData.cheque_date ||
            currentPayment.cheque_date;
          if (chequeDate) {
            const chequeDateObj = dayjs(chequeDate);
            const today = dayjs();

            if (chequeDateObj.isAfter(today, "day")) {
              throw new Error(
                `Cannot mark cheque as completed. Cheque date (${chequeDateObj.format(
                  "DD/MM/YYYY"
                )}) is in the future.`
              );
            }
          }
        }
      }

      const { data: payment, error } = await supabase
        .from("payments")
        .update(updateData)
        .eq("id", paymentId)
        .select()
        .single();

      if (error) {
        console.error("Error updating payment:", error);
        throw error;
      }

      if (updates.payment_date || updates.total_received) {
        try {
          await ledgerService.removeLedgerEntry(paymentId, "payment");

          await ledgerService.addLedgerEntry({
            customer_id: payment.customer_id,
            date: updates.payment_date || payment.payment_date,
            type: "payment",
            reference_id: paymentId,
            reference_number: payment.payment_number,
            debit: 0,
            credit: updates.total_received || payment.total_received,
            description: `Payment ${payment.payment_number} updated`,
          });
        } catch (ledgerError) {
          console.error("Error updating ledger entry:", ledgerError);
        }
      }

      // Get distributions
      const { data: distributions } = await supabase
        .from("payment_distributions")
        .select("*")
        .eq("payment_id", paymentId);

      return {
        ...payment,
        distributions: distributions || [],
      };
    } catch (error) {
      console.error("Error in updatePayment:", error);
      throw error;
    }
  },

  // Add distribution to payment
  async addDistribution(
    paymentId: string,
    distributionData: PaymentDistributionFormData
  ): Promise<PaymentDistribution> {
    try {
      console.log("Adding distribution:", { paymentId, distributionData });

      const { data: distribution, error } = await supabase
        .from("payment_distributions")
        .insert([
          {
            payment_id: paymentId,
            payee_name: distributionData.payee_name,
            payee_type: distributionData.payee_type,
            amount: distributionData.amount,
            purpose: distributionData.purpose,
            allocation_date: distributionData.allocation_date,
            notes: distributionData.notes || null,
            status: "allocated",
          },
        ])
        .select()
        .single();

      if (error) {
        console.log("Supabase error adding distribution:", error);
        throw new Error(`Failed to add distribution: ${error.message}`);
      }

      return distribution;
    } catch (error: any) {
      console.log("Error adding distribution:", error);
      throw new Error(
        `Distribution failed: ${error.message || "Unknown error"}`
      );
    }
  },

  // Update payment status
  async updatePaymentStatus(
    id: string,
    status: PaymentStatus,
    chequeDate?: string
  ): Promise<Payment> {
    try {
      console.log("Updating payment status:", { id, status, chequeDate });

      if (status === "completed" && chequeDate) {
        const chequeDateObj = dayjs(chequeDate);
        const today = dayjs();

        console.log("Service cheque date check:", {
          chequeDate: chequeDateObj.format("DD/MM/YYYY"),
          today: today.format("DD/MM/YYYY"),
          isFuture: chequeDateObj.isAfter(today, "day"),
        });

        if (chequeDateObj.isAfter(today, "day")) {
          throw new Error(
            `Cannot mark cheque as completed. Cheque date (${chequeDateObj.format(
              "DD/MM/YYYY"
            )}) is in the future.`
          );
        }
      }

      const { error } = await supabase
        .from("payments")
        .update({
          status: status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) {
        console.log("Supabase update error:", error);
        throw new Error(`Failed to update payment status: ${error.message}`);
      }

      const { data: payment, error: fetchError } = await supabase
        .from("payments")
        .select(
          `
        *,
        customer:customers(*)
      `
        )
        .eq("id", id)
        .single();

      if (fetchError) {
        console.log("Supabase fetch error:", fetchError);
        throw new Error(
          `Failed to fetch updated payment: ${fetchError.message}`
        );
      }

      const { data: distributions } = await supabase
        .from("payment_distributions")
        .select("*")
        .eq("payment_id", id);

      return {
        ...payment,
        distributions: distributions || [],
      };
    } catch (error: any) {
      console.log("Error updating payment status:", error);
      throw new Error(
        `Status update failed: ${error.message || "Unknown error"}`
      );
    }
  },

  // Delete payment
  async deletePayment(id: string): Promise<void> {
    try {
      console.log("🔴 DELETE PAYMENT START ==============");

      const { data: payment, error: fetchError } = await supabase
        .from("payments")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchError || !payment) {
        throw new Error(`Payment not found: ${fetchError?.message}`);
      }

      console.log("Deleting payment:", payment.payment_number);

      // Check if payment has discount
      const hasDiscount =
        payment.discount_amount && payment.discount_amount > 0;
      let discountInvoiceId: string | null = null;
      let discountAmount: number = 0;

      if (hasDiscount) {
        discountAmount = payment.discount_amount || 0;
        discountInvoiceId = payment.discount_invoice_id || null;
        console.log(
          `🔄 Payment has discount: PKR ${discountAmount} on invoice ${discountInvoiceId}`
        );
      }

      // Handle discount reversal if any
      if (hasDiscount && discountInvoiceId && discountAmount > 0) {
        console.log(
          `🔄 Reversing discount: PKR ${discountAmount} from invoice ${discountInvoiceId}`
        );

        try {
          await discountService.reverseDiscount(
            payment.id,
            discountInvoiceId,
            discountAmount
          );
          console.log("✅ Discount reversed");
        } catch (discountError) {
          console.error("❌ Error reversing discount:", discountError);
        }
      }

      // Delete payment distributions
      console.log("🗑️ Deleting payment distributions...");
      await supabase
        .from("payment_distributions")
        .delete()
        .eq("payment_id", id);

      // Delete customer payment applications
      console.log("🗑️ Deleting customer payment applications...");
      await supabase
        .from("customer_payment_applications")
        .delete()
        .eq("payment_id", id);

      // Delete ledger entries for this payment
      console.log("🗑️ Deleting ledger entries...");
      await ledgerService.removeLedgerEntry(id, "payment");

      // Delete any hidden entries (including discounts)
      await supabase.from("ledger_entries").delete().eq("reference_id", id);

      // Delete the payment
      console.log("🗑️ Deleting payment record...");
      const { error: deleteError } = await supabase
        .from("payments")
        .delete()
        .eq("id", id);

      if (deleteError) {
        console.error("❌ Error deleting payment:", deleteError);
        throw new Error(`Failed to delete payment: ${deleteError.message}`);
      }

      // Recalculate customer balance
      console.log("🔄 Recalculating customer balance...");
      await ledgerService.recalculateCustomerBalance(payment.customer_id);

      console.log(
        "✅ DELETE PAYMENT COMPLETED SUCCESSFULLY ======================"
      );
    } catch (error: any) {
      console.error("❌ ERROR in deletePayment:", error);
      throw error;
    }
  },

  // Get payments by customer ID
  async getPaymentsByCustomerId(customerId: string): Promise<Payment[]> {
    try {
      const { data: payments, error } = await supabase
        .from("payments")
        .select(
          `
        *,
        distributions:payment_distributions(*)
      `
        )
        .eq("customer_id", customerId)
        .order("payment_date", { ascending: false });

      if (error) {
        console.log("Supabase error loading customer payments:", error.message);
        throw error;
      }

      return payments || [];
    } catch (error: any) {
      console.log("Error getting customer payments:", error);
      throw new Error(
        `Failed to get customer payments: ${error.message || "Unknown error"}`
      );
    }
  },

  // Get payment analytics
  async getPaymentAnalytics(
    startDate?: string,
    endDate?: string
  ): Promise<{
    totalPayments: number;
    totalAmount: number;
    cashPayments: number;
    chequePayments: number;
    bankTransferPayments: number;
    completedPayments: number;
    pendingPayments: number;
    dailyAverages: { date: string; amount: number }[];
  }> {
    try {
      let query = supabase.from("payments").select("*");

      if (startDate) {
        query = query.gte("payment_date", startDate);
      }
      if (endDate) {
        query = query.lte("payment_date", endDate);
      }

      const { data: payments, error } = await query;

      if (error) {
        console.error("Error fetching payment analytics:", error);
        throw error;
      }

      const paymentsList = payments || [];

      const totalPayments = paymentsList.length;
      const totalAmount = paymentsList.reduce(
        (sum, p) => sum + (p.total_received || 0),
        0
      );
      const cashPayments = paymentsList
        .filter((p) => p.payment_method === "cash")
        .reduce((sum, p) => sum + (p.total_received || 0), 0);
      const chequePayments = paymentsList
        .filter((p) => p.payment_method === "cheque")
        .reduce((sum, p) => sum + (p.total_received || 0), 0);
      const bankTransferPayments = paymentsList
        .filter((p) => p.payment_method === "bank_transfer")
        .reduce((sum, p) => sum + (p.total_received || 0), 0);
      const completedPayments = paymentsList.filter(
        (p) => p.status === "completed"
      ).length;
      const pendingPayments = paymentsList.filter(
        (p) => p.status === "pending"
      ).length;

      const dailyGroups: Record<string, number> = {};
      paymentsList.forEach((payment) => {
        const date = payment.payment_date.split("T")[0];
        dailyGroups[date] = (dailyGroups[date] || 0) + payment.total_received;
      });

      const dailyAverages = Object.entries(dailyGroups).map(
        ([date, amount]) => ({
          date,
          amount,
        })
      );

      return {
        totalPayments,
        totalAmount,
        cashPayments,
        chequePayments,
        bankTransferPayments,
        completedPayments,
        pendingPayments,
        dailyAverages,
      };
    } catch (error) {
      console.error("Error in getPaymentAnalytics:", error);
      throw error;
    }
  },
};
