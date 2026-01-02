import { supabase } from "./supabaseClient";
import type { Customer, CustomerFormData } from "../types";
import { ledgerService } from "./ledgerService";
import { paymentApplicationService } from "./paymentApplicationService"; // NEW

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

  // Get all customers with summary
  async getAllCustomers(): Promise<{ customers: Customer[]; summary: any }> {
    try {
      const { data: customers, error } = await supabase
        .from("customers")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const customersWithActualBalance = await Promise.all(
        (customers || []).map(async (customer) => {
          try {
            console.log(`Calculating balance for ${customer.company_name}`);

            // Get ALL ledger entries for this customer
            const { data: allEntries } = await supabase
              .from("ledger_entries")
              .select("*")
              .eq("customer_id", customer.id)
              .order("date", { ascending: true })
              .order("created_at", { ascending: true });

            let actualBalance = 0;

            if (allEntries && allEntries.length > 0) {
              // Calculate from ALL entries
              allEntries.forEach((entry) => {
                if (entry.type === "opening_balance") {
                  // Opening balance: add debit amount
                  actualBalance += entry.debit || 0;
                } else if (!entry.is_hidden) {
                  // Regular non-hidden entries
                  actualBalance =
                    actualBalance + (entry.debit || 0) - (entry.credit || 0);
                }
                // Skip hidden entries (opening balance payments)
              });
            } else {
              // No entries yet, balance = opening_balance
              actualBalance = customer.opening_balance || 0;
            }

            console.log(
              `Balance for ${customer.company_name}: ${actualBalance} (was ${customer.current_balance})`
            );

            // Sync if needed
            if (Math.abs(customer.current_balance - actualBalance) > 0.01) {
              console.log(
                `Syncing ${customer.company_name}: ${customer.current_balance} → ${actualBalance}`
              );

              const { error: syncError } = await supabase
                .from("customers")
                .update({
                  current_balance: actualBalance,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", customer.id);

              if (!syncError) {
                console.log(`✅ Synced ${customer.company_name}`);
              }
            }

            return {
              ...customer,
              current_balance: actualBalance,
            };
          } catch (error) {
            console.error(
              `Error calculating balance for customer ${customer.id}:`,
              error
            );
            return customer; // Return as-is on error
          }
        })
      );

      // Calculate summary based on ACTUAL balances
      const totalOutstanding = customersWithActualBalance.reduce(
        (sum, customer) => {
          return sum + Math.max(0, customer.current_balance);
        },
        0
      );

      const totalPaid = customersWithActualBalance.reduce((sum, customer) => {
        return sum + Math.abs(Math.min(0, customer.current_balance));
      }, 0);

      const totalOpenInvoices = 0;

      return {
        customers: customersWithActualBalance,
        summary: {
          totalClients: customersWithActualBalance.length,
          totalOutstanding,
          totalOpenInvoices,
          totalPaid,
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
        current_balance: customerData.opening_balance || 0,
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

  // Get customer by ID - FIXED VERSION
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

      // Get ALL ledger entries for balance calculation
      const { data: allEntries } = await supabase
        .from("ledger_entries")
        .select("*")
        .eq("customer_id", id)
        .order("date", { ascending: true })
        .order("created_at", { ascending: true });

      let actualBalance = 0;

      if (allEntries && allEntries.length > 0) {
        console.log(`Found ${allEntries.length} ledger entries`);

        // Calculate balance from ALL entries (except hidden ones that are credits)
        allEntries.forEach((entry, index) => {
          if (entry.type === "opening_balance") {
            // Opening balance entry: add the debit amount
            actualBalance += entry.debit || 0;
            console.log(
              `[${index}] Opening balance: +${entry.debit} = ${actualBalance}`
            );
          } else if (!entry.is_hidden) {
            // Regular non-hidden entries
            actualBalance =
              actualBalance + (entry.debit || 0) - (entry.credit || 0);
            console.log(
              `[${index}] ${entry.type}: ${entry.debit || 0} - ${
                entry.credit || 0
              } = ${actualBalance}`
            );
          } else {
            // Hidden entries (opening balance payments) - these are CREDITS
            // They reduce the balance, but since they're hidden, we need to handle them
            console.log(
              `[${index}] Hidden ${entry.type}: Credit ${entry.credit} (not affecting running balance)`
            );
          }
        });
      } else {
        console.log("No ledger entries found");
        // If no entries, balance should be opening_balance
        actualBalance = customer.opening_balance || 0;
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

  // NEW: Get customer opening balance summary (UPDATED)
  async getCustomerOpeningBalance(customerId: string): Promise<{
    amount: number;
    date: string;
    isPositive: boolean;
    paidAmount: number;
    remainingAmount: number;
    payments?: any[];
  }> {
    try {
      console.log("=== GET OPENING BALANCE ===");

      // Get customer
      const { data: customer, error } = await supabase
        .from("customers")
        .select("opening_balance, as_of_date")
        .eq("id", customerId)
        .single();

      if (error || !customer) {
        console.log("Customer not found");
        return {
          amount: 0,
          date: "",
          isPositive: true,
          paidAmount: 0,
          remainingAmount: 0,
        };
      }

      console.log("Customer found:", {
        opening_balance: customer.opening_balance,
        as_of_date: customer.as_of_date,
      });

      let paidAmount = 0;
      let paymentDetails = [];

      // TRY NEW SYSTEM FIRST
      try {
        const { data: newPayments, error: newError } = await supabase
          .from("customer_payment_applications")
          .select("*")
          .eq("customer_id", customerId)
          .is("invoice_id", null); // NULL = opening balance payments

        if (!newError && newPayments) {
          paidAmount = newPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
          paymentDetails = newPayments;
          console.log(`Found ${newPayments.length} payments in NEW system:`, {
            paidAmount,
            payments: newPayments,
          });
        }
      } catch (tableError) {
        console.log("New table might not exist yet");
      }

      // If no payments in new system, check old system
      if (paidAmount === 0) {
        console.log("Checking OLD system...");
        const { data: hiddenEntries } = await supabase
          .from("ledger_entries")
          .select("*")
          .eq("customer_id", customerId)
          .eq("is_hidden", true);

        if (hiddenEntries && hiddenEntries.length > 0) {
          paidAmount = hiddenEntries.reduce(
            (sum, e) => sum + (e.credit || 0),
            0
          );
          console.log(
            `Found ${hiddenEntries.length} hidden entries:`,
            paidAmount
          );
        }
      }

      const remainingAmount = Math.max(
        0,
        customer.opening_balance - paidAmount
      );

      console.log("FINAL CALCULATION:", {
        opening: customer.opening_balance,
        paid: paidAmount,
        remaining: remainingAmount,
      });

      return {
        amount: customer.opening_balance || 0,
        date: customer.as_of_date || "",
        isPositive: true,
        paidAmount,
        remainingAmount,
        payments: paymentDetails,
      };
    } catch (error) {
      console.error("Error in getCustomerOpeningBalance:", error);
      return {
        amount: 0,
        date: "",
        isPositive: true,
        paidAmount: 0,
        remainingAmount: 0,
      };
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

      // Try to find existing opening balance entry
      let existingEntryId: string | null = null;

      // Look for existing opening balance ledger entry
      try {
        const { data: entry } = await supabase
          .from("ledger_entries")
          .select("id, type, description")
          .eq("customer_id", customerId)
          .eq("type", "opening_balance")
          .maybeSingle();

        if (entry) {
          existingEntryId = entry.id;
          console.log("Found existing opening balance ledger entry:", entry);
        }
      } catch (error) {
        console.log("No existing opening balance ledger entry found");
      }

      // Prepare entry data
      const entryData: any = {
        customer_id: customerId,
        date: asOfDate,
        reference_id: customerId,
        reference_number: "OPENING",
        debit: openingBalance > 0 ? Math.abs(openingBalance) : 0,
        credit: openingBalance < 0 ? Math.abs(openingBalance) : 0,
        description: "Opening Balance",
        updated_at: new Date().toISOString(),
        type: "opening_balance",
      };

      if (existingEntryId) {
        // UPDATE existing entry
        console.log(`Updating existing ledger entry (ID: ${existingEntryId})`);
        const { error: updateError } = await supabase
          .from("ledger_entries")
          .update(entryData)
          .eq("id", existingEntryId);

        if (updateError) {
          console.error("Update failed:", updateError.message);
          throw updateError;
        }
      } else {
        // CREATE new entry
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
      await ledgerService.recalculateCustomerBalance(customerId);

      console.log("=== OPENING BALANCE LEDGER ENTRY COMPLETE ===");
    } catch (error) {
      console.error("❌ Error in ensureSingleOpeningBalanceEntry:", error);
      throw error;
    }
  },

  // NEW: Update customer opening balance based on payments
  async updateCustomerOpeningBalance(customerId: string): Promise<{
    originalAmount: number;
    paidAmount: number;
    remainingAmount: number;
  }> {
    try {
      console.log("=== UPDATE CUSTOMER OPENING BALANCE ===");

      // Get current opening balance
      const { data: customer } = await supabase
        .from("customers")
        .select("opening_balance")
        .eq("id", customerId)
        .single();

      if (!customer) {
        throw new Error("Customer not found");
      }

      const originalAmount = customer.opening_balance || 0;

      // Try to get opening balance payments from new system
      let paidAmount = 0;

      try {
        const { data: openingBalancePayments, error } = await supabase
          .from("customer_payment_applications")
          .select("amount")
          .eq("customer_id", customerId)
          .is("invoice_id", null); // NULL invoice_id means opening balance payment

        if (!error && openingBalancePayments) {
          paidAmount = openingBalancePayments.reduce(
            (sum, payment) => sum + (payment.amount || 0),
            0
          );
        }
      } catch (tableError) {
        console.log("customer_payment_applications table might not exist yet");
        // Fallback to hidden entries
        const { data: hiddenEntries } = await supabase
          .from("ledger_entries")
          .select("credit")
          .eq("customer_id", customerId)
          .eq("is_hidden", true)
          .or(
            "description.ilike.%opening balance%,type.eq.opening_balance_payment"
          );

        if (hiddenEntries) {
          paidAmount = hiddenEntries.reduce(
            (sum, entry) => sum + (entry.credit || 0),
            0
          );
        }
      }

      const remainingAmount = Math.max(0, originalAmount - paidAmount);

      console.log("Opening balance calculation:", {
        originalAmount,
        paidAmount,
        remainingAmount,
      });

      // Update customer's opening_balance field if needed
      if (Math.abs(customer.opening_balance - remainingAmount) > 0.01) {
        await supabase
          .from("customers")
          .update({
            opening_balance: remainingAmount,
            updated_at: new Date().toISOString(),
          })
          .eq("id", customerId);

        console.log(
          `✅ Updated customer opening_balance to ${remainingAmount}`
        );
      }

      console.log("=== UPDATE COMPLETE ===");

      return {
        originalAmount,
        paidAmount,
        remainingAmount,
      };
    } catch (error) {
      console.error("Error in updateCustomerOpeningBalance:", error);
      throw error;
    }
  },

  // Debug function
  async debugBalanceMismatch(customerId: string): Promise<any> {
    try {
      console.log("=== DEBUG BALANCE MISMATCH ===");

      // Get customer
      const { data: customer, error: customerError } = await supabase
        .from("customers")
        .select("*")
        .eq("id", customerId)
        .single();

      if (customerError) {
        console.error("Error fetching customer:", customerError);
        return null;
      }

      console.log("Customer from database:", {
        company_name: customer.company_name,
        opening_balance: customer.opening_balance,
        current_balance: customer.current_balance,
        as_of_date: customer.as_of_date,
      });

      // Calculate balance from non-hidden ledger entries
      const { data: ledgerEntries, error: ledgerError } = await supabase
        .from("ledger_entries")
        .select("*")
        .eq("customer_id", customerId)
        .eq("is_hidden", false)
        .order("date", { ascending: true })
        .order("created_at", { ascending: true });

      if (ledgerError) {
        console.error("Error fetching ledger entries:", ledgerError);
        return null;
      }

      console.log(
        "Total non-hidden ledger entries:",
        ledgerEntries?.length || 0
      );

      let calculatedBalance = 0;
      if (ledgerEntries && ledgerEntries.length > 0) {
        console.log("Ledger entries in chronological order:");
        ledgerEntries.forEach((entry, index) => {
          calculatedBalance =
            calculatedBalance + (entry.debit || 0) - (entry.credit || 0);
          console.log(
            `[${index}] ${entry.date} ${entry.type} - ${entry.description}`
          );
          console.log(
            `    Debit: ${entry.debit}, Credit: ${entry.credit}, Running Balance: ${calculatedBalance}`
          );
        });
      }

      console.log("=== SUMMARY ===");
      console.log("Database current_balance:", customer.current_balance);
      console.log("Calculated from ledger:", calculatedBalance);
      console.log(
        "Difference:",
        calculatedBalance - parseFloat(customer.current_balance || 0)
      );

      return {
        customer,
        calculatedBalance,
        ledgerEntries: ledgerEntries || [],
      };
    } catch (error) {
      console.error("Error in debugBalanceMismatch:", error);
      return null;
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

  // Repair customer and all related invoices
  async repairCustomerAndInvoices(customerId: string): Promise<void> {
    try {
      console.log("=== REPAIR CUSTOMER AND INVOICES ===");

      const { data: invoices } = await supabase
        .from("invoices")
        .select("*")
        .eq("customer_id", customerId);

      if (invoices && invoices.length > 0) {
        for (const invoice of invoices) {
          console.log(`Repairing invoice ${invoice.invoice_number}`);

          const { data: allocations } = await supabase
            .from("payment_allocations")
            .select("amount")
            .eq("invoice_id", invoice.id);

          let totalPaid = 0;
          if (allocations) {
            totalPaid = allocations.reduce(
              (sum, alloc) => sum + (alloc.amount || 0),
              0
            );
          }

          const { data: directPayments } = await supabase
            .from("payments")
            .select("total_received")
            .eq("invoice_id", invoice.id);

          if (directPayments) {
            directPayments.forEach((payment) => {
              totalPaid += payment.total_received || 0;
            });
          }

          const { data: discountEntries } = await supabase
            .from("ledger_entries")
            .select("credit")
            .eq("customer_id", customerId)
            .eq("type", "discount")
            .ilike("description", `%${invoice.invoice_number}%`);

          if (discountEntries) {
            discountEntries.forEach((discount) => {
              totalPaid += discount.credit || 0;
            });
          }

          const newPendingAmount = Math.max(
            0,
            invoice.total_amount - totalPaid
          );

          let newStatus = invoice.status;
          if (newPendingAmount === 0) {
            newStatus = "paid";
          } else if (totalPaid > 0 && newPendingAmount > 0) {
            newStatus = "partial";
          } else if (newPendingAmount === invoice.total_amount) {
            newStatus = "sent";
          }

          console.log(`Invoice ${invoice.invoice_number}:`, {
            total: invoice.total_amount,
            calculatedPaid: totalPaid,
            newPending: newPendingAmount,
            newStatus,
          });

          await supabase
            .from("invoices")
            .update({
              paid_amount: totalPaid,
              pending_amount: newPendingAmount,
              status: newStatus,
              updated_at: new Date().toISOString(),
            })
            .eq("id", invoice.id);
        }
      }

      await this.fixCustomerBalance(customerId);

      console.log("=== REPAIR COMPLETE ===");
    } catch (error) {
      console.error("Error in repairCustomerAndInvoices:", error);
      throw error;
    }
  },
};
