import { supabase } from "./supabaseClient";
import type {
  Invoice,
  InvoiceFormData,
  InvoiceStatus,
  InvoiceLineItem,
} from "../types";
import dayjs from "dayjs";
import { ledgerService } from "./ledgerService";

export const invoiceService = {
  // Get all invoices with summary
  async getAllInvoices(): Promise<{ invoices: Invoice[]; summary: any }> {
    try {
      const { data: invoices, error } = await supabase
        .from("invoices")
        .select(
          `
          *,
          customer:customers(*)
        `
        )
        .order("created_at", { ascending: false });

      if (error) {
        console.log("Supabase error loading invoices:", error.message);
        throw error;
      }

      // Transform the data to match our Invoice type
      const transformedInvoices: Invoice[] = await Promise.all(
        (invoices || []).map(async (invoice) => {
          // Load line items for each invoice
          const { data: lineItems } = await supabase
            .from("invoice_items")
            .select("*")
            .eq("invoice_id", invoice.id);

          return {
            ...invoice,
            items: lineItems || [],
            customer: invoice.customer || undefined,
          };
        })
      );

      const summary = {
        totalInvoices: transformedInvoices.length,
        totalAmount: transformedInvoices.reduce(
          (sum, invoice) => sum + (invoice.total_amount || 0),
          0
        ),
        pendingAmount: transformedInvoices.reduce(
          (sum, invoice) => sum + (invoice.pending_amount || 0),
          0
        ),
        paidAmount: transformedInvoices.reduce(
          (sum, invoice) => sum + (invoice.paid_amount || 0),
          0
        ),
      };

      return {
        invoices: transformedInvoices,
        summary,
      };
    } catch (error) {
      console.log("Error loading invoices:", error);
      throw error;
    }
  },

  // Get invoice by ID
  async getInvoiceById(id: string): Promise<Invoice | null> {
    try {
      // First get the invoice with customer data
      const { data: invoice, error } = await supabase
        .from("invoices")
        .select(
          `
          *,
          customer:customers(*)
        `
        )
        .eq("id", id)
        .single();

      if (error) {
        console.log("Supabase error loading invoice:", error.message);
        return null;
      }

      // Then get the line items
      const { data: lineItems, error: itemsError } = await supabase
        .from("invoice_items")
        .select("*")
        .eq("invoice_id", id);

      if (itemsError) {
        console.log("Error loading line items:", itemsError);
      }

      return {
        ...invoice,
        items: lineItems || [],
        customer: invoice.customer || undefined,
      };
    } catch (error) {
      console.log("Error getting invoice:", error);
      return null;
    }
  },

  // Create new invoice
  async createInvoice(invoiceData: InvoiceFormData): Promise<Invoice> {
    // Calculate totals
    const total_amount =
      invoiceData.line_items?.reduce(
        (sum, item) => sum + (item.amount || 0),
        0
      ) || 0;

    try {
      let invoiceNumber = invoiceData.invoice_number;

      // If no invoice number provided, generate sequential one
      if (!invoiceNumber) {
        const currentYear = new Date().getFullYear();

        // Get ALL invoices for the current year
        const { data: invoices, error: invoicesError } = await supabase
          .from("invoices")
          .select("invoice_number")
          .ilike("invoice_number", `INV-${currentYear}-%`);

        let nextSequence = 1;

        if (!invoicesError && invoices && invoices.length > 0) {
          console.log(
            `Found ${invoices.length} invoices for year ${currentYear}`
          );

          // Extract sequence numbers from all invoice numbers
          const sequenceNumbers: number[] = [];

          invoices.forEach((invoice) => {
            const match = invoice.invoice_number.match(/INV-\d+-(\d+)/);
            if (match) {
              const sequenceNum = parseInt(match[1]);
              if (!isNaN(sequenceNum)) {
                sequenceNumbers.push(sequenceNum);
              }
            }
          });

          if (sequenceNumbers.length > 0) {
            const maxSequence = Math.max(...sequenceNumbers);
            nextSequence = maxSequence + 1;
            console.log(
              "Max sequence found:",
              maxSequence,
              "Next:",
              nextSequence
            );
          }
        }

        // Generate sequential invoice number (3 digits)
        invoiceNumber = `INV-${currentYear}-${nextSequence
          .toString()
          .padStart(3, "0")}`;
      }

      console.log("Using invoice number:", invoiceNumber);

      // Save to Supabase
      const { data: invoice, error } = await supabase
        .from("invoices")
        .insert([
          {
            invoice_number: invoiceNumber,
            customer_id: invoiceData.customer_id,
            issue_date: invoiceData.issue_date,
            due_date: invoiceData.due_date,
            total_amount: total_amount,
            paid_amount: 0,
            pending_amount: total_amount,
            status: "draft",
            notes: invoiceData.notes,
            payment_terms: invoiceData.payment_terms,
          },
        ])
        .select(
          `
        *,
        customer:customers(*)
      `
        )
        .single();

      if (error) {
        console.log("Supabase error creating invoice:", error.message);
        throw error;
      }

      // Save line items if invoice was created successfully
      if (invoiceData.line_items && invoiceData.line_items.length > 0) {
        const lineItemsData = invoiceData.line_items.map((item) => ({
          invoice_id: invoice.id,
          description: item.description,
          quantity: item.quantity,
          inches: item.inches,
          rate: item.rate,
          amount: item.amount,
        }));

        const { error: itemsError } = await supabase
          .from("invoice_items")
          .insert(lineItemsData);

        if (itemsError) {
          console.log("Error saving line items:", itemsError);
        }
      }

      console.log("Invoice created successfully:", invoice);

      // Create ledger entry for the invoice
      console.log("Attempting to create ledger entry for invoice:", {
        customer_id: invoiceData.customer_id,
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        amount: total_amount,
      });

      try {
        const ledgerResult = await ledgerService.addLedgerEntry({
          customer_id: invoiceData.customer_id,
          date: invoiceData.issue_date,
          type: "invoice",
          reference_id: invoice.id,
          reference_number: invoice.invoice_number,
          debit: total_amount,
          credit: 0,
          description: `Invoice ${invoice.invoice_number} issued`,
        });

        if (ledgerResult) {
          console.log("✅ Ledger entry created for invoice");
        } else {
          console.log(
            "⚠️ Ledger entry was not created (but invoice was saved)"
          );
        }
      } catch (ledgerError) {
        console.error("❌ Ledger error (non-critical):", ledgerError);
        // Don't throw, invoice was created successfully
      }

      return {
        ...invoice,
        items: invoiceData.line_items || [],
      };
    } catch (error) {
      console.log("Error creating invoice:", error);
      throw error;
    }
  },

  // Update invoice
  async updateInvoice(
    id: string,
    updates: Partial<InvoiceFormData>
  ): Promise<Invoice> {
    try {
      const total_amount = updates.line_items?.reduce(
        (sum, item) => sum + (item.amount || 0),
        0
      );

      const { data, error } = await supabase
        .from("invoices")
        .update({
          invoice_number: updates.invoice_number,
          customer_id: updates.customer_id,
          issue_date: updates.issue_date,
          due_date: updates.due_date,
          total_amount: total_amount,
          pending_amount: total_amount,
          notes: updates.notes,
          payment_terms: updates.payment_terms,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select(
          `
          *,
          customer:customers(*)
        `
        )
        .single();

      if (error) {
        console.log("Supabase update error:", error);
        throw error;
      }

      // Update line items
      if (updates.line_items && updates.line_items.length > 0) {
        // First delete existing line items
        await supabase.from("invoice_items").delete().eq("invoice_id", id);

        // Then insert new line items
        const lineItemsData = updates.line_items.map((item) => ({
          invoice_id: id,
          description: item.description,
          quantity: item.quantity,
          inches: item.inches,
          rate: item.rate,
          amount: item.amount,
        }));

        const { error: itemsError } = await supabase
          .from("invoice_items")
          .insert(lineItemsData);

        if (itemsError) {
          console.log("Error updating line items:", itemsError);
        }
      }

      return {
        ...data,
        items: updates.line_items || [],
      };
    } catch (error) {
      console.log("Error updating invoice:", error);
      throw error;
    }
  },

  // Delete invoice
  async deleteInvoice(id: string): Promise<void> {
    try {
      // First get the invoice to get customer_id
      const { data: invoice, error: fetchError } = await supabase
        .from("invoices")
        .select("customer_id, invoice_number, total_amount")
        .eq("id", id)
        .single();

      if (fetchError) {
        console.log("Error fetching invoice:", fetchError);
        throw fetchError;
      }

      // 1. FIRST: Remove ledger entry for this invoice
      try {
        await ledgerService.removeLedgerEntry(id, "invoice");
      } catch (ledgerError) {
        console.log("Note removing ledger entry:", ledgerError);
      }

      // 2. Delete the invoice
      const { error } = await supabase.from("invoices").delete().eq("id", id);

      if (error) {
        console.log("Supabase delete error:", error);
        throw error;
      }

      // 3. Recalculate customer balance if invoice was found
      if (invoice) {
        try {
          await ledgerService.recalculateCustomerBalance(invoice.customer_id);
          console.log("Customer balance recalculated after invoice deletion");
        } catch (recalcError) {
          console.log("Note recalculating customer balance:", recalcError);
        }
      }

      console.log(`Invoice ${id} deleted successfully`);
    } catch (error) {
      console.log("Error deleting invoice:", error);
      throw error;
    }
  },

  // Mark invoice as sent
  async markAsSent(id: string): Promise<Invoice> {
    try {
      const { data, error } = await supabase
        .from("invoices")
        .update({
          status: "sent",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select(
          `
          *,
          customer:customers(*)
        `
        )
        .single();

      if (error) {
        console.log("Supabase error marking as sent:", error.message);
        throw error;
      }

      return data;
    } catch (error) {
      console.log("Error marking invoice as sent:", error);
      throw error;
    }
  },

  // Get customer pending invoices
  async getCustomerPendingInvoices(customerId: string): Promise<Invoice[]> {
    try {
      // Get invoices with pending amounts
      const { data: invoices, error } = await supabase
        .from("invoices")
        .select(
          `
          *,
          customer:customers(*),
          items:invoice_items(*)
        `
        )
        .eq("customer_id", customerId)
        .gt("pending_amount", 0)
        .order("due_date", { ascending: true });

      if (error) {
        console.log("Supabase error loading customer invoices:", error.message);
        throw error;
      }

      return invoices || [];
    } catch (error) {
      console.log("Error loading customer pending invoices:", error);
      throw error;
    }
  },

  // Update invoice payment
  async updateInvoicePayment(
    invoiceId: string,
    paymentAmount: number
  ): Promise<Invoice> {
    try {
      console.log(
        `Updating invoice payment for ${invoiceId} with ${paymentAmount}`
      );

      // First get the current invoice
      const { data: currentInvoice, error: fetchError } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", invoiceId)
        .single();

      if (fetchError) {
        console.log("Error fetching invoice:", fetchError);
        throw fetchError;
      }

      console.log("Current invoice:", {
        total: currentInvoice.total_amount,
        paid: currentInvoice.paid_amount,
        pending: currentInvoice.pending_amount,
        status: currentInvoice.status,
      });

      const newPaidAmount = (currentInvoice.paid_amount || 0) + paymentAmount;
      const newPendingAmount = Math.max(
        0,
        currentInvoice.total_amount - newPaidAmount
      );

      // Update status based on new amounts
      let newStatus: InvoiceStatus = currentInvoice.status;
      if (newPendingAmount === 0) {
        newStatus = "paid";
      } else if (newPaidAmount > 0 && newPendingAmount > 0) {
        newStatus = "partial";
      } else if (newPaidAmount === 0 && currentInvoice.status !== "draft") {
        newStatus = "sent";
      }

      console.log("New values:", {
        newPaidAmount,
        newPendingAmount,
        newStatus,
      });

      const { data: updatedInvoice, error } = await supabase
        .from("invoices")
        .update({
          paid_amount: newPaidAmount,
          pending_amount: newPendingAmount,
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoiceId)
        .select(
          `
        *,
        customer:customers(*)
      `
        )
        .single();

      if (error) {
        console.log("Error updating invoice:", error);
        throw error;
      }

      console.log("Invoice updated successfully:", updatedInvoice);

      // DO NOT CREATE LEDGER ENTRY HERE - It's already created by payment service
      // The payment service creates ONE ledger entry for the total payment

      return updatedInvoice;
    } catch (error) {
      console.log("Error updating invoice payment:", error);
      throw error;
    }
  },

  // Add this method to invoiceService.ts
  async reverseInvoicePayment(
    invoiceId: string,
    paymentAmount: number
  ): Promise<Invoice> {
    try {
      console.log(
        `Reversing payment ${paymentAmount} from invoice ${invoiceId}`
      );

      // First get the current invoice
      const { data: currentInvoice, error: fetchError } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", invoiceId)
        .single();

      if (fetchError) {
        console.log("Error fetching invoice for reversal:", fetchError);
        throw fetchError;
      }

      const newPaidAmount = Math.max(
        0,
        (currentInvoice.paid_amount || 0) - paymentAmount
      );
      const newPendingAmount = currentInvoice.total_amount - newPaidAmount;

      console.log("Before reversal:", {
        total: currentInvoice.total_amount,
        paid: currentInvoice.paid_amount,
        pending: currentInvoice.pending_amount,
      });

      console.log("After reversal:", {
        newPaidAmount,
        newPendingAmount,
      });

      // Update status based on new amounts
      let newStatus: InvoiceStatus = currentInvoice.status;
      if (newPendingAmount === currentInvoice.total_amount) {
        newStatus = "sent"; // No payments left
      } else if (newPendingAmount > 0 && newPaidAmount > 0) {
        newStatus = "partial";
      } else if (newPendingAmount === 0) {
        newStatus = "paid";
      }

      const { data: updatedInvoice, error } = await supabase
        .from("invoices")
        .update({
          paid_amount: newPaidAmount,
          pending_amount: newPendingAmount,
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoiceId)
        .select(
          `
        *,
        customer:customers(*)
      `
        )
        .single();

      if (error) {
        console.log("Error reversing invoice payment:", error);
        throw error;
      }

      console.log(
        `Successfully reversed payment ${paymentAmount} from invoice ${invoiceId}. New status: ${newStatus}`
      );

      // NO LEDGER ENTRY CREATED HERE - Payment deletion handles ledger

      return updatedInvoice;
    } catch (error) {
      console.log("Error reversing invoice payment:", error);
      throw error;
    }
  },

  // Add this to invoiceService.ts
  async debugInvoiceBalance(invoiceId: string): Promise<void> {
    try {
      const { data: invoice } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", invoiceId)
        .single();

      console.log("=== INVOICE DEBUG ===");
      console.log("Invoice:", invoice);
      console.log("Total:", invoice?.total_amount);
      console.log("Paid:", invoice?.paid_amount);
      console.log("Pending:", invoice?.pending_amount);
      console.log("Status:", invoice?.status);
      console.log("=== END DEBUG ===");
    } catch (error) {
      console.log("Debug error:", error);
    }
  },

  // Debug method to check current state
  async debugCustomerInvoices(customerId: string): Promise<void> {
    console.log("=== DEBUG CUSTOMER INVOICES ===");

    const { data: invoices } = await supabase
      .from("invoices")
      .select("*")
      .eq("customer_id", customerId);

    console.log("Database invoices for customer:", invoices);
    console.log("=== END DEBUG ===");
  },
};
