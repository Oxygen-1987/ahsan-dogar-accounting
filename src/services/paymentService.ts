import { supabase } from "./supabaseClient";
import type {
  Payment,
  PaymentDistribution,
  PaymentStatus,
  PaymentMethod,
  PaymentDistributionFormData,
  PaymentFormData,
} from "../types";
import { invoiceService } from "./invoiceService";
import { ledgerService } from "./ledgerService";
import { paymentApplicationService } from "./paymentApplicationService";
import { discountService } from "./discountService";
import dayjs from "dayjs";

export const paymentService = {
  // Get all payments with distributions
  async getAllPayments(): Promise<{ payments: Payment[]; summary: any }> {
    try {
      console.time("getAllPayments");

      // SINGLE QUERY with proper joins - replaces multiple sequential calls
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
        invoice:invoices(
          id,
          invoice_number,
          issue_date,
          due_date,
          total_amount,
          paid_amount,
          pending_amount,
          status
        ),
        distributions:payment_distributions!payment_id(*)
      `
        )
        .order("created_at", { ascending: false });

      if (error) {
        console.log("Supabase error loading payments:", error.message);
        throw error;
      }

      // Calculate summary - SAME AS BEFORE
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

      console.timeEnd("getAllPayments");
      console.log(`Loaded ${paymentsList.length} payments efficiently`);

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
        customer:customers(*)
      `
        )
        .eq("id", id)
        .single();

      if (error) {
        console.log("Supabase error loading payment:", error.message);
        return null;
      }

      // Get distributions separately
      const { data: distributions } = await supabase
        .from("payment_distributions")
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
        distributions: distributions || [], // Changed from allocations to distributions
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

      const openingAmount = openingEntry.debit || 0;
      console.log("Opening balance (debit):", openingAmount);

      // 2. Get ALL ledger entries to find payments against opening balance
      const { data: allEntries, error: entriesError } = await supabase
        .from("ledger_entries")
        .select("*")
        .eq("customer_id", customerId)
        .order("date", { ascending: true });

      let paidAmount = 0;

      if (!entriesError && allEntries) {
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

  // Sync existing opening balance payments
  async syncExistingOpeningBalancePayments(customerId: string): Promise<void> {
    try {
      console.log("Syncing existing opening balance payments...");

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
          const { data: existingHidden } = await supabase
            .from("ledger_entries")
            .select("id")
            .eq("customer_id", customerId)
            .eq("reference_id", payment.id)
            .eq("type", "opening_balance_payment")
            .eq("is_hidden", true)
            .single();

          if (!existingHidden) {
            let amount = 0;
            const notesLower = payment.notes.toLowerCase();

            if (
              notesLower.includes("100,000") ||
              notesLower.includes("100000")
            ) {
              amount = 100000;
            } else if (notesLower.includes("opening")) {
              const { data: invoiceAllocations } = await supabase
                .from("payment_distributions") // Changed table name
                .select("amount")
                .eq("payment_id", payment.id);

              if (!invoiceAllocations || invoiceAllocations.length === 0) {
                amount = payment.total_received;
              }
            }

            if (amount > 0) {
              const { error: appError } = await supabase
                .from("customer_payment_applications")
                .insert([
                  {
                    payment_id: payment.id,
                    customer_id: customerId,
                    amount: amount,
                    application_date: payment.payment_date,
                    notes: `Opening balance payment`,
                  },
                ]);

              if (appError) {
                console.error(
                  "Failed to save to customer_payment_applications:",
                  appError
                );
              } else {
                console.log(
                  "✅ Recorded opening balance payment in new system"
                );
              }

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

  // Create customer payment
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
    discount_amount?: number;
    discount_invoice_id?: string;
    discount_reason?: string;
  }): Promise<Payment> {
    try {
      console.log("Creating payment with data:", paymentData);

      // Get the last payment number
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

      const paymentNumber = `PAY-${currentYear}-${nextSequence
        .toString()
        .padStart(3, "0")}`;

      console.log("Generated payment number:", paymentNumber);

      // Check invoice allocations
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
              const currentPending =
                invoice.pending_amount ||
                invoice.total_amount - invoice.paid_amount;

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
          }
        }
      }

      // Determine payment status
      let paymentStatus: PaymentStatus;

      if (
        paymentData.payment_method === "cheque" ||
        paymentData.payment_method === "parchi"
      ) {
        paymentStatus = "pending";
      } else {
        paymentStatus = isFullPayment ? "completed" : "partial";
      }

      console.log("Payment status determined:", {
        method: paymentData.payment_method,
        isFullPayment,
        status: paymentStatus,
      });

      const primaryInvoiceId =
        paymentData.invoice_allocations?.[0]?.invoice_id || null;

      const paymentInsertData: any = {
        payment_number: paymentNumber,
        customer_id: paymentData.customer_id,
        payment_date: paymentData.payment_date,
        total_received: paymentData.total_received,
        payment_method: paymentData.payment_method,
        status: paymentStatus,
        notes: paymentData.notes || null,
      };

      // Add discount fields if provided
      if (paymentData.discount_amount && paymentData.discount_amount > 0) {
        paymentInsertData.discount_amount = paymentData.discount_amount;
        paymentInsertData.discount_invoice_id = paymentData.discount_invoice_id;
        paymentInsertData.discount_reason = paymentData.discount_reason;
      }

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

      // Store invoice allocations in payment_distributions table
      if (
        paymentData.invoice_allocations &&
        paymentData.invoice_allocations.length > 0
      ) {
        console.log(
          "Storing invoice allocations in payment_distributions table..."
        );

        for (const allocation of paymentData.invoice_allocations) {
          if (allocation.amount > 0) {
            try {
              const { data: invoice } = await supabase
                .from("invoices")
                .select("invoice_number")
                .eq("id", allocation.invoice_id)
                .single();

              const invoiceNumber = invoice?.invoice_number || "Unknown";

              // Create distribution record
              await supabase.from("payment_distributions").insert([
                {
                  payment_id: payment.id,
                  payee_name: allocation.invoice_id,
                  payee_type: "invoice",
                  amount: allocation.amount,
                  purpose: `Payment for invoice ${invoiceNumber}`,
                  allocation_date: paymentData.payment_date,
                  status: "allocated",
                  notes: `Customer payment ${payment.payment_number}`,
                },
              ]);

              console.log(
                `✅ Stored distribution: ${allocation.amount} to invoice ${invoiceNumber}`
              );
            } catch (allocationError) {
              console.error(
                `Error storing distribution for invoice ${allocation.invoice_id}:`,
                allocationError
              );
            }
          }
        }
      }

      // Store opening balance distribution if any
      if (paymentData.opening_balance_allocation?.amount) {
        const openingAmount = paymentData.opening_balance_allocation.amount;
        await supabase.from("payment_distributions").insert([
          {
            payment_id: payment.id,
            payee_name: "opening_balance",
            payee_type: "opening_balance",
            amount: openingAmount,
            purpose: `Payment against opening balance`,
            allocation_date: paymentData.payment_date,
            status: "allocated",
            notes: `Customer payment ${payment.payment_number}`,
          },
        ]);
        console.log(`✅ Stored opening balance distribution: ${openingAmount}`);
      }

      // Create ledger entry
      try {
        const hasOpeningBalanceAllocation =
          paymentData.opening_balance_allocation?.amount > 0;
        const hasInvoiceAllocations =
          paymentData.invoice_allocations &&
          paymentData.invoice_allocations.length > 0;

        let ledgerDescription = "";

        if (hasOpeningBalanceAllocation && hasInvoiceAllocations) {
          // CHANGE FROM verbose description to simple one
          ledgerDescription = `Payment ${payment.payment_number}`;
        } else if (hasOpeningBalanceAllocation) {
          // CHANGE FROM: ledgerDescription = `Payment ${payment.payment_number} - PKR ${paymentData.opening_balance_allocation!.amount.toLocaleString()} to opening balance`;
          // CHANGE TO:
          ledgerDescription = `Payment ${payment.payment_number}`;
        } else if (hasInvoiceAllocations) {
          // CHANGE FROM: ledgerDescription = `Payment ${payment.payment_number} - PKR ${invoiceTotal.toLocaleString()} to ${paymentData.invoice_allocations!.length} invoice(s)`;
          // CHANGE TO:
          ledgerDescription = `Payment ${payment.payment_number}`;
        } else {
          ledgerDescription = `Payment ${payment.payment_number}`;
        }

        // If payment status is partial or pending, you can add a suffix:
        if (paymentStatus === "partial") {
          ledgerDescription += " (Partial)";
        }
        if (paymentStatus === "pending") {
          ledgerDescription += " (Pending)";
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

      // Apply discount if any
      if (
        paymentData.discount_amount &&
        paymentData.discount_amount > 0 &&
        paymentData.discount_invoice_id
      ) {
        try {
          console.log(
            `Applying discount ${paymentData.discount_amount} to invoice ${paymentData.discount_invoice_id}`
          );

          await discountService.applyDiscountToInvoice(
            paymentData.customer_id,
            paymentData.discount_invoice_id,
            payment.id,
            {
              amount: paymentData.discount_amount,
              reason: paymentData.discount_reason || "Discount",
              date: paymentData.payment_date,
              paymentNumber: payment.payment_number,
            }
          );

          console.log("✅ Discount applied successfully");
        } catch (discountError) {
          console.error("❌ Error applying discount:", discountError);
        }
      }

      // Apply opening balance payment if any
      if (paymentData.opening_balance_allocation?.amount) {
        try {
          const openingBalanceAmount =
            paymentData.opening_balance_allocation.amount;

          console.log(`=== RECORDING OPENING BALANCE PAYMENT ===`);
          console.log("Amount:", openingBalanceAmount);
          console.log("Customer:", paymentData.customer_id);
          console.log("Payment:", payment.id);

          const { data: application, error: appError } = await supabase
            .from("customer_payment_applications")
            .insert([
              {
                payment_id: payment.id,
                customer_id: paymentData.customer_id,
                amount: openingBalanceAmount,
                application_date: paymentData.payment_date,
                notes: `Opening balance payment - ${payment.payment_number}`,
              },
            ])
            .select()
            .single();

          if (appError) {
            console.error(
              "❌ Failed to save to customer_payment_applications:",
              appError
            );
            throw new Error(
              `Failed to record opening balance payment: ${appError.message}`
            );
          } else {
            console.log(
              "✅ Saved to customer_payment_applications:",
              application
            );
          }

          const { data: customer } = await supabase
            .from("customers")
            .select("opening_balance")
            .eq("id", paymentData.customer_id)
            .single();

          if (customer) {
            const newOpeningBalance = Math.max(
              0,
              customer.opening_balance - openingBalanceAmount
            );

            const { error: updateError } = await supabase
              .from("customers")
              .update({
                opening_balance: newOpeningBalance,
                updated_at: new Date().toISOString(),
              })
              .eq("id", paymentData.customer_id);

            if (updateError) {
              console.error("❌ Failed to update customer:", updateError);
            } else {
              console.log(
                `✅ Customer opening_balance updated: ${customer.opening_balance} → ${newOpeningBalance}`
              );
            }
          }

          console.log("=== OPENING BALANCE PAYMENT RECORDED ===");
        } catch (error) {
          console.error("❌ Error recording opening balance payment:", error);
        }
      }

      // Apply invoice allocations via paymentApplicationService
      if (paymentData.invoice_allocations) {
        for (const allocation of paymentData.invoice_allocations) {
          if (allocation.amount > 0) {
            try {
              console.log(
                `Applying invoice payment via paymentApplicationService: ${allocation.amount} to invoice ${allocation.invoice_id}`
              );

              await paymentApplicationService.applyPayment({
                payment_id: payment.id,
                customer_id: paymentData.customer_id,
                invoice_id: allocation.invoice_id,
                amount: allocation.amount,
                application_date: paymentData.payment_date,
                notes: `Payment for invoice`,
              });

              console.log(
                `✅ Invoice payment applied via new system: ${allocation.amount} to invoice ${allocation.invoice_id}`
              );
            } catch (applicationError) {
              console.error(
                `❌ Failed to apply invoice payment via new system for invoice ${allocation.invoice_id}:`,
                applicationError
              );
              await invoiceService.updateInvoicePayment(
                allocation.invoice_id,
                allocation.amount
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
      distributions:payment_distributions(*)  // Changed from allocations
    `
          )
          .eq("id", payment.id)
          .single();

        if (fetchError) {
          console.error("Error fetching payment with customer:", fetchError);
          return {
            ...payment,
            distributions: [], // Changed from allocations
          };
        }

        return fullPayment;
      } catch (fetchError: any) {
        console.error("Error in final fetch:", fetchError);
        return {
          ...payment,
          distributions: [], // Changed from allocations
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
        distributions: distributions || [], // Changed from allocations
      };
    } catch (error) {
      console.error("Error in updatePayment:", error);
      throw error;
    }
  },

  // Add distribution to payment (for suppliers/owners/expenses)
  async addDistribution(
    paymentId: string,
    distributionData: PaymentDistributionFormData // Changed type
  ): Promise<PaymentDistribution> {
    // Changed return type
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
        distributions: distributions || [], // Changed from allocations
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

      // Get all invoices for this customer (FIFO basis)
      const { data: allInvoices, error: invoicesError } = await supabase
        .from("invoices")
        .select("*")
        .eq("customer_id", payment.customer_id)
        .order("due_date", { ascending: true });

      if (invoicesError) {
        console.error("❌ Error fetching invoices:", invoicesError);
        throw invoicesError;
      }

      console.log(`📊 Found ${allInvoices?.length || 0} invoices for customer`);

      // Determine which invoices were paid by this payment
      const paidInvoices = this.determinePaidInvoices(
        payment,
        allInvoices || []
      );

      console.log("🎯 INVOICES TO REVERSE PAYMENT FROM:", paidInvoices);

      // Reverse payments from invoices
      let totalReversed = 0;
      for (const invoice of paidInvoices) {
        if (totalReversed >= payment.total_received) break;

        const amountToReverse = Math.min(
          invoice.amount,
          payment.total_received - totalReversed
        );

        console.log(
          `🔄 Reversing ${amountToReverse} from invoice ${invoice.invoice_number}`
        );

        try {
          await invoiceService.reverseInvoicePayment(
            invoice.id,
            amountToReverse
          );
          totalReversed += amountToReverse;
          console.log(`✅ Reversed ${amountToReverse}`);
        } catch (reverseError) {
          console.error(
            `❌ Error reversing invoice ${invoice.invoice_number}:`,
            reverseError
          );
        }
      }

      // Handle discount reversal if any
      if (hasDiscount && discountInvoiceId && discountAmount > 0) {
        console.log(
          `🔄 Reversing discount: PKR ${discountAmount} from invoice ${discountInvoiceId}`
        );

        try {
          // Option 1: Use discountService.reverseDiscount if available
          try {
            await discountService.reverseDiscount(
              payment.id,
              discountInvoiceId,
              discountAmount
            );
            console.log("✅ Discount reversed using discountService");
          } catch (discountServiceError) {
            console.log(
              "discountService.reverseDiscount not available, using direct approach"
            );

            // Option 2: Direct approach
            // 1. First, check if discount entry exists in ledger_entries
            const { data: discountEntries, error: discountFetchError } =
              await supabase
                .from("ledger_entries")
                .select("*")
                .eq("reference_id", payment.id)
                .eq("type", "discount")
                .eq("is_hidden", true);

            if (
              !discountFetchError &&
              discountEntries &&
              discountEntries.length > 0
            ) {
              // Delete the hidden discount ledger entries
              await supabase
                .from("ledger_entries")
                .delete()
                .eq("reference_id", payment.id)
                .eq("type", "discount");

              console.log(
                `✅ Deleted ${discountEntries.length} discount ledger entries`
              );
            }

            // 2. Update the invoice to remove discount using invoiceService
            if (discountInvoiceId) {
              await invoiceService.reverseDiscount(
                discountInvoiceId,
                discountAmount
              );
            }
          }
        } catch (discountError) {
          console.error("❌ Error reversing discount:", discountError);
        }
      }

      // Handle opening balance distribution if any
      const openingBalanceDistribution = payment.distributions?.find(
        (dist) => dist.payee_type === "opening_balance"
      );

      if (openingBalanceDistribution && openingBalanceDistribution.amount > 0) {
        console.log(
          `🔄 Reversing opening balance distribution: ${openingBalanceDistribution.amount}`
        );

        try {
          const { data: customer } = await supabase
            .from("customers")
            .select("opening_balance")
            .eq("id", payment.customer_id)
            .single();

          if (customer) {
            const newOpeningBalance =
              customer.opening_balance + openingBalanceDistribution.amount;

            await supabase
              .from("customers")
              .update({
                opening_balance: newOpeningBalance,
                updated_at: new Date().toISOString(),
              })
              .eq("id", payment.customer_id);

            console.log(
              `✅ Opening balance restored: ${customer.opening_balance} → ${newOpeningBalance}`
            );
          }
        } catch (obError) {
          console.error("❌ Error reversing opening balance:", obError);
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

  // Helper function to determine which invoices were paid by a payment
  determinePaidInvoices(
    payment: Payment,
    allInvoices: any[]
  ): Array<{ id: string; invoice_number: string; amount: number }> {
    const result: Array<{
      id: string;
      invoice_number: string;
      amount: number;
    }> = [];

    // 1. Check explicit distributions first
    const invoiceDistributions = payment.distributions?.filter(
      // Changed from allocations
      (dist) => dist.payee_type === "invoice"
    );

    if (invoiceDistributions && invoiceDistributions.length > 0) {
      for (const distribution of invoiceDistributions) {
        const invoice = allInvoices.find(
          (inv) => inv.id === distribution.payee_name
        );
        if (invoice) {
          result.push({
            id: invoice.id,
            invoice_number: invoice.invoice_number,
            amount: distribution.amount,
          });
        }
      }
    }

    // 2. Check if payment is linked to a specific invoice
    if (
      payment.invoice_id &&
      !result.find((r) => r.id === payment.invoice_id)
    ) {
      const invoice = allInvoices.find((inv) => inv.id === payment.invoice_id);
      if (invoice) {
        result.push({
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          amount: payment.total_received,
        });
      }
    }

    // 3. Check payment notes for invoice mentions
    if (payment.notes) {
      const invoiceMatches = payment.notes.match(/INV-\d+-\d+/g);
      if (invoiceMatches) {
        for (const invoiceNumber of invoiceMatches) {
          const invoice = allInvoices.find(
            (inv) => inv.invoice_number === invoiceNumber
          );
          if (invoice && !result.find((r) => r.id === invoice.id)) {
            const remainingAmount =
              payment.total_received -
              result.reduce((sum, r) => sum + r.amount, 0);
            const estimatedAmount = Math.max(0, remainingAmount);

            result.push({
              id: invoice.id,
              invoice_number: invoice.invoice_number,
              amount: estimatedAmount,
            });
          }
        }
      }
    }

    // 4. If still no invoices found, use FIFO from all paid invoices
    if (result.length === 0) {
      const paidInvoices = allInvoices.filter((inv) => inv.paid_amount > 0);

      paidInvoices.sort((a, b) => {
        const aRatio = a.paid_amount / a.total_amount;
        const bRatio = b.paid_amount / b.total_amount;
        return bRatio - aRatio;
      });

      let remainingAmount = payment.total_received;
      for (const invoice of paidInvoices) {
        if (remainingAmount <= 0) break;

        const amountToAllocate = Math.min(invoice.paid_amount, remainingAmount);

        result.push({
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          amount: amountToAllocate,
        });

        remainingAmount -= amountToAllocate;
      }
    }

    return result;
  },

  // Helper function to check if payment fully covers invoices
  async isPaymentFullForInvoices(paymentId: string): Promise<boolean> {
    try {
      const { data: allocations } = await supabase
        .from("payment_distributions") // Changed table name
        .select("invoice_id, amount")
        .eq("payment_id", paymentId)
        .not("invoice_id", "is", null);

      if (!allocations || allocations.length === 0) {
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
        return true;
      }

      for (const alloc of allocations) {
        if (!alloc.invoice_id) continue;

        const { data: invoice } = await supabase
          .from("invoices")
          .select("pending_amount, total_amount, paid_amount")
          .eq("id", alloc.invoice_id)
          .single();

        if (invoice && alloc.amount < invoice.pending_amount) {
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error("Error checking payment coverage:", error);
      return true;
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
        distributions:payment_distributions(*)  // Changed from allocations
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
      const { data: allocations } = await supabase
        .from("payment_distributions") // Changed table name
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
          let invoiceId: string | null = null;
          let invoiceNumber: string = "Unknown";

          if (alloc.payee_type === "invoice") {
            invoiceId = alloc.payee_name;
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

  // Debug method for opening balance
  async debugOpeningBalance(customerId: string): Promise<any> {
    try {
      console.log("=== DEBUG Opening Balance ===");
      console.log("Customer ID:", customerId);

      const { data: ledgerEntry, error: ledgerError } = await supabase
        .from("ledger_entries")
        .select("*")
        .eq("customer_id", customerId)
        .eq("type", "opening_balance")
        .single();

      console.log("Ledger Entry:", ledgerEntry);
      console.log("Ledger Error:", ledgerError);

      const { data: obPayments, error: obError } = await supabase
        .from("opening_balance_payments")
        .select("*")
        .eq("customer_id", customerId);

      console.log("Opening Balance Payments:", obPayments);
      console.log("Opening Balance Payments Error:", obError);

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
