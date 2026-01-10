import { supabase } from "./supabaseClient";
import type { Customer, CustomerFormData } from "../types";
import { ledgerService } from "./ledgerService";

export const customerService = {
  // Check if customers table has proper structure
  async checkTableStructure(): Promise<{ isValid: boolean; issues: string[] }> {
    try {
      const issues: string[] = [];

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
    await this.checkTableStructure();
  },

  // Get all customers with outstanding balance
  async getAllCustomers(): Promise<{ customers: Customer[]; summary: any }> {
    try {
      const { data: customers, error } = await supabase
        .from("customers")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Calculate outstanding balance for each customer
      const customersWithBalance = await Promise.all(
        (customers || []).map(async (customer) => {
          try {
            // Calculate balance from ledger entries
            const { data: allEntries } = await supabase
              .from("ledger_entries")
              .select("*")
              .eq("customer_id", customer.id)
              .order("date", { ascending: true })
              .order("created_at", { ascending: true });

            let currentBalance = 0;

            if (allEntries && allEntries.length > 0) {
              // Calculate from ALL non-hidden entries
              allEntries.forEach((entry) => {
                if (!entry.is_hidden) {
                  currentBalance =
                    currentBalance + (entry.debit || 0) - (entry.credit || 0);
                }
              });
            } else {
              // If no entries, balance = opening_balance
              currentBalance = customer.opening_balance || 0;
            }

            // Sync if needed
            if (Math.abs(customer.current_balance - currentBalance) > 0.01) {
              console.log(
                `Syncing ${customer.company_name}: ${customer.current_balance} → ${currentBalance}`
              );

              await supabase
                .from("customers")
                .update({
                  current_balance: currentBalance,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", customer.id);
            }

            return {
              ...customer,
              current_balance: currentBalance,
            };
          } catch (error) {
            console.error(
              `Error calculating balance for customer ${customer.id}:`,
              error
            );
            return customer;
          }
        })
      );

      // Calculate summary based on ACTUAL balances
      const totalOutstanding = customersWithBalance.reduce((sum, customer) => {
        return sum + Math.max(0, customer.current_balance);
      }, 0);

      const totalCredit = customersWithBalance.reduce((sum, customer) => {
        return sum + Math.abs(Math.min(0, customer.current_balance));
      }, 0);

      return {
        customers: customersWithBalance,
        summary: {
          totalClients: customersWithBalance.length,
          totalOutstanding,
          totalCredit,
        },
      };
    } catch (error) {
      console.error("Error in getAllCustomers:", error);
      throw error;
    }
  },

  // Create new customer
  async createCustomer(customerData: CustomerFormData): Promise<Customer> {
    try {
      console.log("=== CREATE CUSTOMER START ===");
      console.log("Customer data:", customerData);

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
        current_balance: customerData.opening_balance || 0, // Set current_balance = opening_balance
        as_of_date: customerData.as_of_date
          ? customerData.as_of_date
          : new Date().toISOString().split("T")[0],
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

      // CRITICAL: Create opening balance ledger entry
      if (customerData.opening_balance !== 0) {
        console.log("Creating opening balance ledger entry...");

        await ledgerService.addLedgerEntry({
          customer_id: data.id,
          date:
            customerData.as_of_date || new Date().toISOString().split("T")[0],
          type: "opening_balance",
          reference_id: data.id,
          reference_number: "OPENING",
          debit:
            customerData.opening_balance > 0
              ? Math.abs(customerData.opening_balance)
              : 0,
          credit:
            customerData.opening_balance < 0
              ? Math.abs(customerData.opening_balance)
              : 0,
          description: "Opening Balance",
          is_hidden: false, // IMPORTANT: NOT hidden
        });

        console.log("✅ Opening balance ledger entry created");
      }

      console.log("=== CREATE CUSTOMER COMPLETE ===");
      return data;
    } catch (error) {
      console.error("Error creating customer:", error);
      throw error;
    }
  },

  // Update customer
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
      const newCurrentBalance = currentBalance - oldOpening + newOpening;

      console.log("New current balance calculated:", newCurrentBalance);

      // 3. Prepare update data
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
        current_balance: newCurrentBalance,
        as_of_date: customerData.as_of_date
          ? customerData.as_of_date
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

      // 5. Update opening balance ledger entry
      console.log("Updating opening balance ledger entry...");
      await this.ensureSingleOpeningBalanceEntry(
        id,
        newOpening,
        customerData.as_of_date || current.as_of_date
      );

      // 6. Get final customer data
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
      console.log("=== getCustomerById ===");

      // Get customer data
      const { data: customer, error } = await supabase
        .from("customers")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        console.error("Error fetching customer:", error);
        return null;
      }

      console.log("Customer from DB:", {
        name: customer.company_name,
        opening_balance: customer.opening_balance,
        current_balance: customer.current_balance,
      });

      // Get ALL ledger entries (including opening balance)
      const { data: allEntries } = await supabase
        .from("ledger_entries")
        .select("*")
        .eq("customer_id", id)
        .order("date", { ascending: true })
        .order("created_at", { ascending: true });

      let actualBalance = 0;

      if (allEntries && allEntries.length > 0) {
        console.log(`Found ${allEntries.length} ledger entries`);

        // Calculate balance from ALL ledger entries
        allEntries.forEach((entry, index) => {
          // Skip hidden entries for balance calculation
          if (!entry.is_hidden) {
            actualBalance =
              actualBalance + (entry.debit || 0) - (entry.credit || 0);
            console.log(
              `[${index}] ${entry.type}: ${entry.debit || 0} - ${
                entry.credit || 0
              } = ${actualBalance}`
            );
          }
        });
      } else {
        // If no ledger entries, balance should be opening_balance
        actualBalance = customer.opening_balance || 0;
        console.log("No ledger entries, using opening_balance:", actualBalance);
      }

      console.log("Calculated balance:", actualBalance);
      console.log("Database current_balance:", customer.current_balance);

      // Sync if needed
      if (Math.abs(customer.current_balance - actualBalance) > 0.01) {
        console.log(
          `Syncing balance: ${customer.current_balance} → ${actualBalance}`
        );

        const { error: updateError } = await supabase
          .from("customers")
          .update({
            current_balance: actualBalance,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);

        if (updateError) {
          console.error("Sync error:", updateError);
        } else {
          console.log("✅ Balance synced");
        }
      }

      return {
        ...customer,
        current_balance: actualBalance,
      };
    } catch (error) {
      console.error("Error in getCustomerById:", error);
      return null;
    }
  },

  // Get customer outstanding balance
  async getCustomerOutstandingBalance(customerId: string): Promise<number> {
    try {
      console.log("=== getCustomerOutstandingBalance ===");

      // Get customer
      const { data: customer } = await supabase
        .from("customers")
        .select("opening_balance")
        .eq("id", customerId)
        .single();

      if (!customer) return 0;

      // Get ALL ledger entries
      const { data: allEntries } = await supabase
        .from("ledger_entries")
        .select("*")
        .eq("customer_id", customerId)
        .order("date", { ascending: true })
        .order("created_at", { ascending: true });

      let balance = 0;

      if (allEntries && allEntries.length > 0) {
        console.log(`Found ${allEntries.length} ledger entries`);

        // Calculate balance from ALL non-hidden ledger entries
        allEntries.forEach((entry) => {
          if (!entry.is_hidden) {
            balance = balance + (entry.debit || 0) - (entry.credit || 0);
          }
        });
      } else {
        // If no ledger entries, balance is opening_balance
        balance = customer.opening_balance || 0;
        console.log("No ledger entries, using opening_balance:", balance);
      }

      console.log("Final outstanding balance:", balance);
      return balance;
    } catch (error) {
      console.error("Error calculating outstanding balance:", error);

      // Fallback: get customer current_balance
      try {
        const { data: customer } = await supabase
          .from("customers")
          .select("current_balance")
          .eq("id", customerId)
          .single();

        return customer?.current_balance || 0;
      } catch (fallbackError) {
        return 0;
      }
    }
  },

  // In customerService.ts - ADD this method if not exists
  async recalculateCustomerBalance(customerId: string): Promise<number> {
    try {
      console.log("=== RECALCULATE CUSTOMER BALANCE ===");

      // Get ALL ledger entries for this customer
      const { data: allEntries } = await supabase
        .from("ledger_entries")
        .select("*")
        .eq("customer_id", customerId)
        .order("date", { ascending: true })
        .order("created_at", { ascending: true });

      let calculatedBalance = 0;

      if (allEntries && allEntries.length > 0) {
        // Calculate balance from ALL non-hidden entries
        allEntries.forEach((entry) => {
          if (!entry.is_hidden) {
            calculatedBalance =
              calculatedBalance + (entry.debit || 0) - (entry.credit || 0);
          }
        });
      } else {
        // If no entries, get opening balance from customer table
        const { data: customer } = await supabase
          .from("customers")
          .select("opening_balance")
          .eq("id", customerId)
          .single();

        calculatedBalance = customer?.opening_balance || 0;
      }

      console.log("Calculated balance:", calculatedBalance);

      // Update customer record
      const { error: updateError } = await supabase
        .from("customers")
        .update({
          current_balance: calculatedBalance,
          updated_at: new Date().toISOString(),
        })
        .eq("id", customerId);

      if (updateError) {
        console.error("Error updating customer balance:", updateError);
      } else {
        console.log("✅ Customer balance updated to:", calculatedBalance);
      }

      console.log("=== RECALCULATION COMPLETE ===");
      return calculatedBalance;
    } catch (error) {
      console.error("Error in recalculateCustomerBalance:", error);
      return 0;
    }
  },

  // Delete customer
  async deleteCustomer(id: string): Promise<void> {
    try {
      console.log("=== DELETE CUSTOMER START ===");
      console.log("Attempting to delete customer ID:", id);

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

      // Check for related records
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
            .not("type", "eq", "opening_balance")
            .not("description", "ilike", "%Opening Balance%")
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
      });

      // If customer has non-opening-balance related records, we cannot delete
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

      // Delete opening balance ledger entries
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
        }
      }

      // Now delete the customer
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

  // Check if customer can be deleted
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
      const ledgerCount = nonOpeningLedgerResult.count || 0;

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

  // Ensure single opening balance ledger entry
  async ensureSingleOpeningBalanceEntry(
    customerId: string,
    openingBalance: number,
    asOfDate: string
  ): Promise<void> {
    try {
      console.log("=== ENSURE OPENING BALANCE LEDGER ENTRY ===");
      console.log("Customer ID:", customerId);
      console.log("Opening Balance:", openingBalance);
      console.log("As of Date:", asOfDate);

      if (openingBalance === 0) {
        console.log("Opening balance is 0, no ledger entry needed");
        return;
      }

      // Check if opening balance entry already exists
      const { data: existingEntry } = await supabase
        .from("ledger_entries")
        .select("id")
        .eq("customer_id", customerId)
        .eq("type", "opening_balance")
        .single();

      const entryData = {
        customer_id: customerId,
        date: asOfDate,
        type: "opening_balance",
        reference_id: customerId,
        reference_number: "OPENING",
        debit: openingBalance > 0 ? Math.abs(openingBalance) : 0,
        credit: openingBalance < 0 ? Math.abs(openingBalance) : 0,
        balance: openingBalance, // IMPORTANT: Set the initial balance
        description: "Opening Balance",
        is_hidden: false, // Make sure it's NOT hidden
      };

      if (existingEntry) {
        // Update existing entry
        console.log(`Updating existing ledger entry (ID: ${existingEntry.id})`);
        const { error: updateError } = await supabase
          .from("ledger_entries")
          .update(entryData)
          .eq("id", existingEntry.id);

        if (updateError) {
          console.error("Update failed:", updateError.message);
          throw updateError;
        }
      } else {
        // Create new entry
        console.log(`Creating new opening balance ledger entry`);
        const { error: insertError } = await supabase
          .from("ledger_entries")
          .insert([entryData]);

        if (insertError) {
          console.error("Insert failed:", insertError.message);
          throw insertError;
        }
      }

      console.log(
        "✅ Opening balance ledger entry created/updated successfully"
      );

      // Recalculate customer balance
      console.log("Recalculating customer balance...");
      await this.recalculateCustomerBalance(customerId);

      console.log("=== OPENING BALANCE LEDGER ENTRY COMPLETE ===");
    } catch (error) {
      console.error("❌ Error in ensureSingleOpeningBalanceEntry:", error);
      throw error;
    }
  },

  // Fix customer balance
  async fixCustomerBalance(customerId: string): Promise<boolean> {
    try {
      console.log("=== FIX CUSTOMER BALANCE ===");

      const newBalance = await ledgerService.recalculateCustomerBalance(
        customerId
      );
      console.log("Recalculated balance from ledger:", newBalance);

      const { data: customer } = await supabase
        .from("customers")
        .select("current_balance")
        .eq("id", customerId)
        .single();

      console.log(
        "Database current_balance after fix:",
        customer?.current_balance
      );

      if (
        Math.abs(newBalance - parseFloat(customer?.current_balance || 0)) > 0.01
      ) {
        console.error("Balance still doesn't match!");

        await supabase
          .from("customers")
          .update({
            current_balance: newBalance,
            updated_at: new Date().toISOString(),
          })
          .eq("id", customerId);

        console.log("Forced balance update to:", newBalance);
      }

      console.log("=== BALANCE FIXED ===");
      return true;
    } catch (error) {
      console.error("Error fixing customer balance:", error);
      return false;
    }
  },
};
