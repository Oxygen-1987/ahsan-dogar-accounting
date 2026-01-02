import { supabase } from "./supabaseClient";
import type { DiscountEntry, LedgerEntry } from "../types";
import { ledgerService } from "./ledgerService";
import { invoiceService } from "./invoiceService";

export const discountService = {
  // Apply discount to a specific invoice
  async applyDiscountToInvoice(
    customerId: string,
    invoiceId: string,
    paymentId: string,
    discountData: {
      amount: number;
      reason?: string;
      date: string;
      paymentNumber: string;
    }
  ): Promise<DiscountEntry> {
    try {
      console.log("Applying discount WITH ledger entry:", {
        customerId,
        invoiceId,
        paymentId,
        discountData,
      });

      // 1. Get current invoice
      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", invoiceId)
        .single();

      if (invoiceError || !invoice) {
        throw new Error("Invoice not found");
      }

      console.log("Current invoice before discount:", {
        total: invoice.total_amount,
        paid: invoice.paid_amount,
        pending: invoice.pending_amount,
        status: invoice.status,
      });

      // 2. Calculate new values - DISCOUNT REDUCES PENDING
      // BUT we also need to effectively increase "paid" amount for calculation
      const newPendingAmount = Math.max(
        0,
        invoice.pending_amount - discountData.amount
      );

      // Keep paid_amount the same (actual cash received)
      // But for status calculation, consider discount as effective payment
      const effectivePaid = invoice.paid_amount + discountData.amount;

      // Update status based on effective payment
      let newStatus = invoice.status;
      if (newPendingAmount === 0) {
        newStatus = "paid";
      } else if (invoice.paid_amount > 0 && newPendingAmount > 0) {
        newStatus = "partial";
      }

      // 3. Update the invoice
      const { error: updateError } = await supabase
        .from("invoices")
        .update({
          pending_amount: newPendingAmount,
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoiceId);

      if (updateError) {
        throw new Error(`Failed to update invoice: ${updateError.message}`);
      }

      console.log("Invoice updated after discount:", {
        newPendingAmount,
        newStatus,
      });

      // 4. Create discount ledger entry - THIS IS CORRECT
      const ledgerEntry = await ledgerService.addLedgerEntry({
        customer_id: customerId,
        date: discountData.date,
        type: "discount",
        reference_id: paymentId,
        reference_number: discountData.paymentNumber,
        debit: 0,
        credit: discountData.amount, // Correct - discount reduces balance
        description: `Discount on ${invoice.invoice_number}`,
      });

      if (!ledgerEntry) {
        throw new Error("Failed to create discount ledger entry");
      }

      // 5. Create discount record
      const discountEntryData = {
        id: ledgerEntry.id, // Use same ID as ledger entry
        customer_id: customerId,
        invoice_id: invoiceId,
        payment_id: paymentId,
        date: discountData.date,
        amount: discountData.amount,
        reason: discountData.reason || "Discount",
        reference_number: discountData.paymentNumber,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Store in discounts table if exists
      try {
        await supabase.from("discounts").insert([discountEntryData]);
      } catch (tableError) {
        console.log("Note: Discounts table might not exist");
      }

      console.log("✅ Discount applied with ledger entry");

      return discountEntryData;
    } catch (error) {
      console.error("❌ Error applying discount:", error);
      throw error;
    }
  },

  // Reverse discount applied to an invoice
  async reverseDiscount(
    paymentId: string,
    invoiceId: string,
    amount: number
  ): Promise<void> {
    try {
      console.log("Reversing discount:", { paymentId, invoiceId, amount });

      // 1. Get current invoice discount amount
      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .select("discount_amount, pending_amount")
        .eq("id", invoiceId)
        .single();

      if (invoiceError || !invoice) {
        console.error("Invoice not found or error:", invoiceError);
        throw new Error("Invoice not found");
      }

      console.log("Current invoice before discount reversal:", {
        discountAmount: invoice.discount_amount,
        pendingAmount: invoice.pending_amount,
      });

      // Calculate new amounts
      const newDiscountAmount = Math.max(
        0,
        (invoice.discount_amount || 0) - amount
      );
      const newPendingAmount = (invoice.pending_amount || 0) + amount;

      console.log("After discount reversal:", {
        newDiscountAmount,
        newPendingAmount,
      });

      // 2. Update invoice
      const { error: updateError } = await supabase
        .from("invoices")
        .update({
          discount_amount: newDiscountAmount,
          pending_amount: newPendingAmount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoiceId);

      if (updateError) {
        console.error("Error updating invoice:", updateError);
        throw updateError;
      }

      // 3. Delete discount ledger entries
      const { error: ledgerDeleteError } = await supabase
        .from("ledger_entries")
        .delete()
        .eq("reference_id", paymentId)
        .eq("type", "discount");

      if (ledgerDeleteError) {
        console.error(
          "Error deleting discount ledger entries:",
          ledgerDeleteError
        );
        // Don't throw, continue with other cleanup
      }

      // 4. Delete from discounts table if exists
      try {
        await supabase.from("discounts").delete().eq("payment_id", paymentId);
        console.log("✅ Deleted from discounts table");
      } catch (tableError) {
        console.log("⚠️ discounts table not found or empty");
      }

      console.log(`✅ Discount reversed: PKR ${amount}`);
    } catch (error) {
      console.error("Error reversing discount:", error);
      throw error;
    }
  },

  // Get customer discounts
  async getCustomerDiscounts(customerId: string): Promise<DiscountEntry[]> {
    try {
      console.log("=== GET CUSTOMER DISCOUNTS ===");
      console.log("Customer ID:", customerId);

      // First, try to get from ledger_entries (this is the main source)
      const { data: ledgerEntries, error: ledgerError } = await supabase
        .from("ledger_entries")
        .select("*")
        .eq("customer_id", customerId)
        .eq("type", "discount")
        .order("date", { ascending: false });

      if (ledgerError) {
        console.error("Error fetching discount ledger entries:", ledgerError);
        return [];
      }

      console.log("Found discount ledger entries:", ledgerEntries?.length || 0);

      if (!ledgerEntries || ledgerEntries.length === 0) {
        console.log("No discount ledger entries found");
        return [];
      }

      // Transform ledger entries to DiscountEntry format
      const discountEntries: DiscountEntry[] = [];

      for (const entry of ledgerEntries) {
        // Extract invoice number from description
        let invoiceNumber = "Unknown";
        let reason = entry.description || "Discount";

        const description = entry.description || "";
        const invoiceMatch = description.match(/invoice\s+([A-Z0-9-]+)/i);

        if (invoiceMatch) {
          invoiceNumber = invoiceMatch[1];
          // Clean up reason
          reason =
            description.split(":").slice(1).join(":").trim() || "Discount";
        }

        discountEntries.push({
          id: entry.id,
          customer_id: entry.customer_id,
          invoice_id: null, // We'll try to find this if needed
          payment_id: entry.reference_id,
          date: entry.date,
          amount: entry.credit || 0,
          reason: reason,
          created_at: entry.created_at,
          updated_at: entry.updated_at,
          reference_number: entry.reference_number,
        });
      }

      // Try to also get from discounts table if exists (for completeness)
      try {
        const { data: discountsTableData } = await supabase
          .from("discounts")
          .select("*")
          .eq("customer_id", customerId)
          .order("date", { ascending: false });

        if (discountsTableData && discountsTableData.length > 0) {
          console.log(
            "Also found in discounts table:",
            discountsTableData.length
          );
          // Merge with ledger entries if needed
        }
      } catch (tableError) {
        console.log(
          "Discounts table might not exist, using only ledger entries"
        );
      }

      console.log("Returning discount entries:", discountEntries.length);
      console.log("=== END GET DISCOUNTS ===");

      return discountEntries;
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

      // First, try to get discount from discounts table
      let discountAmount = 0;
      let customerId = "";
      let invoiceId = "";
      let paymentId = "";

      try {
        const { data: discountRecord } = await supabase
          .from("discounts")
          .select("*")
          .eq("id", discountId)
          .single();

        if (discountRecord) {
          discountAmount = discountRecord.amount;
          customerId = discountRecord.customer_id;
          invoiceId = discountRecord.invoice_id;
          paymentId = discountRecord.payment_id;
          console.log("Found in discounts table:", discountRecord);
        }
      } catch (tableError) {
        console.log(
          "Discount not found in discounts table or table doesn't exist"
        );
      }

      // If not found in discounts table, check ledger entries
      if (!customerId) {
        const { data: ledgerEntry } = await supabase
          .from("ledger_entries")
          .select("*")
          .eq("id", discountId)
          .eq("type", "discount")
          .single();

        if (ledgerEntry) {
          discountAmount = ledgerEntry.credit || 0;
          customerId = ledgerEntry.customer_id;
          paymentId = ledgerEntry.reference_id;

          // Extract invoice ID from description
          const description = ledgerEntry.description || "";
          const invoiceMatch = description.match(/invoice\s+([A-Z0-9-]+)/i);

          if (invoiceMatch) {
            const invoiceNumber = invoiceMatch[1];
            const { data: invoice } = await supabase
              .from("invoices")
              .select("id")
              .eq("invoice_number", invoiceNumber)
              .eq("customer_id", customerId)
              .single();

            if (invoice) {
              invoiceId = invoice.id;
            }
          }
          console.log("Found in ledger entries:", ledgerEntry);
        }
      }

      if (!customerId) {
        throw new Error("Discount not found");
      }

      console.log("Discount details:", {
        discountAmount,
        customerId,
        invoiceId,
        paymentId,
      });

      // 1. Reverse the discount on the invoice if invoice exists
      if (invoiceId && discountAmount > 0) {
        console.log("Reversing discount on invoice:", invoiceId);

        const { data: invoice } = await supabase
          .from("invoices")
          .select("*")
          .eq("id", invoiceId)
          .single();

        if (invoice) {
          const newPaidAmount = Math.max(
            0,
            invoice.paid_amount - discountAmount
          );
          const newPendingAmount = invoice.total_amount - newPaidAmount;

          console.log("Invoice reversal calculations:", {
            currentPaid: invoice.paid_amount,
            currentPending: invoice.pending_amount,
            discountAmount,
            newPaidAmount,
            newPendingAmount,
          });

          // Update status
          let newStatus = invoice.status;
          if (newPendingAmount === invoice.total_amount) {
            newStatus = "sent";
          } else if (newPendingAmount > 0 && newPaidAmount > 0) {
            newStatus = "partial";
          } else if (newPendingAmount === 0) {
            newStatus = "paid";
          }

          // Update the invoice
          const { error: updateError } = await supabase
            .from("invoices")
            .update({
              paid_amount: newPaidAmount,
              pending_amount: newPendingAmount,
              status: newStatus,
              updated_at: new Date().toISOString(),
            })
            .eq("id", invoiceId);

          if (updateError) {
            console.error("Error updating invoice:", updateError);
            throw updateError;
          }

          console.log("✅ Invoice updated successfully:", {
            newPaidAmount,
            newPendingAmount,
            newStatus,
          });
        }
      }

      // 2. Delete from discounts table if exists
      try {
        const { error: deleteError } = await supabase
          .from("discounts")
          .delete()
          .eq("id", discountId);

        if (deleteError && deleteError.code !== "42P01") {
          console.error("Error deleting from discounts table:", deleteError);
        } else {
          console.log("✅ Deleted from discounts table");
        }
      } catch (tableError) {
        console.log("Discounts table might not exist");
      }

      // 3. Delete ledger entry
      try {
        const { error: ledgerDeleteError } = await supabase
          .from("ledger_entries")
          .delete()
          .eq("id", discountId);

        if (ledgerDeleteError) {
          console.error("Error deleting ledger entry:", ledgerDeleteError);
          throw ledgerDeleteError;
        }
        console.log("✅ Ledger entry deleted");
      } catch (ledgerError) {
        console.error("Error deleting ledger entry:", ledgerError);
        throw ledgerError;
      }

      // 4. Recalculate customer balance
      if (customerId) {
        console.log("Recalculating customer balance:", customerId);
        try {
          await ledgerService.recalculateCustomerBalance(customerId);
          console.log("✅ Customer balance recalculated");
        } catch (balanceError) {
          console.error("Error recalculating customer balance:", balanceError);
        }
      }

      console.log("=== DELETE DISCOUNT COMPLETE ===");
    } catch (error) {
      console.error("❌ Error in deleteDiscount:", error);
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
      // Fallback to ledger entries
      const { data: ledgerEntries } = await supabase
        .from("ledger_entries")
        .select("credit")
        .eq("customer_id", customerId)
        .eq("type", "discount");

      return (
        ledgerEntries?.reduce((sum, entry) => sum + (entry.credit || 0), 0) || 0
      );
    }
  },
};
