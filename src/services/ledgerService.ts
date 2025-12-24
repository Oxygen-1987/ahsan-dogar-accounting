import { supabase } from "./supabaseClient";
import type { LedgerEntry } from "../types";
import dayjs from "dayjs";

export const ledgerService = {
  // Get customer ledger with proper balance calculation
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

      // Calculate running balance properly
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

  // Get customer ledger with date range
  async getCustomerLedgerByDate(
    customerId: string,
    startDate?: string,
    endDate?: string
  ): Promise<LedgerEntry[]> {
    try {
      let query = supabase
        .from("ledger_entries")
        .select("*")
        .eq("customer_id", customerId);

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

  // Get ledger summary for a customer
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

  // Add a ledger entry with optimized balance calculation
  async addLedgerEntry(entry: {
    customer_id: string;
    date: string;
    type: "invoice" | "payment" | "adjustment";
    reference_id: string;
    reference_number: string;
    debit: number;
    credit: number;
    description: string;
  }): Promise<LedgerEntry | null> {
    try {
      console.log("📝 Creating ledger entry:", entry);

      // Get the latest balance for this customer
      const { data: latestEntry, error: balanceError } = await supabase
        .from("ledger_entries")
        .select("balance")
        .eq("customer_id", entry.customer_id)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      let previousBalance = 0;
      if (!balanceError && latestEntry) {
        previousBalance = latestEntry.balance || 0;
      }

      const newBalance = previousBalance + entry.debit - entry.credit;

      console.log("Balance calculation:", {
        previousBalance,
        debit: entry.debit,
        credit: entry.credit,
        newBalance,
      });

      // Insert the ledger entry
      const { data, error } = await supabase
        .from("ledger_entries")
        .insert([
          {
            customer_id: entry.customer_id,
            date: entry.date,
            type: entry.type,
            reference_id: entry.reference_id,
            reference_number: entry.reference_number,
            debit: entry.debit,
            credit: entry.credit,
            balance: newBalance,
            description: entry.description,
          },
        ])
        .select()
        .single();

      if (error) {
        console.error("❌ Database error adding ledger entry:", error);
        return null;
      }

      console.log("✅ Ledger entry added to database:", data);

      // Update customer balance
      try {
        await this.updateCustomerBalance(entry.customer_id, newBalance);
        console.log("✅ Customer balance updated");
      } catch (balanceError) {
        console.error("Note: Could not update customer balance:", balanceError);
      }

      return data;
    } catch (error) {
      console.error("❌ Error in addLedgerEntry:", error);
      return null;
    }
  },

  // Update customer balance
  async updateCustomerBalance(
    customerId: string,
    newBalance: number
  ): Promise<void> {
    try {
      console.log("Updating customer balance:", { customerId, newBalance });

      const { error } = await supabase
        .from("customers")
        .update({
          current_balance: newBalance,
          updated_at: new Date().toISOString(),
        })
        .eq("id", customerId);

      if (error) {
        console.error("Error updating customer balance:", error);
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

  // Recalculate customer balance from ledger entries
  async recalculateCustomerBalance(customerId: string): Promise<number> {
    try {
      console.log("Recalculating balance for customer:", customerId);

      // Get ALL ledger entries in correct order
      const { data: entries, error } = await supabase
        .from("ledger_entries")
        .select("*")
        .eq("customer_id", customerId)
        .order("date", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching entries:", error);
        return 0;
      }

      // Calculate running balance
      let runningBalance = 0;
      if (entries && entries.length > 0) {
        entries.forEach((entry) => {
          runningBalance =
            runningBalance + (entry.debit || 0) - (entry.credit || 0);
        });
      }

      console.log("Calculated new balance:", runningBalance);

      // Update customer
      const { error: updateError } = await supabase
        .from("customers")
        .update({
          current_balance: runningBalance,
          updated_at: new Date().toISOString(),
        })
        .eq("id", customerId);

      if (updateError) {
        console.error("Error updating customer balance:", updateError);
      }

      return runningBalance;
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
          type: "opening_balance", // Changed from "adjustment"
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

  // Add this method to ledgerService
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
};
