import { supabase } from "./supabaseClient";
import type {
  Payment,
  PaymentAllocation,
  PaymentStatus,
  PaymentMethod,
  PaymentAllocationFormData,
  PaymentFormData,
} from "../types";
import { invoiceService } from "./invoiceService";
import { ledgerService } from "./ledgerService";
import dayjs from "dayjs";

export const paymentService = {
  // Get all payments with allocations
  async getAllPayments(): Promise<{ payments: Payment[]; summary: any }> {
    try {
      // Get payments
      const { data: payments, error } = await supabase
        .from("payments")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.log("Supabase error loading payments:", error.message);
        throw error;
      }

      // Load all data separately
      const paymentsWithDetails = await Promise.all(
        (payments || []).map(async (payment) => {
          let customer = null;
          let invoice = null;

          try {
            // Get customer
            const { data: customerData } = await supabase
              .from("customers")
              .select("*")
              .eq("id", payment.customer_id)
              .single();
            customer = customerData;
          } catch (customerError) {
            console.log(
              `Error loading customer for payment ${payment.id}:`,
              customerError
            );
          }

          try {
            // Get invoice if exists
            if (payment.invoice_id) {
              const { data: invoiceData } = await supabase
                .from("invoices")
                .select("*")
                .eq("id", payment.invoice_id)
                .single();
              invoice = invoiceData;
            }
          } catch (invoiceError) {
            console.log(
              `Error loading invoice for payment ${payment.id}:`,
              invoiceError
            );
          }

          try {
            // Get allocations
            const { data: allocations } = await supabase
              .from("payment_allocations")
              .select("*")
              .eq("payment_id", payment.id);

            return {
              ...payment,
              customer,
              invoice,
              allocations: allocations || [],
            };
          } catch (allocError) {
            console.log(
              `Error loading allocations for payment ${payment.id}:`,
              allocError
            );
            return {
              ...payment,
              customer,
              invoice,
              allocations: [],
            };
          }
        })
      );

      const summary = {
        totalPayments: paymentsWithDetails.length,
        totalReceived: paymentsWithDetails.reduce(
          (sum, payment) => sum + payment.total_received,
          0
        ),
        totalAllocated: paymentsWithDetails.reduce(
          (sum, payment) =>
            sum +
            (payment.allocations?.reduce(
              (allocSum, alloc) => allocSum + alloc.amount,
              0
            ) || 0),
          0
        ),
        pendingAllocation: paymentsWithDetails.reduce(
          (sum, payment) =>
            sum +
            (payment.total_received -
              (payment.allocations?.reduce(
                (allocSum, alloc) => allocSum + alloc.amount,
                0
              ) || 0)),
          0
        ),
      };

      return {
        payments: paymentsWithDetails,
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
        customer:customers(*)
      `
        )
        .eq("id", id)
        .single();

      if (error) {
        console.log("Supabase error loading payment:", error.message);
        return null;
      }

      // Get allocations separately
      const { data: allocations } = await supabase
        .from("payment_allocations")
        .select("*")
        .eq("payment_id", id);

      // Get invoice separately if exists
      let invoice = null;
      if (payment.invoice_id) {
        const { data: invoiceData } = await supabase
          .from("invoices")
          .select("*")
          .eq("id", payment.invoice_id)
          .single();
        invoice = invoiceData;
      }

      return {
        ...payment,
        invoice,
        allocations: allocations || [],
      };
    } catch (error) {
      console.log("Error getting payment:", error);
      return null;
    }
  },

  // Get customer opening balance with paid amount tracking
  async getCustomerOpeningBalance(customerId: string): Promise<{
    amount: number;
    date: string;
    isPositive: boolean;
    paidAmount: number;
    remainingAmount: number;
  }> {
    try {
      console.log("=== CORRECTED: Getting opening balance ===");

      // 1. Get opening balance ledger entry
      const { data: openingEntry, error: openingError } = await supabase
        .from("ledger_entries")
        .select("*")
        .eq("customer_id", customerId)
        .eq("type", "opening_balance")
        .single();

      if (openingError || !openingEntry) {
        console.log("No opening balance found");
        return {
          amount: 0,
          date: "",
          isPositive: true,
          paidAmount: 0,
          remainingAmount: 0,
        };
      }

      const openingAmount = openingEntry.debit || 0; // Opening balance is DEBIT
      console.log("Opening balance (debit):", openingAmount);

      // 2. Get ALL ledger entries to find payments against opening balance
      const { data: allEntries, error: entriesError } = await supabase
        .from("ledger_entries")
        .select("*")
        .eq("customer_id", customerId)
        .order("date", { ascending: true });

      let paidAmount = 0;

      if (!entriesError && allEntries) {
        // Look for:
        // 1. Hidden entries with CREDITS against opening balance
        // 2. Or calculate from payment descriptions

        for (const entry of allEntries) {
          const desc = (entry.description || "").toLowerCase();

          // Check hidden entries first
          if (entry.is_hidden && desc.includes("opening") && entry.credit > 0) {
            paidAmount += entry.credit;
            console.log(`Found hidden opening balance credit: ${entry.credit}`);
          }
          // Also check payment descriptions
          else if (
            entry.type === "payment" &&
            desc.includes("opening") &&
            desc.includes("pkr")
          ) {
            // Try to extract amount from payment description
            const match = desc.match(/pkr\s*([\d,]+)/);
            if (match) {
              const amountStr = match[1].replace(/,/g, "");
              const amount = parseFloat(amountStr);
              if (!isNaN(amount)) {
                paidAmount += amount;
                console.log(
                  `Found opening balance in payment description: ${amount}`
                );
              }
            }
          }
        }
      }

      const remainingAmount = Math.max(0, openingAmount - paidAmount);

      console.log("🎯 CORRECTED Calculation:", {
        openingAmount,
        paidAmount,
        remainingAmount,
        status:
          remainingAmount === 0
            ? "✅ FULLY PAID"
            : "⚠️ STILL OWES: " + remainingAmount,
      });

      return {
        amount: openingAmount,
        date: openingEntry.date,
        isPositive: true,
        paidAmount: paidAmount,
        remainingAmount: remainingAmount,
      };
    } catch (error) {
      console.error("❌ Error in getCustomerOpeningBalance:", error);
      return {
        amount: 0,
        date: "",
        isPositive: true,
        paidAmount: 0,
        remainingAmount: 0,
      };
    }
  },

  // Record opening balance payment
  async recordOpeningBalancePayment(
    customerId: string,
    paymentId: string,
    amount: number,
    paymentDate: string
  ): Promise<void> {
    try {
      console.log("=== Recording opening balance payment ===");
      console.log("Customer:", customerId);
      console.log("Payment:", paymentId);
      console.log("Amount:", amount);
      console.log("Date:", paymentDate);

      if (amount <= 0) {
        console.log("No opening balance payment to record");
        return;
      }

      // First, try to insert into opening_balance_payments
      const { error } = await supabase.from("opening_balance_payments").insert([
        {
          customer_id: customerId,
          payment_id: paymentId,
          amount: amount,
          payment_date: paymentDate,
        },
      ]);

      if (error) {
        console.error("Error inserting into opening_balance_payments:", error);

        // If table doesn't exist or has issues, update payment notes instead
        console.log("Updating payment notes as fallback...");

        // Get current payment
        const { data: payment } = await supabase
          .from("payments")
          .select("notes")
          .eq("id", paymentId)
          .single();

        let newNotes = `PKR ${amount.toLocaleString()} paid against opening balance.`;
        if (payment?.notes) {
          newNotes = payment.notes + "\n" + newNotes;
        }

        await supabase
          .from("payments")
          .update({ notes: newNotes })
          .eq("id", paymentId);

        console.log("Updated payment notes with opening balance info");
      } else {
        console.log(
          "✅ Successfully recorded in opening_balance_payments table"
        );
      }
    } catch (error) {
      console.error("Error in recordOpeningBalancePayment:", error);
      // Don't throw - this shouldn't fail the whole payment
    }
  },

  // Add this helper function to sync existing opening balance payments
  async syncExistingOpeningBalancePayments(customerId: string): Promise<void> {
    try {
      console.log("Syncing existing opening balance payments...");

      // Get all payments with opening balance mentions
      const { data: payments } = await supabase
        .from("payments")
        .select("id, payment_number, notes, total_received, payment_date")
        .eq("customer_id", customerId)
        .or("notes.ilike.%opening%,notes.ilike.%against%");

      if (!payments || payments.length === 0) {
        console.log("No payments to sync");
        return;
      }

      for (const payment of payments) {
        if (payment.notes) {
          // Check if hidden entry already exists
          const { data: existingHidden } = await supabase
            .from("ledger_entries")
            .select("id")
            .eq("customer_id", customerId)
            .eq("reference_id", payment.id)
            .eq("type", "opening_balance_payment")
            .eq("is_hidden", true)
            .single();

          if (!existingHidden) {
            // Try to extract amount from notes
            let amount = 0;
            const notesLower = payment.notes.toLowerCase();

            if (
              notesLower.includes("100,000") ||
              notesLower.includes("100000")
            ) {
              amount = 100000;
            } else if (notesLower.includes("opening")) {
              // If notes mention opening but no specific amount, check if it's the only payment
              const { data: invoiceAllocations } = await supabase
                .from("payment_allocations")
                .select("amount")
                .eq("payment_id", payment.id);

              if (!invoiceAllocations || invoiceAllocations.length === 0) {
                // No invoice allocations, so all might be against opening balance
                amount = payment.total_received;
              }
            }

            if (amount > 0) {
              // Create hidden entry
              await supabase.from("ledger_entries").insert([
                {
                  customer_id: customerId,
                  date: payment.payment_date,
                  type: "opening_balance_payment",
                  reference_id: payment.id,
                  reference_number: payment.payment_number,
                  debit: amount,
                  credit: 0,
                  balance: 0,
                  description: `Opening balance payment (hidden) - ${payment.payment_number}`,
                  is_hidden: true,
                },
              ]);

              console.log(
                `Created hidden entry for ${payment.payment_number}: ${amount}`
              );
            }
          }
        }
      }

      console.log("Sync completed");
    } catch (error) {
      console.error("Error syncing:", error);
    }
  },

  // Create customer payment - COMPLETE UPDATED VERSION with opening balance tracking
  async createCustomerPayment(paymentData: {
    customer_id: string;
    payment_number?: string;
    payment_date: string;
    total_received: number;
    payment_method: PaymentMethod;
    reference_number?: string;
    bank_name?: string;
    cheque_date?: string;
    notes?: string;
    invoice_allocations?: { invoice_id: string; amount: number }[];
    opening_balance_allocation?: { amount: number; date: string };
  }): Promise<Payment> {
    try {
      console.log("Creating payment with data:", paymentData);

      // Get the last payment number to determine next sequence
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

        // Extract sequence from last payment number (format: PAY-YYYY-NNNNN)
        const match = lastNumber.match(/PAY-(\d+)-(\d+)/);
        if (match && parseInt(match[1]) === currentYear) {
          // Same year, increment sequence
          nextSequence = parseInt(match[2]) + 1;
        }
        // If different year, start from 1
      }

      // Generate sequential payment number
      const paymentNumber = `PAY-${currentYear}-${nextSequence
        .toString()
        .padStart(3, "0")}`;

      console.log("Generated payment number:", paymentNumber);

      // Check invoice allocations and determine if it's a full payment
      let isFullPayment = true;

      if (
        paymentData.invoice_allocations &&
        paymentData.invoice_allocations.length > 0
      ) {
        console.log(
          "Checking invoice allocations:",
          paymentData.invoice_allocations
        );

        for (const allocation of paymentData.invoice_allocations) {
          try {
            // Get invoice details
            const { data: invoice, error: invoiceError } = await supabase
              .from("invoices")
              .select("paid_amount, pending_amount, total_amount")
              .eq("id", allocation.invoice_id)
              .single();

            if (invoiceError) {
              console.error(
                `Error fetching invoice ${allocation.invoice_id}:`,
                invoiceError
              );
              continue;
            }

            if (invoice) {
              console.log(`Invoice ${allocation.invoice_id} details:`, {
                paid_amount: invoice.paid_amount,
                pending_amount: invoice.pending_amount,
                total_amount: invoice.total_amount,
                allocation_amount: allocation.amount,
              });

              // Calculate current pending amount
              const currentPending =
                invoice.pending_amount ||
                invoice.total_amount - invoice.paid_amount;

              // If allocation amount is less than pending amount, it's a partial payment
              if (allocation.amount < currentPending) {
                isFullPayment = false;
                console.log(
                  `Partial payment detected for invoice ${allocation.invoice_id}:`,
                  {
                    allocation: allocation.amount,
                    pending: currentPending,
                  }
                );
                break;
              }
            }
          } catch (error) {
            console.error(
              `Error checking invoice ${allocation.invoice_id}:`,
              error
            );
            // Continue checking other invoices
          }
        }
      }

      // Determine payment status
      let paymentStatus: PaymentStatus;

      if (
        paymentData.payment_method === "cheque" ||
        paymentData.payment_method === "parchi"
      ) {
        // Cheque/parchi payments are always pending initially
        paymentStatus = "pending";
      } else {
        // For other payment methods, status depends on invoice coverage
        paymentStatus = isFullPayment ? "completed" : "partial";
      }

      console.log("Payment status determined:", {
        method: paymentData.payment_method,
        isFullPayment,
        status: paymentStatus,
      });

      // Use the first invoice_id from allocations if available
      const primaryInvoiceId =
        paymentData.invoice_allocations?.[0]?.invoice_id || null;

      // Prepare payment data for Supabase
      const paymentInsertData: any = {
        payment_number: paymentNumber,
        customer_id: paymentData.customer_id,
        payment_date: paymentData.payment_date,
        total_received: paymentData.total_received,
        payment_method: paymentData.payment_method,
        status: paymentStatus,
        notes: paymentData.notes || null,
      };

      // Only include fields that are not null/undefined
      if (primaryInvoiceId) {
        paymentInsertData.invoice_id = primaryInvoiceId;
      }
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

      // Create ledger entry for the payment with detailed description
      try {
        const hasOpeningBalanceAllocation =
          paymentData.opening_balance_allocation?.amount > 0;
        const hasInvoiceAllocations =
          paymentData.invoice_allocations &&
          paymentData.invoice_allocations.length > 0;

        // Create a CLEAR description that shows allocation
        let ledgerDescription = "";

        if (hasOpeningBalanceAllocation && hasInvoiceAllocations) {
          // Both opening balance and invoices
          const invoiceTotal = paymentData.invoice_allocations!.reduce(
            (sum, inv) => sum + inv.amount,
            0
          );
          ledgerDescription = `Payment ${
            payment.payment_number
          } - PKR ${paymentData.opening_balance_allocation!.amount.toLocaleString()} to opening balance, PKR ${invoiceTotal.toLocaleString()} to ${
            paymentData.invoice_allocations!.length
          } invoice(s)`;
        } else if (hasOpeningBalanceAllocation) {
          // Only opening balance
          ledgerDescription = `Payment ${
            payment.payment_number
          } - PKR ${paymentData.opening_balance_allocation!.amount.toLocaleString()} to opening balance`;
        } else if (hasInvoiceAllocations) {
          // Only invoices
          const invoiceTotal = paymentData.invoice_allocations!.reduce(
            (sum, inv) => sum + inv.amount,
            0
          );
          ledgerDescription = `Payment ${
            payment.payment_number
          } - PKR ${invoiceTotal.toLocaleString()} to ${
            paymentData.invoice_allocations!.length
          } invoice(s)`;
        } else {
          // No allocations specified (shouldn't happen)
          ledgerDescription = `Payment ${payment.payment_number} received`;
        }

        if (paymentStatus === "partial") {
          ledgerDescription += " (Partial Payment)";
        }
        if (paymentStatus === "pending") {
          ledgerDescription += " (Pending Clearance)";
        }

        await ledgerService.addLedgerEntry({
          customer_id: paymentData.customer_id,
          date: paymentData.payment_date,
          type: "payment",
          reference_id: payment.id,
          reference_number: payment.payment_number,
          debit: 0,
          credit: paymentData.total_received,
          description: ledgerDescription,
        });

        console.log("✅ Ledger entry created:", ledgerDescription);
      } catch (ledgerError: any) {
        console.error("❌ Failed to create ledger entry:", ledgerError.message);
      }

      // IMPORTANT: Record opening balance payment if any
      if (paymentData.opening_balance_allocation?.amount) {
        try {
          const openingBalanceAmount =
            paymentData.opening_balance_allocation.amount;

          console.log(
            `Creating hidden adjustment entry for opening balance: ${openingBalanceAmount}`
          );

          // IMPORTANT: This should be a CREDIT entry to reduce opening balance
          // Opening balance is a DEBIT (asset/accounts receivable)
          // To reduce it, we need a CREDIT

          await supabase.from("ledger_entries").insert([
            {
              customer_id: paymentData.customer_id,
              date: paymentData.payment_date,
              type: "adjustment", // Use 'adjustment' type
              reference_id: payment.id,
              reference_number: payment.payment_number,
              debit: 0, // ← ZERO DEBIT!
              credit: openingBalanceAmount, // ← CREDIT to reduce opening balance!
              balance: 0, // Will be recalculated by ledger service
              description: `Opening balance payment (hidden) - ${payment.payment_number}`,
              is_hidden: true, // Mark as hidden
            },
          ]);

          console.log("✅ Hidden CREDIT adjustment entry created");
        } catch (hiddenError) {
          console.error("❌ Failed to create hidden adjustment:", hiddenError);
        }
      }

      // Update invoice balances if we have allocations
      if (
        paymentData.invoice_allocations &&
        paymentData.invoice_allocations.length > 0
      ) {
        console.log("Updating invoice balances for allocations...");

        for (const allocation of paymentData.invoice_allocations) {
          if (allocation.amount > 0) {
            try {
              console.log(
                `Updating invoice ${allocation.invoice_id} with amount ${allocation.amount}`
              );

              await invoiceService.updateInvoicePayment(
                allocation.invoice_id,
                allocation.amount
              );

              console.log(
                `✅ Updated invoice ${allocation.invoice_id} successfully`
              );
            } catch (invoiceError: any) {
              console.error(
                `❌ Error updating invoice ${allocation.invoice_id}:`,
                invoiceError.message
              );
            }
          }
        }
      }

      // Fetch the complete payment with customer data
      try {
        const { data: fullPayment, error: fetchError } = await supabase
          .from("payments")
          .select(
            `
            *,
            customer:customers(*),
            allocations:payment_allocations(*)
          `
          )
          .eq("id", payment.id)
          .single();

        if (fetchError) {
          console.error("Error fetching payment with customer:", fetchError);
          // Return basic payment data if customer fetch fails
          return {
            ...payment,
            allocations: [],
          };
        }

        return fullPayment;
      } catch (fetchError: any) {
        console.error("Error in final fetch:", fetchError);
        return {
          ...payment,
          allocations: [],
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

      // Get current payment data first
      const { data: currentPayment, error: fetchError } = await supabase
        .from("payments")
        .select("*")
        .eq("id", paymentId)
        .single();

      if (fetchError || !currentPayment) {
        console.error("Error fetching current payment:", fetchError);
        throw new Error("Payment not found");
      }

      // Prepare update data
      const updateData: any = {
        ...updates,
        updated_at: new Date().toISOString(),
      };

      // Handle cheque/parchi date logic
      if (updates.payment_method) {
        if (["cheque", "parchi"].includes(updates.payment_method)) {
          // If changing to cheque/parchi and date is not provided, keep existing or set to payment date
          if (!updates.cheque_date) {
            updateData.cheque_date =
              currentPayment.cheque_date ||
              updates.payment_date ||
              currentPayment.payment_date;
          }
        } else {
          // If changing from cheque/parchi to another method, clear cheque date
          if (["cheque", "parchi"].includes(currentPayment.payment_method)) {
            updateData.cheque_date = null;
          }
        }
      }

      // Handle status logic for cheque/parchi payments
      if (
        updates.payment_method === "cheque" ||
        updates.payment_method === "parchi"
      ) {
        // If changing to cheque/parchi and status is not provided, set to pending
        if (!updates.status) {
          updateData.status = "pending";
        } else if (updates.status === "completed") {
          // Check if cheque date is in the future
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

      // Update the payment
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

      // Also need to update the ledger entry if payment date or amount changed
      if (updates.payment_date || updates.total_received) {
        try {
          // First remove the old ledger entry
          await ledgerService.removeLedgerEntry(paymentId, "payment");

          // Create new ledger entry with updated values
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

      // Get allocations
      const { data: allocations } = await supabase
        .from("payment_allocations")
        .select("*")
        .eq("payment_id", paymentId);

      return {
        ...payment,
        allocations: allocations || [],
      };
    } catch (error) {
      console.error("Error in updatePayment:", error);
      throw error;
    }
  },

  // Add allocation to payment
  async addAllocation(
    paymentId: string,
    allocationData: PaymentAllocationFormData
  ): Promise<PaymentAllocation> {
    try {
      console.log("Adding allocation:", { paymentId, allocationData });

      const { data: allocation, error } = await supabase
        .from("payment_allocations")
        .insert([
          {
            payment_id: paymentId,
            payee_name: allocationData.payee_name,
            payee_type: allocationData.payee_type,
            amount: allocationData.amount,
            purpose: allocationData.purpose,
            allocation_date: allocationData.allocation_date,
            notes: allocationData.notes || null,
            status: "allocated",
          },
        ])
        .select()
        .single();

      if (error) {
        console.log("Supabase error adding allocation:", error);
        throw new Error(`Failed to add allocation: ${error.message}`);
      }

      return allocation;
    } catch (error: any) {
      console.log("Error adding allocation:", error);
      throw new Error(`Allocation failed: ${error.message || "Unknown error"}`);
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

      // Only check cheque date if we're marking as completed
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

      // Update the payment
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

      // Get the updated payment
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

      // Get allocations
      const { data: allocations } = await supabase
        .from("payment_allocations")
        .select("*")
        .eq("payment_id", id);

      return {
        ...payment,
        allocations: allocations || [],
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
      console.log("Deleting payment ID:", id);

      // First get the payment details
      const { data: payment, error: fetchError } = await supabase
        .from("payments")
        .select(
          `
        *,
        invoice:invoices(id, invoice_number, paid_amount, pending_amount, total_amount, status)
      `
        )
        .eq("id", id)
        .single();

      if (fetchError) {
        console.error("Error fetching payment:", fetchError);
        throw new Error(`Payment not found: ${fetchError.message}`);
      }

      if (!payment) {
        throw new Error("Payment not found");
      }

      console.log("Payment details:", {
        id: payment.id,
        number: payment.payment_number,
        amount: payment.total_received,
        status: payment.status,
        invoiceId: payment.invoice_id,
      });

      // Get allocations separately (not using relationship)
      const { data: allocations, error: allocationsError } = await supabase
        .from("payment_allocations")
        .select("*")
        .eq("payment_id", id);

      if (allocationsError) {
        console.error("Error fetching allocations:", allocationsError);
      }

      console.log("Payment allocations:", allocations?.length || 0);

      // Reverse invoice payments from allocations
      if (allocations && allocations.length > 0) {
        console.log("Reversing invoice payments from allocations...");

        for (const allocation of allocations) {
          // Check if this allocation is for an invoice
          const isInvoiceAllocation =
            allocation.payee_type === "invoice" ||
            (allocation.purpose && allocation.purpose.includes("invoice")) ||
            (allocation.purpose && allocation.purpose.includes("INV-"));

          if (isInvoiceAllocation) {
            try {
              // Try to find the invoice ID from the allocation
              let invoiceId = allocation.invoice_id;

              // If no invoice_id field, try to extract from purpose or payee_name
              if (!invoiceId && allocation.purpose) {
                // Try to extract invoice number from purpose
                const match = allocation.purpose.match(/INV-(\d+-\d+)/);
                if (match) {
                  const invoiceNumber = match[0];
                  const { data: invoice } = await supabase
                    .from("invoices")
                    .select("id")
                    .eq("invoice_number", invoiceNumber)
                    .single();

                  if (invoice) {
                    invoiceId = invoice.id;
                  }
                }
              }

              if (invoiceId) {
                const { data: invoice } = await supabase
                  .from("invoices")
                  .select(
                    "id, invoice_number, paid_amount, pending_amount, total_amount, status"
                  )
                  .eq("id", invoiceId)
                  .single();

                if (invoice) {
                  const amountToReverse = allocation.amount;
                  const newPaidAmount = Math.max(
                    0,
                    invoice.paid_amount - amountToReverse
                  );
                  const newPendingAmount = invoice.total_amount - newPaidAmount;

                  // Determine new status
                  let newStatus = invoice.status;
                  if (newPendingAmount === invoice.total_amount) {
                    newStatus = "sent";
                  } else if (newPendingAmount > 0 && newPaidAmount > 0) {
                    newStatus = "partial";
                  } else if (newPendingAmount === 0) {
                    newStatus = "paid";
                  }

                  // Update the invoice
                  const { error: invoiceUpdateError } = await supabase
                    .from("invoices")
                    .update({
                      paid_amount: newPaidAmount,
                      pending_amount: newPendingAmount,
                      status: newStatus,
                      updated_at: new Date().toISOString(),
                    })
                    .eq("id", invoiceId);

                  if (invoiceUpdateError) {
                    console.error(
                      `Error updating invoice ${invoiceId}:`,
                      invoiceUpdateError
                    );
                  } else {
                    console.log(
                      `Invoice ${invoice.invoice_number} reversed successfully`
                    );
                  }
                }
              }
            } catch (invoiceError) {
              console.error(
                `Error reversing invoice allocation:`,
                invoiceError
              );
            }
          }
        }
      }

      // Also check if payment is directly linked to an invoice
      if (payment.invoice_id && payment.invoice) {
        try {
          const currentInvoice = payment.invoice;
          const amountToReverse = payment.total_received;

          console.log("Reversing direct invoice payment:", {
            invoiceId: currentInvoice.id,
            invoiceNumber: currentInvoice.invoice_number,
            currentPaid: currentInvoice.paid_amount,
            currentPending: currentInvoice.pending_amount,
            amountToReverse,
          });

          const newPaidAmount = Math.max(
            0,
            currentInvoice.paid_amount - amountToReverse
          );
          const newPendingAmount = currentInvoice.total_amount - newPaidAmount;

          let newStatus = currentInvoice.status;
          if (newPendingAmount === currentInvoice.total_amount) {
            newStatus = "sent";
          } else if (newPendingAmount > 0 && newPaidAmount > 0) {
            newStatus = "partial";
          } else if (newPendingAmount === 0) {
            newStatus = "paid";
          }

          const { error: invoiceUpdateError } = await supabase
            .from("invoices")
            .update({
              paid_amount: newPaidAmount,
              pending_amount: newPendingAmount,
              status: newStatus,
              updated_at: new Date().toISOString(),
            })
            .eq("id", payment.invoice_id);

          if (invoiceUpdateError) {
            console.error("Error updating direct invoice:", invoiceUpdateError);
          } else {
            console.log("Direct invoice reversed successfully");
          }
        } catch (invoiceError) {
          console.error("Error in direct invoice reversal:", invoiceError);
        }
      }

      // 1. Remove the ledger entry for this payment
      try {
        await ledgerService.removeLedgerEntry(id, "payment");
      } catch (ledgerError) {
        console.log("Note removing ledger entry:", ledgerError);
      }

      // 2. Delete hidden adjustment entries for opening balance payments
      try {
        console.log("Deleting hidden adjustment entries...");

        // Delete ALL hidden entries for this payment
        const { error: hiddenDeleteError } = await supabase
          .from("ledger_entries")
          .delete()
          .eq("reference_id", id)
          .eq("is_hidden", true);

        if (hiddenDeleteError) {
          console.error("Error deleting hidden entries:", hiddenDeleteError);

          // Also try to delete by description pattern as fallback
          if (payment.payment_number) {
            const { error: descDeleteError } = await supabase
              .from("ledger_entries")
              .delete()
              .like("description", `%${payment.payment_number}%`)
              .eq("is_hidden", true);

            if (descDeleteError) {
              console.error("Error deleting by description:", descDeleteError);
            }
          }
        } else {
          console.log("Hidden adjustment entries deleted successfully");
        }
      } catch (hiddenError) {
        console.error("Error deleting hidden entries:", hiddenError);
      }

      // 3. Delete payment allocations (if any)
      if (allocations && allocations.length > 0) {
        try {
          const { error: allocationsDeleteError } = await supabase
            .from("payment_allocations")
            .delete()
            .eq("payment_id", id);

          if (allocationsDeleteError) {
            console.log(
              "Note: Could not delete allocations:",
              allocationsDeleteError.message
            );
          } else {
            console.log("Allocations deleted successfully");
          }
        } catch (allocationsError) {
          console.log("Error deleting allocations:", allocationsError);
        }
      }

      // 4. Finally delete the payment itself
      const { error: deleteError } = await supabase
        .from("payments")
        .delete()
        .eq("id", id);

      if (deleteError) {
        console.error("Error deleting payment:", deleteError);
        throw new Error(`Failed to delete payment: ${deleteError.message}`);
      }

      // 5. Recalculate customer balance after deletion
      try {
        await ledgerService.recalculateCustomerBalance(payment.customer_id);
        console.log("Customer balance recalculated after payment deletion");
      } catch (recalcError) {
        console.log("Error recalculating balance:", recalcError);
      }

      console.log("Payment deleted successfully");
    } catch (error: any) {
      console.error("Error in deletePayment:", error);
      throw error;
    }
  },

  // Helper function to check if payment fully covers invoices
  async isPaymentFullForInvoices(paymentId: string): Promise<boolean> {
    try {
      // First check if payment has any invoice allocations
      const { data: allocations } = await supabase
        .from("payment_allocations")
        .select("invoice_id, amount")
        .eq("payment_id", paymentId)
        .not("invoice_id", "is", null);

      if (!allocations || allocations.length === 0) {
        // Check if payment is directly linked to an invoice
        const { data: payment } = await supabase
          .from("payments")
          .select("invoice_id, total_received")
          .eq("id", paymentId)
          .single();

        if (payment && payment.invoice_id) {
          const { data: invoice } = await supabase
            .from("invoices")
            .select("pending_amount, total_amount, paid_amount")
            .eq("id", payment.invoice_id)
            .single();

          if (invoice) {
            const paymentAmount = payment.total_received;
            const pendingBeforePayment =
              invoice.total_amount - (invoice.paid_amount - paymentAmount);
            return paymentAmount >= pendingBeforePayment;
          }
        }
        return true; // No invoices allocated, so it's "full" by default
      }

      // Check each allocated invoice
      for (const alloc of allocations) {
        if (!alloc.invoice_id) continue;

        const { data: invoice } = await supabase
          .from("invoices")
          .select("pending_amount, total_amount, paid_amount")
          .eq("id", alloc.invoice_id)
          .single();

        if (invoice && alloc.amount < invoice.pending_amount) {
          return false; // Partial payment found
        }
      }

      return true; // All invoices are fully covered
    } catch (error) {
      console.error("Error checking payment coverage:", error);
      return true; // Default to true on error
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
          invoice:invoices(*),
          allocations:payment_allocations(*)
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

  // Get invoices paid by a payment
  async getInvoicesPaidByPayment(
    paymentId: string
  ): Promise<
    Array<{ invoice_id: string; invoice_number: string; amount: number }>
  > {
    try {
      // Check payment_allocations table for invoice allocations
      const { data: allocations } = await supabase
        .from("payment_allocations")
        .select("*")
        .eq("payment_id", paymentId)
        .or("payee_type.eq.invoice,purpose.like.%invoice%");

      const invoicePayments: Array<{
        invoice_id: string;
        invoice_number: string;
        amount: number;
      }> = [];

      if (allocations) {
        for (const alloc of allocations) {
          // Try to extract invoice ID from various fields
          let invoiceId: string | null = null;
          let invoiceNumber: string = "Unknown";

          if (alloc.payee_type === "invoice") {
            invoiceId = alloc.payee_name;
            // Try to get invoice number
            if (invoiceId) {
              const { data: invoice } = await supabase
                .from("invoices")
                .select("invoice_number")
                .eq("id", invoiceId)
                .single();
              if (invoice) {
                invoiceNumber = invoice.invoice_number;
              }
            }
          } else if (alloc.purpose?.includes("INV-")) {
            // Extract invoice number from purpose
            const match = alloc.purpose.match(/INV-(\d+)/);
            if (match) {
              const invoiceNum = `INV-${match[1]}`;
              const { data: invoice } = await supabase
                .from("invoices")
                .select("id, invoice_number")
                .eq("invoice_number", invoiceNum)
                .single();

              if (invoice) {
                invoiceId = invoice.id;
                invoiceNumber = invoice.invoice_number;
              }
            }
          }

          if (invoiceId) {
            invoicePayments.push({
              invoice_id: invoiceId,
              invoice_number: invoiceNumber,
              amount: alloc.amount,
            });
          }
        }
      }

      // Also check if payment is directly linked to an invoice
      const { data: payment } = await supabase
        .from("payments")
        .select("invoice_id, total_received")
        .eq("id", paymentId)
        .single();

      if (payment && payment.invoice_id) {
        const { data: invoice } = await supabase
          .from("invoices")
          .select("invoice_number")
          .eq("id", payment.invoice_id)
          .single();

        if (invoice) {
          // Check if this invoice is already in the list
          const existing = invoicePayments.find(
            (inv) => inv.invoice_id === payment.invoice_id
          );
          if (!existing) {
            invoicePayments.push({
              invoice_id: payment.invoice_id,
              invoice_number: invoice.invoice_number,
              amount: payment.total_received,
            });
          }
        }
      }

      return invoicePayments;
    } catch (error) {
      console.log("Error getting invoices paid by payment:", error);
      return [];
    }
  },

  // Add this debug method to paymentService.ts temporarily:
  async debugOpeningBalance(customerId: string): Promise<any> {
    try {
      console.log("=== DEBUG Opening Balance ===");
      console.log("Customer ID:", customerId);

      // 1. Check ledger entry
      const { data: ledgerEntry, error: ledgerError } = await supabase
        .from("ledger_entries")
        .select("*")
        .eq("customer_id", customerId)
        .eq("type", "opening_balance")
        .single();

      console.log("Ledger Entry:", ledgerEntry);
      console.log("Ledger Error:", ledgerError);

      // 2. Check opening_balance_payments table
      const { data: obPayments, error: obError } = await supabase
        .from("opening_balance_payments")
        .select("*")
        .eq("customer_id", customerId);

      console.log("Opening Balance Payments:", obPayments);
      console.log("Opening Balance Payments Error:", obError);

      // 3. Check all payments for this customer
      const { data: allPayments, error: paymentsError } = await supabase
        .from("payments")
        .select("*")
        .eq("customer_id", customerId);

      console.log("All Payments:", allPayments);

      return {
        ledgerEntry,
        obPayments,
        allPayments,
      };
    } catch (error) {
      console.error("Debug error:", error);
      return null;
    }
  },
};
