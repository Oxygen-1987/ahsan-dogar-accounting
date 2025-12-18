// src/services/customerService.ts
import { supabase } from "./supabaseClient";
import type { Customer, CustomerFormData } from "../types";
import { ledgerService } from "./ledgerService";

export const customerService = {
  // Check if customers table has proper structure
  async checkTableStructure(): Promise<{ isValid: boolean; issues: string[] }> {
    try {
      const issues: string[] = [];

      // Check if customers table exists and has required columns
      const { data, error } = await supabase
        .from("customers")
        .select("id, first_name, last_name, company_name, mobile")
        .limit(1);

      if (error) {
        if (error.code === "42P01") {
          issues.push("Customers table does not exist");
        } else if (error.message.includes("column")) {
          issues.push("Missing required columns in customers table");
        } else {
          issues.push(`Database error: ${error.message}`);
        }
        return { isValid: false, issues };
      }

      // If we get here, table structure is valid
      return { isValid: true, issues: [] };
    } catch (error) {
      return { isValid: false, issues: ["Connection failed"] };
    }
  },

  // Compatibility method for SupabaseSetupHelper
  async isUsingMockData(): Promise<boolean> {
    const { isValid } = await this.checkTableStructure();
    return !isValid;
  },

  // Compatibility method for SupabaseSetupHelper
  async resetConnection(): Promise<void> {
    // This triggers a re-check of table structure
    await this.checkTableStructure();
  },

  // Get all customers with summary
  async getAllCustomers(): Promise<{ customers: Customer[]; summary: any }> {
    try {
      // 1. Get all customers
      const { data: customers, error: customersError } = await supabase
        .from("customers")
        .select("*")
        .order("created_at", { ascending: false });

      if (customersError) {
        console.log(
          "Supabase error loading customers:",
          customersError.message
        );
        throw customersError;
      }

      // 2. Get all invoices to calculate summaries
      const { data: allInvoices, error: invoicesError } = await supabase
        .from("invoices")
        .select("customer_id, pending_amount, paid_amount, status")
        .neq("status", "cancelled"); // Exclude cancelled invoices

      // 3. Get all payments to calculate total paid
      const { data: allPayments, error: paymentsError } = await supabase
        .from("payments")
        .select("customer_id, total_received, status");

      // Convert date strings to proper format if needed
      const formattedCustomers =
        customers?.map((customer) => ({
          ...customer,
          as_of_date:
            customer.as_of_date || new Date().toISOString().split("T")[0],
          created_at: customer.created_at || new Date().toISOString(),
          updated_at: customer.updated_at || new Date().toISOString(),
        })) || [];

      // Calculate summaries
      let totalOutstanding = 0;
      let totalOpenInvoices = 0;
      let totalPaid = 0;

      // Group invoices by customer
      const customerInvoices: Record<string, any[]> = {};
      if (allInvoices) {
        allInvoices.forEach((invoice) => {
          if (!customerInvoices[invoice.customer_id]) {
            customerInvoices[invoice.customer_id] = [];
          }
          customerInvoices[invoice.customer_id].push(invoice);
        });
      }

      // Group payments by customer
      const customerPayments: Record<string, any[]> = {};
      if (allPayments) {
        allPayments.forEach((payment) => {
          if (!customerPayments[payment.customer_id]) {
            customerPayments[payment.customer_id] = [];
          }
          customerPayments[payment.customer_id].push(payment);
        });
      }

      // Calculate totals
      if (allInvoices) {
        totalOutstanding = allInvoices.reduce(
          (sum, invoice) => sum + (invoice.pending_amount || 0),
          0
        );

        totalOpenInvoices = allInvoices.filter(
          (invoice) =>
            (invoice.pending_amount || 0) > 0 && invoice.status !== "paid"
        ).length;

        totalPaid = allInvoices.reduce(
          (sum, invoice) => sum + (invoice.paid_amount || 0),
          0
        );
      }

      const summary = {
        totalClients: formattedCustomers.length,
        totalOutstanding,
        totalOpenInvoices,
        totalPaid,
      };

      return {
        customers: formattedCustomers,
        summary,
      };
    } catch (error) {
      console.log("Error getting customers:", error);
      // Return empty summary on error
      return {
        customers: [],
        summary: {
          totalClients: 0,
          totalOutstanding: 0,
          totalOpenInvoices: 0,
          totalPaid: 0,
        },
      };
    }
  },

  // Create new customer with proper opening balance handling
  async createCustomer(customerData: CustomerFormData): Promise<Customer> {
    try {
      console.log("=== CREATE CUSTOMER START ===");
      console.log("Customer data:", customerData);

      // Prepare data for Supabase
      const customer = {
        first_name: customerData.first_name,
        last_name: customerData.last_name,
        company_name: customerData.company_name,
        mobile: customerData.mobile,
        phone: customerData.phone || null,
        email: customerData.email || null,
        website: customerData.website || null,
        address: customerData.address || null,
        city: customerData.city || null,
        state: customerData.state || null,
        country: customerData.country || "Pakistan",
        notes: customerData.notes || null,
        opening_balance: customerData.opening_balance || 0,
        current_balance: customerData.opening_balance || 0, // Start with opening balance
        as_of_date: customerData.as_of_date
          ? customerData.as_of_date // Already formatted as YYYY-MM-DD from the form
          : dayjs().format("YYYY-MM-DD"),
        status: "active",
      };

      console.log("Creating customer in Supabase:", customer);

      const { data, error } = await supabase
        .from("customers")
        .insert([customer])
        .select()
        .single();

      if (error) {
        console.error("Supabase insert error:", error);
        throw error;
      }

      console.log("Customer created successfully:", data);

      // Create opening balance ledger entry if opening balance is not zero
      if (customerData.opening_balance !== 0) {
        await this.ensureSingleOpeningBalanceEntry(
          data.id,
          customerData.opening_balance,
          customerData.as_of_date || new Date().toISOString().split("T")[0]
        );
      }

      console.log("=== CREATE CUSTOMER COMPLETE ===");
      return data;
    } catch (error) {
      console.error("Error creating customer:", error);
      throw error;
    }
  },

  // Update customer with proper opening balance handling
  async updateCustomer(
    id: string,
    customerData: CustomerFormData
  ): Promise<Customer> {
    try {
      console.log("=== UPDATE CUSTOMER START ===");
      console.log("Customer ID:", id);
      console.log("Form Data:", customerData);

      // 1. Get current customer data
      const { data: current, error: fetchError } = await supabase
        .from("customers")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchError) {
        console.error("Error fetching customer:", fetchError);
        throw fetchError;
      }

      if (!current) {
        throw new Error("Customer not found");
      }

      console.log("Current customer data:", current);

      const oldOpening = parseFloat(String(current.opening_balance)) || 0;
      const newOpening = parseFloat(String(customerData.opening_balance)) || 0;
      const currentBalance = parseFloat(String(current.current_balance)) || 0;

      console.log("Balance calculations:", {
        oldOpening,
        newOpening,
        currentBalance,
      });

      // 2. Calculate new current balance CORRECTLY
      // Formula: (Current Balance - Old Opening) + New Opening
      const newCurrentBalance = currentBalance - oldOpening + newOpening;

      console.log("New current balance calculated:", newCurrentBalance);

      // 3. Prepare update data - INCLUDE ALL FIELDS
      const updateData = {
        first_name: customerData.first_name,
        last_name: customerData.last_name,
        company_name: customerData.company_name,
        mobile: customerData.mobile,
        phone: customerData.phone || null,
        email: customerData.email || null,
        website: customerData.website || null,
        address: customerData.address || null,
        city: customerData.city || null,
        state: customerData.state || null,
        country: customerData.country || "Pakistan",
        notes: customerData.notes || null,
        opening_balance: newOpening,
        current_balance: newCurrentBalance, // ← THIS IS CRITICAL!
        as_of_date: customerData.as_of_date
          ? customerData.as_of_date // Already formatted as YYYY-MM-DD from the form
          : current.as_of_date,
      };

      console.log("Update data to send:", updateData);

      // 4. Update customer in database
      const { data: updatedCustomer, error: updateError } = await supabase
        .from("customers")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (updateError) {
        console.error("Error updating customer:", updateError);
        throw updateError;
      }

      console.log("Customer updated successfully:", updatedCustomer);

      // 5. Update opening balance ledger entry (SINGLE ENTRY)
      console.log("Updating opening balance ledger entry...");
      await this.ensureSingleOpeningBalanceEntry(
        id,
        newOpening,
        customerData.as_of_date || current.as_of_date
      );

      // 6. Get final customer data to ensure everything is correct
      const { data: finalCustomer } = await supabase
        .from("customers")
        .select("*")
        .eq("id", id)
        .single();

      console.log("Final customer data:", finalCustomer);
      console.log("=== UPDATE CUSTOMER COMPLETE ===");

      return finalCustomer || updatedCustomer;
    } catch (error) {
      console.error("Error updating customer:", error);
      throw error;
    }
  },

  // Get customer by ID
  async getCustomerById(id: string): Promise<Customer | null> {
    try {
      const { data: customer, error } = await supabase
        .from("customers")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        console.log("Supabase error loading customer:", error.message);
        return null;
      }

      return customer;
    } catch (error) {
      console.log("Error getting customer:", error);
      return null;
    }
  },

  // Delete customer with proper foreign key constraint handling
  async deleteCustomer(id: string): Promise<void> {
    try {
      console.log("=== DELETE CUSTOMER START ===");
      console.log("Attempting to delete customer ID:", id);

      // 1. First check if customer exists
      const { data: customer, error: fetchError } = await supabase
        .from("customers")
        .select("id, company_name")
        .eq("id", id)
        .single();

      if (fetchError) {
        console.error("Error fetching customer:", fetchError);
        throw new Error(`Customer not found: ${fetchError.message}`);
      }

      if (!customer) {
        throw new Error("Customer not found");
      }

      console.log(
        `Customer to delete: ${customer.company_name} (${customer.id})`
      );

      // 2. Check for related records (EXCLUDE opening balance entries)
      console.log(
        "Checking for related records (excluding opening balance)..."
      );

      const [invoicesResult, paymentsResult, nonOpeningLedgerResult] =
        await Promise.all([
          supabase
            .from("invoices")
            .select("id, invoice_number")
            .eq("customer_id", id)
            .limit(1),
          supabase
            .from("payments")
            .select("id, payment_number")
            .eq("customer_id", id)
            .limit(1),
          supabase
            .from("ledger_entries")
            .select("id")
            .eq("customer_id", id)
            .not("type", "eq", "opening_balance") // ← Exclude opening balance
            .not("description", "ilike", "%Opening Balance%") // ← Also exclude by description
            .limit(1),
        ]);

      const hasInvoices = invoicesResult.data && invoicesResult.data.length > 0;
      const hasPayments = paymentsResult.data && paymentsResult.data.length > 0;
      const hasNonOpeningLedgerEntries =
        nonOpeningLedgerResult.data && nonOpeningLedgerResult.data.length > 0;

      console.log("Related records check:", {
        hasInvoices,
        hasPayments,
        hasNonOpeningLedgerEntries,
        invoiceCount: invoicesResult.data?.length || 0,
        paymentCount: paymentsResult.data?.length || 0,
        nonOpeningLedgerCount: nonOpeningLedgerResult.data?.length || 0,
      });

      // 3. If customer has non-opening-balance related records, we cannot delete
      if (hasInvoices || hasPayments || hasNonOpeningLedgerEntries) {
        let errorMessage = `Cannot delete customer "${customer.company_name}" because they have:`;
        if (hasInvoices) {
          const invoices = invoicesResult.data || [];
          errorMessage += `\n• ${invoices.length} invoice(s) (e.g., ${
            invoices[0]?.invoice_number || "N/A"
          })`;
        }
        if (hasPayments) {
          const payments = paymentsResult.data || [];
          errorMessage += `\n• ${payments.length} payment(s) (e.g., ${
            payments[0]?.payment_number || "N/A"
          })`;
        }
        if (hasNonOpeningLedgerEntries) {
          errorMessage += `\n• Non-opening ledger entries`;
        }
        errorMessage +=
          "\n\nPlease delete or reassign these records before deleting the customer.";

        throw new Error(errorMessage);
      }

      // 4. Delete opening balance ledger entries (these are allowed to be deleted)
      console.log("Checking for opening balance ledger entries...");
      const { data: openingEntries, error: openingEntriesError } =
        await supabase
          .from("ledger_entries")
          .select("id")
          .eq("customer_id", id)
          .or("type.eq.opening_balance,description.ilike.%Opening Balance%");

      if (openingEntriesError) {
        console.warn("Error fetching opening entries:", openingEntriesError);
      }

      if (openingEntries && openingEntries.length > 0) {
        console.log(
          `Found ${openingEntries.length} opening balance entries, deleting them...`
        );

        const { error: ledgerDeleteError } = await supabase
          .from("ledger_entries")
          .delete()
          .eq("customer_id", id)
          .or("type.eq.opening_balance,description.ilike.%Opening Balance%");

        if (ledgerDeleteError) {
          console.warn(
            "Warning deleting opening balance entries:",
            ledgerDeleteError
          );
          // Continue with customer deletion even if ledger deletion fails
        }
      }

      // 5. Now delete the customer
      console.log("Deleting customer from database...");
      const { error } = await supabase.from("customers").delete().eq("id", id);

      if (error) {
        console.error("Supabase delete error:", error);

        if (error.code === "23503") {
          throw new Error(
            `Cannot delete customer because they have related records in the database. ` +
              `This is a database constraint error. Please contact your administrator if you need to force delete.`
          );
        } else if (error.code === "409") {
          throw new Error(
            `Conflict error: Cannot delete customer. ` +
              `There may be pending transactions or locked records.`
          );
        }

        throw new Error(`Failed to delete customer: ${error.message}`);
      }

      console.log(
        `✅ Customer ${customer.company_name} (${customer.id}) deleted successfully`
      );
      console.log("=== DELETE CUSTOMER COMPLETE ===");
    } catch (error) {
      console.error("❌ Error in deleteCustomer:", error);
      throw error;
    }
  },

  // Add this helper function to check if customer can be deleted
  async canDeleteCustomer(customerId: string): Promise<{
    canDelete: boolean;
    reasons: string[];
    details: {
      invoiceCount: number;
      paymentCount: number;
      ledgerCount: number;
    };
  }> {
    try {
      const [invoicesResult, paymentsResult, nonOpeningLedgerResult] =
        await Promise.all([
          supabase
            .from("invoices")
            .select("id", { count: "exact" })
            .eq("customer_id", customerId),
          supabase
            .from("payments")
            .select("id", { count: "exact" })
            .eq("customer_id", customerId),
          supabase
            .from("ledger_entries")
            .select("id", { count: "exact" })
            .eq("customer_id", customerId)
            .not("type", "eq", "opening_balance")
            .not("description", "ilike", "%Opening Balance%"),
        ]);

      const invoiceCount = invoicesResult.count || 0;
      const paymentCount = paymentsResult.count || 0;
      const ledgerCount = nonOpeningLedgerResult.count || 0; // Non-opening ledger entries only

      const reasons: string[] = [];

      if (invoiceCount > 0) {
        reasons.push(`${invoiceCount} invoice(s)`);
      }
      if (paymentCount > 0) {
        reasons.push(`${paymentCount} payment(s)`);
      }
      if (ledgerCount > 0) {
        reasons.push(
          `${ledgerCount} non-opening ledger entr${
            ledgerCount === 1 ? "y" : "ies"
          }`
        );
      }

      return {
        canDelete: reasons.length === 0,
        reasons,
        details: {
          invoiceCount,
          paymentCount,
          ledgerCount,
        },
      };
    } catch (error) {
      console.error("Error checking if customer can be deleted:", error);
      return {
        canDelete: false,
        reasons: ["Error checking customer records"],
        details: {
          invoiceCount: 0,
          paymentCount: 0,
          ledgerCount: 0,
        },
      };
    }
  },

  // NEW: Ensure single opening balance entry (creates or updates existing)
  async ensureSingleOpeningBalanceEntry(
    customerId: string,
    openingBalance: number,
    asOfDate: string
  ): Promise<void> {
    try {
      console.log("=== ENSURE OPENING BALANCE ENTRY START ===");
      console.log("Customer ID:", customerId);
      console.log("Opening Balance:", openingBalance);
      console.log("As of Date:", asOfDate);

      // Try to find existing opening balance entry
      let existingEntryId: string | null = null;
      let existingType: string | null = null;

      // First try: Look for 'opening_balance' type
      try {
        const { data: entry1 } = await supabase
          .from("ledger_entries")
          .select("id, type, description")
          .eq("customer_id", customerId)
          .eq("type", "opening_balance")
          .maybeSingle();

        if (entry1) {
          existingEntryId = entry1.id;
          existingType = entry1.type;
          console.log("Found 'opening_balance' type entry:", entry1);
        }
      } catch (error) {
        console.log(
          "No 'opening_balance' type entry found or constraint issue"
        );
      }

      // Second try: Look for 'adjustment' with Opening Balance description
      if (!existingEntryId) {
        const { data: entry2 } = await supabase
          .from("ledger_entries")
          .select("id, type, description")
          .eq("customer_id", customerId)
          .eq("description", "Opening Balance")
          .maybeSingle();

        if (entry2) {
          existingEntryId = entry2.id;
          existingType = entry2.type;
          console.log(
            "Found adjustment with Opening Balance description:",
            entry2
          );
        }
      }

      // Prepare entry data
      const entryData: any = {
        customer_id: customerId,
        date: asOfDate,
        reference_id: customerId,
        reference_number: "OPENING",
        debit: openingBalance > 0 ? Math.abs(openingBalance) : 0,
        credit: openingBalance < 0 ? Math.abs(openingBalance) : 0,
        balance: openingBalance,
        description: "Opening Balance",
        updated_at: new Date().toISOString(),
      };

      // Determine which type to use
      let useType = existingType || "opening_balance";
      let success = false;
      let lastError: any = null;

      // Try different types in order
      const typeAttempts = ["opening_balance", "adjustment"];

      for (const attemptType of typeAttempts) {
        if (success) break;

        try {
          console.log(`Trying type: ${attemptType}`);
          entryData.type = attemptType;

          if (existingEntryId) {
            // UPDATE existing entry
            console.log(
              `Updating existing entry (ID: ${existingEntryId}) with type: ${attemptType}`
            );
            const { error: updateError } = await supabase
              .from("ledger_entries")
              .update(entryData)
              .eq("id", existingEntryId);

            if (updateError) {
              console.log(
                `Update failed with type ${attemptType}:`,
                updateError.message
              );
              lastError = updateError;
              continue; // Try next type
            }
          } else {
            // CREATE new entry
            console.log(`Creating new entry with type: ${attemptType}`);
            const { error: insertError } = await supabase
              .from("ledger_entries")
              .insert([entryData]);

            if (insertError) {
              console.log(
                `Insert failed with type ${attemptType}:`,
                insertError.message
              );
              lastError = insertError;
              continue; // Try next type
            }
          }

          success = true;
          useType = attemptType;
          console.log(`✅ Success with type: ${attemptType}`);
        } catch (error) {
          console.log(`Exception with type ${attemptType}:`, error);
          lastError = error;
        }
      }

      if (!success) {
        console.error(
          "❌ Failed to create/update opening balance entry with all types"
        );
        console.error("Last error:", lastError);
        throw new Error(
          `Failed to create opening balance entry: ${
            lastError?.message || "Unknown error"
          }`
        );
      }

      console.log(
        `✅ Opening balance entry ${
          existingEntryId ? "updated" : "created"
        } successfully with type: ${useType}`
      );

      // Recalculate customer balance
      console.log("Recalculating customer balance...");
      await ledgerService.recalculateCustomerBalance(customerId);

      console.log("=== ENSURE OPENING BALANCE ENTRY COMPLETE ===");
    } catch (error) {
      console.error("❌ Error in ensureSingleOpeningBalanceEntry:", error);
      throw error;
    }
  },

  // Debug function to check customer and ledger data
  async debugCustomerLedger(customerId: string): Promise<void> {
    try {
      console.log("=== DEBUG CUSTOMER LEDGER ===");

      // Get customer
      const { data: customer, error: customerError } = await supabase
        .from("customers")
        .select("*")
        .eq("id", customerId)
        .single();

      if (customerError) {
        console.error("Error fetching customer:", customerError);
        return;
      }

      console.log("Customer:", {
        id: customer?.id,
        name: customer?.company_name,
        opening_balance: customer?.opening_balance,
        current_balance: customer?.current_balance,
        as_of_date: customer?.as_of_date,
      });

      // Get ledger entries
      const { data: entries, error: ledgerError } = await supabase
        .from("ledger_entries")
        .select("*")
        .eq("customer_id", customerId)
        .order("date", { ascending: true })
        .order("created_at", { ascending: true });

      if (ledgerError) {
        console.error("Error fetching ledger entries:", ledgerError);
        return;
      }

      console.log("Total ledger entries:", entries?.length || 0);

      if (entries && entries.length > 0) {
        let runningBalance = 0;
        console.log("Ledger entries details:");

        entries.forEach((entry, index) => {
          runningBalance =
            runningBalance + (entry.debit || 0) - (entry.credit || 0);
          console.log(`[${index}] ${entry.type} - ${entry.description}`);
          console.log(
            `    Date: ${entry.date}, Debit: ${entry.debit}, Credit: ${entry.credit}, Balance: ${entry.balance}, Running: ${runningBalance}`
          );
        });

        console.log("Final running balance:", runningBalance);
        console.log("Database current_balance:", customer?.current_balance);
      } else {
        console.log("No ledger entries found");
      }

      console.log("=== END DEBUG ===");
    } catch (error) {
      console.error("Error in debugCustomerLedger:", error);
    }
  },

  // Test function for debugging
  async testCustomerBalance(customerId: string): Promise<void> {
    try {
      console.log("=== TEST CUSTOMER BALANCE ===");

      // Get customer
      const { data: customer } = await supabase
        .from("customers")
        .select("*")
        .eq("id", customerId)
        .single();

      console.log("Customer:", {
        id: customer?.id,
        name: customer?.company_name,
        opening: customer?.opening_balance,
        current: customer?.current_balance,
      });

      // Get ledger entries
      const { data: entries } = await supabase
        .from("ledger_entries")
        .select("*")
        .eq("customer_id", customerId)
        .order("date", { ascending: true });

      console.log("Ledger entries count:", entries?.length || 0);

      if (entries && entries.length > 0) {
        let calcBalance = 0;
        entries.forEach((entry, index) => {
          calcBalance = calcBalance + (entry.debit || 0) - (entry.credit || 0);
          console.log(
            `[${index}] ${entry.type} - Debit: ${entry.debit}, Credit: ${entry.credit}, Running: ${calcBalance}`
          );
        });
        console.log("Calculated final balance:", calcBalance);
        console.log("Database current_balance:", customer?.current_balance);
        console.log(
          "Difference:",
          calcBalance - parseFloat(customer?.current_balance || 0)
        );
      }

      console.log("=== END TEST ===");
    } catch (error) {
      console.error("Test error:", error);
    }
  },

  // Fix customer balance (manual repair if needed)
  async repairCustomerBalance(customerId: string): Promise<void> {
    try {
      console.log("=== REPAIR CUSTOMER BALANCE ===");

      // Recalculate from ledger
      const newBalance = await ledgerService.recalculateCustomerBalance(
        customerId
      );

      console.log("Repaired balance:", newBalance);

      // Verify
      const { data: customer } = await supabase
        .from("customers")
        .select("current_balance")
        .eq("id", customerId)
        .single();

      console.log(
        "Database current_balance after repair:",
        customer?.current_balance
      );
      console.log("=== REPAIR COMPLETE ===");
    } catch (error) {
      console.error("Error in repairCustomerBalance:", error);
    }
  },
};
