import { supabase } from "./supabaseClient";
import type { DiscountEntry, LedgerEntry } from "../types";
import { ledgerService } from "./ledgerService";

export const discountService = {
  // Create discount
  async createDiscount(discountData: {
    customer_id: string;
    amount: number;
    reason?: string;
    date: string;
    invoice_id?: string;
  }): Promise<DiscountEntry> {
    try {
      console.log("Creating discount:", discountData);

      // Generate reference number
      const currentYear = new Date().getFullYear();
      const { data: lastDiscount } = await supabase
        .from("discounts")
        .select("reference_number")
        .order("created_at", { ascending: false })
        .limit(1);

      let nextSequence = 1;
      if (lastDiscount && lastDiscount.length > 0) {
        const lastRef = lastDiscount[0].reference_number;
        const match = lastRef?.match(/DISC-(\d+)-(\d+)/);
        if (match && parseInt(match[1]) === currentYear) {
          nextSequence = parseInt(match[2]) + 1;
        }
      }

      const referenceNumber = `DISC-${currentYear}-${nextSequence
        .toString()
        .padStart(3, "0")}`;

      // Create discount record
      const discountEntryData = {
        customer_id: discountData.customer_id,
        invoice_id: discountData.invoice_id || null,
        amount: discountData.amount,
        reason: discountData.reason || "Discount",
        date: discountData.date,
        reference_number: referenceNumber,
      };

      const { data: discount, error } = await supabase
        .from("discounts")
        .insert([discountEntryData])
        .select()
        .single();

      if (error) {
        console.error("Error creating discount:", error);
        throw error;
      }

      // Create ledger entry - UPDATE THIS PART
      let description = `Discount`;

      // Use the reason from the form as the description
      if (discountData.reason) {
        // Add reference number to make it clear it's a discount
        description = `Discount: ${discountData.reason}`;
      }

      // Add invoice reference if applicable
      if (discountData.invoice_id) {
        // Try to get invoice number for better description
        try {
          const { data: invoice } = await supabase
            .from("invoices")
            .select("invoice_number")
            .eq("id", discountData.invoice_id)
            .single();

          if (invoice) {
            description += ` (Invoice: ${invoice.invoice_number})`;
          }
        } catch (invoiceError) {
          // If we can't get invoice number, just mention it's for an invoice
          description += ` (Invoice)`;
        }
      }

      await ledgerService.addLedgerEntry({
        customer_id: discountData.customer_id,
        date: discountData.date,
        type: "discount",
        reference_id: discount.id,
        reference_number: referenceNumber,
        debit: 0,
        credit: discountData.amount,
        description: description,
      });

      // Recalculate customer balance
      await ledgerService.recalculateCustomerBalance(discountData.customer_id);

      console.log("✅ Discount created successfully");
      return discount;
    } catch (error) {
      console.error("❌ Error creating discount:", error);
      throw error;
    }
  },

  // Get all discounts
  async getAllDiscounts(): Promise<DiscountEntry[]> {
    try {
      const { data: discounts, error } = await supabase
        .from("discounts")
        .select(
          `
          *,
          customer:customers(company_name, first_name, last_name)
        `
        )
        .order("date", { ascending: false });

      if (error) {
        console.error("Error fetching discounts:", error);
        return [];
      }

      // Transform data to include customer name
      const transformedDiscounts = (discounts || []).map((discount) => ({
        ...discount,
        customer_name: discount.customer?.company_name || "Unknown",
      }));

      return transformedDiscounts;
    } catch (error) {
      console.error("Error in getAllDiscounts:", error);
      return [];
    }
  },

  // Get customer discounts
  async getCustomerDiscounts(customerId: string): Promise<DiscountEntry[]> {
    try {
      console.log("=== GET CUSTOMER DISCOUNTS ===");
      console.log("Customer ID:", customerId);

      // Get from discounts table
      const { data: discounts, error } = await supabase
        .from("discounts")
        .select("*")
        .eq("customer_id", customerId)
        .order("date", { ascending: false });

      if (error) {
        console.error("Error fetching customer discounts:", error);
        return [];
      }

      console.log("Found discounts:", discounts?.length || 0);

      return discounts || [];
    } catch (error) {
      console.error("Error in getCustomerDiscounts:", error);
      return [];
    }
  },

  // Delete discount
  async deleteDiscount(discountId: string): Promise<void> {
    try {
      console.log("=== DELETE DISCOUNT START ===");
      console.log("Discount ID:", discountId);

      // Get discount details
      const { data: discount, error: fetchError } = await supabase
        .from("discounts")
        .select("*")
        .eq("id", discountId)
        .single();

      if (fetchError || !discount) {
        throw new Error("Discount not found");
      }

      console.log("Discount details:", discount);

      // 1. Delete discount record
      const { error: deleteError } = await supabase
        .from("discounts")
        .delete()
        .eq("id", discountId);

      if (deleteError) {
        console.error("Error deleting discount:", deleteError);
        throw deleteError;
      }

      // 2. Delete ledger entry
      try {
        const { error: ledgerDeleteError } = await supabase
          .from("ledger_entries")
          .delete()
          .eq("reference_id", discountId)
          .eq("type", "discount");

        if (ledgerDeleteError) {
          console.error("Error deleting ledger entry:", ledgerDeleteError);
        }
      } catch (ledgerError) {
        console.error("Error deleting ledger entry:", ledgerError);
      }

      // 3. Recalculate customer balance
      if (discount.customer_id) {
        await ledgerService.recalculateCustomerBalance(discount.customer_id);
        console.log("✅ Customer balance recalculated");
      }

      console.log("=== DELETE DISCOUNT COMPLETE ===");
    } catch (error) {
      console.error("❌ Error in deleteDiscount:", error);
      throw error;
    }
  },

  // Reverse discount
  async reverseDiscount(
    paymentId: string,
    invoiceId: string,
    amount: number
  ): Promise<void> {
    try {
      console.log("Reversing discount:", { paymentId, invoiceId, amount });

      // Find discount by payment_id
      const { data: discount } = await supabase
        .from("discounts")
        .select("*")
        .eq("payment_id", paymentId)
        .eq("invoice_id", invoiceId)
        .single();

      if (discount) {
        await this.deleteDiscount(discount.id);
        console.log(`✅ Discount reversed: PKR ${amount}`);
      } else {
        console.log("No discount found to reverse");
      }
    } catch (error) {
      console.error("Error reversing discount:", error);
      throw error;
    }
  },

  // Get total discounts for customer
  async getCustomerTotalDiscounts(customerId: string): Promise<number> {
    try {
      const { data: discounts } = await supabase
        .from("discounts")
        .select("amount")
        .eq("customer_id", customerId);

      return (
        discounts?.reduce((sum, discount) => sum + discount.amount, 0) || 0
      );
    } catch (error) {
      console.error("Error getting total discounts:", error);
      return 0;
    }
  },

  // Update discount
  async updateDiscount(
    discountId: string,
    updates: {
      amount?: number;
      reason?: string;
      date?: string;
    }
  ): Promise<DiscountEntry> {
    try {
      console.log("Updating discount:", { discountId, updates });

      // Get current discount
      const { data: currentDiscount } = await supabase
        .from("discounts")
        .select("*")
        .eq("id", discountId)
        .single();

      if (!currentDiscount) {
        throw new Error("Discount not found");
      }

      // Update discount
      const { data: discount, error } = await supabase
        .from("discounts")
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq("id", discountId)
        .select()
        .single();

      if (error) {
        console.error("Error updating discount:", error);
        throw error;
      }

      // If amount or reason changed, update ledger entry
      if (
        (updates.amount !== undefined &&
          updates.amount !== currentDiscount.amount) ||
        (updates.reason !== undefined &&
          updates.reason !== currentDiscount.reason)
      ) {
        // Remove old ledger entry
        await supabase
          .from("ledger_entries")
          .delete()
          .eq("reference_id", discountId)
          .eq("type", "discount");

        // Create new ledger entry with updated reason
        let description = `Discount`;

        // Use the updated reason
        if (updates.reason || discount.reason) {
          const reason = updates.reason || discount.reason;
          description = `Discount: ${reason}`;
        }

        // Add invoice reference if applicable
        if (discount.invoice_id) {
          try {
            const { data: invoice } = await supabase
              .from("invoices")
              .select("invoice_number")
              .eq("id", discount.invoice_id)
              .single();

            if (invoice) {
              description += ` (Invoice: ${invoice.invoice_number})`;
            }
          } catch (invoiceError) {
            description += ` (Invoice)`;
          }
        }

        await ledgerService.addLedgerEntry({
          customer_id: discount.customer_id,
          date: updates.date || discount.date,
          type: "discount",
          reference_id: discountId,
          reference_number: discount.reference_number,
          debit: 0,
          credit: updates.amount || discount.amount,
          description: description,
        });

        // Recalculate customer balance
        await ledgerService.recalculateCustomerBalance(discount.customer_id);
      }

      return discount;
    } catch (error) {
      console.error("Error updating discount:", error);
      throw error;
    }
  },
};
