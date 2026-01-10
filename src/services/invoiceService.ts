import { supabase } from "./supabaseClient";
import type { Invoice, InvoiceFormData, InvoiceLineItem } from "../types";
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
      console.log("Creating ledger entry for invoice:", {
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
          description: `Invoice ${invoice.invoice_number}`,
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
      // First get the current invoice to calculate differences
      const { data: currentInvoice, error: fetchError } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchError) {
        console.log("Error fetching current invoice:", fetchError);
        throw fetchError;
      }

      // Calculate new total
      const newTotalAmount =
        updates.line_items?.reduce(
          (sum, item) => sum + (item.amount || 0),
          0
        ) || currentInvoice.total_amount;

      // Calculate amount difference
      const amountDifference = newTotalAmount - currentInvoice.total_amount;

      console.log("Invoice update details:", {
        currentTotal: currentInvoice.total_amount,
        newTotal: newTotalAmount,
        difference: amountDifference,
      });

      // Update the invoice in database
      const { data: updatedInvoice, error: updateError } = await supabase
        .from("invoices")
        .update({
          invoice_number:
            updates.invoice_number || currentInvoice.invoice_number,
          customer_id: updates.customer_id || currentInvoice.customer_id,
          issue_date: updates.issue_date || currentInvoice.issue_date,
          due_date: updates.due_date || currentInvoice.due_date,
          total_amount: newTotalAmount,
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

      if (updateError) {
        console.log("Supabase update error:", updateError);
        throw updateError;
      }

      // Update line items
      if (updates.line_items) {
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

      // Update ledger if amount changed or customer changed
      if (
        amountDifference !== 0 ||
        updates.customer_id !== currentInvoice.customer_id
      ) {
        console.log("Amount or customer changed, updating ledger...");

        // Remove the old ledger entry
        await ledgerService.removeLedgerEntry(id, "invoice");

        // Create new ledger entry with updated amount
        const targetCustomerId =
          updates.customer_id || currentInvoice.customer_id;
        const ledgerResult = await ledgerService.addLedgerEntry({
          customer_id: targetCustomerId,
          date: updates.issue_date || currentInvoice.issue_date,
          type: "invoice",
          reference_id: id,
          reference_number:
            updates.invoice_number || currentInvoice.invoice_number,
          debit: newTotalAmount,
          credit: 0,
          description: `Invoice ${
            updates.invoice_number || currentInvoice.invoice_number
          } updated`,
        });

        if (ledgerResult) {
          console.log("✅ Ledger entry updated for invoice");
        } else {
          console.log("⚠️ Ledger entry was not updated");
        }

        // If customer changed, recalculate balances for both old and new customers
        if (
          updates.customer_id &&
          updates.customer_id !== currentInvoice.customer_id
        ) {
          console.log("Customer changed, recalculating balances...");
          await ledgerService.recalculateCustomerBalance(
            currentInvoice.customer_id
          );
          await ledgerService.recalculateCustomerBalance(updates.customer_id);
        }
      }

      return {
        ...updatedInvoice,
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
        .select("customer_id, invoice_number")
        .eq("id", id)
        .single();

      if (fetchError) {
        console.log("Error fetching invoice:", fetchError);
        throw fetchError;
      }

      // 1. Remove ledger entry for this invoice
      try {
        await ledgerService.removeLedgerEntry(id, "invoice");
      } catch (ledgerError) {
        console.log("Note removing ledger entry:", ledgerError);
      }

      // 2. Delete line items first
      await supabase.from("invoice_items").delete().eq("invoice_id", id);

      // 3. Delete the invoice
      const { error } = await supabase.from("invoices").delete().eq("id", id);

      if (error) {
        console.log("Supabase delete error:", error);
        throw error;
      }

      // 4. Recalculate customer balance if invoice was found
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

  // Get customer invoices
  async getCustomerInvoices(customerId: string): Promise<Invoice[]> {
    try {
      const { data: invoices, error } = await supabase
        .from("invoices")
        .select(
          `
          *,
          customer:customers(*)
        `
        )
        .eq("customer_id", customerId)
        .order("issue_date", { ascending: false });

      if (error) {
        console.log("Error getting invoices by customer:", error);
        throw error;
      }

      // Load line items for each invoice
      const invoicesWithItems = await Promise.all(
        (invoices || []).map(async (invoice) => {
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

      return invoicesWithItems;
    } catch (error) {
      console.log("Error in getCustomerInvoices:", error);
      throw error;
    }
  },

  // Get invoice statistics
  async getInvoiceStats(customerId?: string): Promise<{
    totalInvoices: number;
    totalAmount: number;
  }> {
    try {
      let query = supabase.from("invoices").select("*");

      if (customerId) {
        query = query.eq("customer_id", customerId);
      }

      const { data: invoices, error } = await query;

      if (error) {
        console.log("Error getting invoice stats:", error);
        throw error;
      }

      const stats = {
        totalInvoices: invoices?.length || 0,
        totalAmount:
          invoices?.reduce((sum, inv) => sum + (inv.total_amount || 0), 0) || 0,
      };

      return stats;
    } catch (error) {
      console.log("Error in getInvoiceStats:", error);
      throw error;
    }
  },

  // Debug method
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
