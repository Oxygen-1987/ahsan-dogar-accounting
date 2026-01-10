// Base interface with common fields
export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

// Customer Form Data
export interface CustomerFormData {
  first_name: string;
  last_name: string;
  company_name: string;
  mobile: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  country: string;
  notes?: string;
  opening_balance: number;
  as_of_date: string;
}

// Customer interface
export interface Customer extends BaseEntity {
  first_name: string;
  last_name: string;
  company_name: string;
  mobile: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  country: string;
  notes?: string;
  opening_balance: number;
  current_balance: number;
  as_of_date: string;
  status: "active" | "inactive";
}

// Invoice Item
export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

// Product type
export interface Product extends BaseEntity {
  name: string;
  description?: string;
  default_rate?: number;
  status: "active" | "inactive";
}

// Line Item with inches calculation
export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  inches: number; // Length in inches
  rate: number; // Rate per inch
  amount: number; // Total amount (inches * rate)
}

// Invoice Form Data with line items
export interface InvoiceFormData {
  customer_id: string;
  invoice_number?: string;
  issue_date: string;
  term?: "due_on_receipt" | "net_15" | "net_30" | "net_60";
  due_date: string;
  line_items: InvoiceLineItem[];
  notes?: string;
  payment_terms?: string;
}

// Invoice - Simplified (no payment tracking)
export interface Invoice extends BaseEntity {
  invoice_number: string;
  customer_id: string;
  customer?: Customer;
  issue_date: string;
  due_date: string;
  total_amount: number; // Only bill amount, no payment tracking
  items: InvoiceLineItem[];
  notes?: string;
  payment_terms?: string;
}

// Payment Method types
export type PaymentMethod =
  | "cash"
  | "bank_transfer"
  | "cheque"
  | "parchi"
  | "jazzcash"
  | "easypaisa";

// Payment Status types
export type PaymentStatus = "pending" | "completed" | "cancelled";

// NEW: Payee types for distributions
export type PayeeType = "supplier" | "expense" | "owner" | "other";

// NEW: Distribution Status types
export type DistributionStatus = "allocated" | "cancelled";

// Payment Form Data
export interface PaymentFormData {
  customer_id: string;
  payment_date: string;
  total_received: number;
  discount_amount?: number;
  discount_reason?: string;
  payment_method: PaymentMethod;
  reference_number?: string;
  bank_name?: string;
  cheque_date?: string;
  status: PaymentStatus;
  notes?: string;
  distributions?: PaymentDistribution[];
}

// NEW: Customer Payment Application Form Data
export interface CustomerPaymentApplicationFormData {
  payment_id: string;
  customer_id: string;
  invoice_id?: string;
  amount: number;
  application_date: string;
  notes?: string;
}

// NEW: Customer Payment Application
export interface CustomerPaymentApplication extends BaseEntity {
  payment_id: string;
  customer_id: string;
  invoice_id?: string;
  amount: number;
  application_date: string;
  notes?: string;
  invoice?: Invoice;
}

// NEW: Payment Distribution Form Data
export interface PaymentDistributionFormData {
  payee_name: string;
  payee_type: PayeeType;
  amount: number;
  purpose: string;
  allocation_date: string;
  notes?: string;
}

// NEW: Payment Distribution
export interface PaymentDistribution extends BaseEntity {
  payment_id: string;
  payee_name: string;
  payee_type: PayeeType;
  amount: number;
  purpose: string;
  allocation_date: string;
  status: DistributionStatus;
  notes?: string;
}

// Payment interface
export interface Payment extends BaseEntity {
  payment_number: string;
  customer_id: string;
  customer?: Customer;
  payment_date: string;
  total_received: number;
  payment_method: PaymentMethod;
  reference_number?: string;
  bank_name?: string;
  cheque_date?: string;
  status: PaymentStatus;
  notes?: string;
  discount_amount?: number;
  net_received?: number;
  distributions?: PaymentDistribution[];
}

// Ledger Entry
export interface LedgerEntry extends BaseEntity {
  customer_id: string;
  customer?: Customer;
  date: string;
  type: "invoice" | "payment" | "adjustment" | "opening_balance" | "discount";
  reference_id: string;
  reference_number: string;
  debit: number;
  credit: number;
  balance: number;
  description: string;
  is_hidden?: boolean;
  invoice_id?: string;
}

export interface DiscountEntry {
  id: string;
  customer_id: string;
  customer_name?: string; // For UI display
  invoice_id?: string;
  date: string;
  amount: number;
  reason?: string;
  created_at: string;
  updated_at: string;
  reference_number?: string;
}

// Expense types
export interface Expense extends BaseEntity {
  expense_number: string;
  payee_name: string;
  amount: number;
  expense_date: string;
  category: string;
  payment_method:
    | "cash"
    | "bank_transfer"
    | "cheque"
    | "parchi"
    | "jazzcash"
    | "easypaisa";
  reference_number?: string;
  description?: string;
  status: "pending" | "paid" | "cancelled";
}

// Settings types
export interface CompanySettings extends BaseEntity {
  company_name: string;
  address?: string;
  phone?: string;
  email?: string;
  currency: string;
  date_format: string;
  tax_rate?: number;
  invoice_prefix?: string;
  payment_prefix?: string;
}

// For PDF generation
export interface CustomerLedgerData {
  customer: Customer;
  entries: LedgerEntry[];
  summary: {
    openingBalance: number;
    closingBalance: number;
    totalDebits: number;
    totalCredits: number;
    periodStart?: string;
    periodEnd?: string;
  };
}

// NEW: Opening Balance Summary
export interface OpeningBalanceSummary {
  originalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  asOfDate: string;
  payments: CustomerPaymentApplication[];
}
