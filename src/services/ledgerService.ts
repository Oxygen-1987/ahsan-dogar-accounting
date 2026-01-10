import { supabase } from "./supabaseClient";
import type { LedgerEntry } from "../types";
import dayjs from "dayjs";

export const ledgerService = {
  // Get customer ledger with proper balance calculation (exclude hidden entries)
  async getCustomerLedger(customerId: string): Promise<LedgerEntry[]> {
    try {
      console.log("Getting ledger for customer:", customerId);

      const { data: entries, error } = await supabase
        .from("ledger_entries")
        .select("*")
        .eq("customer_id", customerId)
        .eq("is_hidden", false) // EXCLUDE hidden entries
        .order("date", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error getting customer ledger:", error);
        return [];
      }

      // Calculate running balance properly (customer-facing view)
      let runningBalance = 0;
      const entriesWithBalances = (entries || []).map((entry) => {
        runningBalance =
          runningBalance + (entry.debit || 0) - (entry.credit || 0);
        return {
          ...entry,
          balance: runningBalance,
        };
      });

      return entriesWithBalances;
    } catch (error) {
      console.error("Error in getCustomerLedger:", error);
      return [];
    }
  },

  // Get customer ledger with date range (exclude hidden entries)
  async getCustomerLedgerByDate(
    customerId: string,
    startDate?: string,
    endDate?: string
  ): Promise<LedgerEntry[]> {
    try {
      let query = supabase
        .from("ledger_entries")
        .select("*")
        .eq("customer_id", customerId)
        .eq("is_hidden", false); // EXCLUDE hidden entries

      if (startDate) {
        query = query.gte("date", startDate);
      }
      if (endDate) {
        query = query.lte("date", endDate);
      }

      query = query
        .order("date", { ascending: true })
        .order("created_at", { ascending: true });

      const { data: entries, error } = await query;

      if (error) {
        console.error("Error getting ledger by date:", error);
        return [];
      }

      // Calculate running balance
      let runningBalance = 0;
      const entriesWithBalances = (entries || []).map((entry) => {
        runningBalance =
          runningBalance + (entry.debit || 0) - (entry.credit || 0);
        return {
          ...entry,
          balance: runningBalance,
        };
      });

      return entriesWithBalances;
    } catch (error) {
      console.error("Error in getCustomerLedgerByDate:", error);
      return [];
    }
  },

  // Get ledger summary for a customer (exclude hidden entries)
  async getLedgerSummary(
    customerId: string,
    startDate?: string,
    endDate?: string
  ) {
    try {
      const entries = await this.getCustomerLedgerByDate(
        customerId,
        startDate,
        endDate
      );

      // Get customer details
      const { data: customer } = await supabase
        .from("customers")
        .select("opening_balance, current_balance")
        .eq("id", customerId)
        .single();

      if (!entries.length) {
        return {
          openingBalance: customer?.opening_balance || 0,
          closingBalance: customer?.current_balance || 0,
          totalDebits: 0,
          totalCredits: 0,
          entries: [],
        };
      }

      const totalDebits = entries.reduce(
        (sum, entry) => sum + (entry.debit || 0),
        0
      );
      const totalCredits = entries.reduce(
        (sum, entry) => sum + (entry.credit || 0),
        0
      );

      // Opening balance is the balance before the first entry in the period
      const openingBalance =
        entries[0]?.balance - entries[0]?.debit + entries[0]?.credit || 0;
      const closingBalance = entries[entries.length - 1]?.balance || 0;

      return {
        openingBalance,
        closingBalance,
        totalDebits,
        totalCredits,
        entries,
      };
    } catch (error) {
      console.error("Error in getLedgerSummary:", error);
      throw error;
    }
  },

  // Add a ledger entry with correct balance calculation
  async addLedgerEntry(entry: {
    customer_id: string;
    date: string;
    type: string;
    reference_id: string;
    reference_number: string;
    debit: number;
    credit: number;
    description: string;
    is_hidden?: boolean;
  }): Promise<LedgerEntry | null> {
    try {
      console.log("📝 Creating ledger entry:", entry);

      // SPECIAL CASE: Opening balance entries
      if (entry.type === "opening_balance") {
        console.log("Creating opening balance entry");

        // Opening balance sets the initial balance
        const openingBalance = entry.debit - entry.credit;

        const { data, error } = await supabase
          .from("ledger_entries")
          .insert([
            {
              ...entry,
              balance: openingBalance, // Opening balance IS the balance
            },
          ])
          .select()
          .single();

        if (error) {
          console.error("❌ Database error:", error);
          return null;
        }

        console.log("✅ Opening balance ledger entry added:", data);

        // Update customer balance
        await this.updateCustomerBalance(entry.customer_id);

        return data;
      }

      // For regular entries, calculate based on previous balance
      const { data: latestEntry } = await supabase
        .from("ledger_entries")
        .select("balance")
        .eq("customer_id", entry.customer_id)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      let previousBalance = 0;
      if (latestEntry) {
        previousBalance = latestEntry.balance || 0;
      }

      console.log("Previous balance:", previousBalance);

      // Calculate new balance
      let newBalance = previousBalance;

      if (entry.is_hidden) {
        // Hidden entries INHERIT the previous balance
        newBalance = previousBalance;
        console.log("Hidden entry - INHERITING balance:", newBalance);
      } else {
        // Non-hidden entries: calculate normally
        newBalance = previousBalance + entry.debit - entry.credit;
        console.log("Non-hidden entry - calculating:", {
          previousBalance,
          debit: entry.debit,
          credit: entry.credit,
          newBalance,
        });
      }

      // Insert with calculated balance
      const { data, error } = await supabase
        .from("ledger_entries")
        .insert([
          {
            ...entry,
            balance: newBalance,
          },
        ])
        .select()
        .single();

      if (error) {
        console.error("❌ Database error:", error);
        return null;
      }

      console.log("✅ Ledger entry added:", data);

      // Update customer balance ONLY if non-hidden
      if (!entry.is_hidden) {
        await this.updateCustomerBalance(entry.customer_id);
      }

      return data;
    } catch (error) {
      console.error("❌ Error in addLedgerEntry:", error);
      return null;
    }
  },

  // Update customer balance based on last NON-HIDDEN ledger entry
  async updateCustomerBalance(customerId: string): Promise<void> {
    try {
      console.log("Updating customer balance for:", customerId);

      // Get last NON-HIDDEN balance
      const { data: lastNonHiddenEntry, error } = await supabase
        .from("ledger_entries")
        .select("balance")
        .eq("customer_id", customerId)
        .eq("is_hidden", false) // CRITICAL: Only non-hidden entries!
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error) {
        console.error("Error finding last non-hidden entry:", error);
        return;
      }

      const lastBalance = lastNonHiddenEntry?.balance || 0;
      console.log("Last NON-HIDDEN balance:", lastBalance);

      // Update customer with last non-hidden balance
      const { error: updateError } = await supabase
        .from("customers")
        .update({
          current_balance: lastBalance,
          updated_at: new Date().toISOString(),
        })
        .eq("id", customerId);

      if (updateError) {
        console.error("Error updating customer balance:", updateError);
      } else {
        console.log("✅ Customer balance updated to:", lastBalance);
      }
    } catch (error) {
      console.error("Error in updateCustomerBalance:", error);
    }
  },

  // Remove ledger entry
  async removeLedgerEntry(referenceId: string, type: string): Promise<void> {
    try {
      console.log(`Removing ledger entry for ${type} with ID: ${referenceId}`);

      // Get the entry first to know the customer
      const { data: entry } = await supabase
        .from("ledger_entries")
        .select("customer_id")
        .eq("reference_id", referenceId)
        .eq("type", type)
        .single();

      if (entry) {
        const { error } = await supabase
          .from("ledger_entries")
          .delete()
          .eq("reference_id", referenceId)
          .eq("type", type);

        if (error) {
          console.error("Error removing ledger entry:", error);
        } else {
          console.log(`✅ Ledger entry for ${referenceId} removed`);
          // Recalculate balance for the customer
          await this.recalculateCustomerBalance(entry.customer_id);
        }
      }
    } catch (error) {
      console.error("Error in removeLedgerEntry:", error);
    }
  },

  // Recalculate customer balance from LAST NON-HIDDEN ledger entry
  async recalculateCustomerBalance(customerId: string): Promise<number> {
    try {
      console.log("Recalculating balance for customer:", customerId);

      // Get last NON-HIDDEN ledger entry
      const { data: lastNonHiddenEntry, error: lastEntryError } = await supabase
        .from("ledger_entries")
        .select("balance")
        .eq("customer_id", customerId)
        .eq("is_hidden", false) // CRITICAL: Only non-hidden!
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (lastEntryError) {
        console.error("Error finding last non-hidden entry:", lastEntryError);
        return 0;
      }

      const lastBalance = lastNonHiddenEntry?.balance || 0;
      console.log("Last NON-HIDDEN balance in ledger:", lastBalance);

      // Update customer
      const { error: updateError } = await supabase
        .from("customers")
        .update({
          current_balance: lastBalance,
          updated_at: new Date().toISOString(),
        })
        .eq("id", customerId);

      if (updateError) {
        console.error("Error updating customer balance:", updateError);
      }

      return lastBalance;
    } catch (error) {
      console.error("Error in recalculateCustomerBalance:", error);
      return 0;
    }
  },

  // Initialize customer ledger with opening balance
  async initializeCustomerLedger(
    customerId: string,
    openingBalance: number,
    asOfDate: string
  ): Promise<void> {
    try {
      console.log(
        "Initializing ledger for customer:",
        customerId,
        "Date:",
        asOfDate
      );

      // Check if opening balance entry already exists
      const { data: existing } = await supabase
        .from("ledger_entries")
        .select("id")
        .eq("customer_id", customerId)
        .eq("type", "opening_balance")
        .limit(1);

      if (existing && existing.length > 0) {
        console.log("Opening balance already exists, updating...");

        // Update existing entry
        const { error: updateError } = await supabase
          .from("ledger_entries")
          .update({
            date: asOfDate,
            debit: openingBalance > 0 ? Math.abs(openingBalance) : 0,
            credit: openingBalance < 0 ? Math.abs(openingBalance) : 0,
            description: "Opening Balance",
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing[0].id);

        if (updateError) {
          console.error("Error updating opening balance:", updateError);
        } else {
          console.log("Opening balance updated successfully");
          // Recalculate balances
          await this.recalculateCustomerBalance(customerId);
        }
        return;
      }

      // Create opening balance entry if it doesn't exist
      if (openingBalance !== 0) {
        await this.addLedgerEntry({
          customer_id: customerId,
          date: asOfDate,
          type: "opening_balance",
          reference_id: customerId,
          reference_number: "OPENING",
          debit: openingBalance > 0 ? Math.abs(openingBalance) : 0,
          credit: openingBalance < 0 ? Math.abs(openingBalance) : 0,
          description: "Opening Balance",
        });
        console.log("Opening balance created with date:", asOfDate);
      }
    } catch (error) {
      console.error("Error initializing customer ledger:", error);
    }
  },

  // Ensure opening balance entry exists
  async ensureOpeningBalanceEntry(
    customerId: string,
    openingBalance: number,
    asOfDate: string
  ): Promise<void> {
    try {
      // Check if opening balance entry exists
      const { data: existing } = await supabase
        .from("ledger_entries")
        .select("*")
        .eq("customer_id", customerId)
        .eq("type", "opening_balance")
        .single();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from("ledger_entries")
          .update({
            date: asOfDate,
            debit: openingBalance > 0 ? Math.abs(openingBalance) : 0,
            credit: openingBalance < 0 ? Math.abs(openingBalance) : 0,
            balance: openingBalance,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (error) throw error;
      } else {
        // Create new
        await this.addLedgerEntry({
          customer_id: customerId,
          date: asOfDate,
          type: "opening_balance",
          reference_id: customerId,
          reference_number: "OPENING",
          debit: openingBalance > 0 ? Math.abs(openingBalance) : 0,
          credit: openingBalance < 0 ? Math.abs(openingBalance) : 0,
          description: "Opening Balance",
        });
      }
    } catch (error) {
      console.error("Error ensuring opening balance entry:", error);
    }
  },

  // Helper: Get customer's current balance from ledger (non-hidden only)
  async getCustomerCurrentBalance(customerId: string): Promise<number> {
    try {
      const { data: lastNonHiddenEntry } = await supabase
        .from("ledger_entries")
        .select("balance")
        .eq("customer_id", customerId)
        .eq("is_hidden", false)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      return lastNonHiddenEntry?.balance || 0;
    } catch (error) {
      console.error("Error getting customer current balance:", error);
      return 0;
    }
  },

  // Debug: Check balance consistency
  async debugBalanceConsistency(customerId: string): Promise<any> {
    try {
      console.log("=== DEBUG BALANCE CONSISTENCY ===");

      // 1. Get customer
      const { data: customer } = await supabase
        .from("customers")
        .select("*")
        .eq("id", customerId)
        .single();

      // 2. Get all ledger entries
      const { data: allEntries } = await supabase
        .from("ledger_entries")
        .select("*")
        .eq("customer_id", customerId)
        .order("date", { ascending: true })
        .order("created_at", { ascending: true });

      // 3. Get non-hidden entries only
      const nonHiddenEntries =
        allEntries?.filter((entry) => !entry.is_hidden) || [];

      // 4. Calculate balance from non-hidden entries
      let calculatedBalance = 0;
      if (nonHiddenEntries.length > 0) {
        nonHiddenEntries.forEach((entry) => {
          calculatedBalance =
            calculatedBalance + (entry.debit || 0) - (entry.credit || 0);
        });
      }

      // 5. Get last entry balance
      const lastEntryBalance =
        allEntries?.[allEntries.length - 1]?.balance || 0;

      console.log("Results:", {
        customerName: customer?.company_name,
        customerCurrentBalance: customer?.current_balance,
        calculatedFromNonHidden: calculatedBalance,
        lastLedgerEntryBalance: lastEntryBalance,
        totalEntries: allEntries?.length || 0,
        nonHiddenEntries: nonHiddenEntries.length,
        hiddenEntries: (allEntries?.length || 0) - nonHiddenEntries.length,
      });

      console.log("=== END DEBUG ===");

      return {
        customer,
        calculatedBalance,
        lastEntryBalance,
        allEntries,
        nonHiddenEntries,
      };
    } catch (error) {
      console.error("Error in debugBalanceConsistency:", error);
      return null;
    }
  },
};
