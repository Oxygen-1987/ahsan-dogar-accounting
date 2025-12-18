import { supabase } from "./supabaseClient";
import type {
  Payment,
  PaymentAllocation,
  PaymentStatus,
  PaymentMethod,
  PaymentAllocationFormData,
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

  // Create customer payment - CORRECTED VERSION
  async createCustomerPayment(paymentData: {
    customer_id: string;
    payment_date: string;
    total_received: number;
    payment_method: PaymentMethod;
    reference_number?: string;
    bank_name?: string;
    cheque_date?: string;
    notes?: string;
    invoice_allocations?: { invoice_id: string; amount: number }[];
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

      // Create ledger entry for the payment
      try {
        const ledgerDescription = `Payment ${payment.payment_number} received${
          paymentStatus === "partial" ? " (Partial Payment)" : ""
        }${paymentStatus === "pending" ? " (Pending Clearance)" : ""}`;

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

        console.log("✅ Ledger entry created successfully");
      } catch (ledgerError: any) {
        console.error("❌ Failed to create ledger entry:", ledgerError.message);
        // Don't throw here, continue with invoice updates
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
              // Continue with other invoices even if one fails
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
            customer:customers(*)
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

        // Get allocations if any
        const { data: allocations } = await supabase
          .from("payment_allocations")
          .select("*")
          .eq("payment_id", payment.id);

        return {
          ...fullPayment,
          allocations: allocations || [],
        };
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
          // We need to check the purpose or payee_type field
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

      // 2. Delete payment allocations (if any)
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

      // 3. Finally delete the payment itself
      const { error: deleteError } = await supabase
        .from("payments")
        .delete()
        .eq("id", id);

      if (deleteError) {
        console.error("Error deleting payment:", deleteError);
        throw new Error(`Failed to delete payment: ${deleteError.message}`);
      }

      // 4. Recalculate customer balance after deletion
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
};
