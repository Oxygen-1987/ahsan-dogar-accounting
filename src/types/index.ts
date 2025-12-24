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

// Invoice Status types
export type InvoiceStatus =
  | "draft"
  | "sent"
  | "paid"
  | "overdue"
  | "partial"
  | "cancelled";

// Invoice Item
export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

// Add Product type
export interface Product extends BaseEntity {
  name: string;
  description?: string;
  default_rate?: number;
  status: "active" | "inactive";
}

// Invoice Term types
export type InvoiceTerm = "due_on_receipt" | "net_15" | "net_30" | "net_60";

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
  invoice_number?: string; // Made optional - will be generated if not provided
  issue_date: string;
  term: InvoiceTerm;
  due_date: string;
  line_items: InvoiceLineItem[];
  notes?: string;
  payment_terms?: string;
}

// Invoice
export interface Invoice extends BaseEntity {
  invoice_number: string;
  customer_id: string;
  customer?: Customer;
  issue_date: string;
  due_date: string;
  total_amount: number;
  paid_amount: number;
  pending_amount: number;
  status: InvoiceStatus;
  items: InvoiceLineItem[]; // Changed from InvoiceItem[] to InvoiceLineItem[]
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
export type PaymentStatus = "pending" | "completed" | "cancelled" | "partial";

// Payee types for allocations
export type PayeeType = "supplier" | "expense" | "owner" | "other";

// Allocation Status types
export type AllocationStatus = "allocated" | "cancelled";

// Payment Form Data
export interface PaymentFormData {
  invoice_id: string;
  customer_id: string;
  payment_date: string;
  total_received: number;
  payment_method: PaymentMethod;
  reference_number?: string;
  bank_name?: string;
  cheque_date?: string;
  status: PaymentStatus;
  notes?: string;
  allocations: PaymentAllocationFormData[];
}

// Payment Allocation Form Data
export interface PaymentAllocationFormData {
  payee_name: string;
  payee_type: PayeeType;
  amount: number;
  purpose: string;
  allocation_date: string;
  notes?: string;
}

// Payment interface
export interface Payment extends BaseEntity {
  payment_number: string;
  invoice_id: string;
  invoice?: Invoice;
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
  allocations?: PaymentAllocation[];
}

// Payment Allocation
export interface PaymentAllocation extends BaseEntity {
  payment_id: string;
  payment?: Payment;
  payee_name: string;
  payee_type: PayeeType;
  amount: number;
  purpose: string;
  allocation_date: string;
  status: AllocationStatus;
  notes?: string;
}

// Ledger Entry
export interface LedgerEntry extends BaseEntity {
  customer_id: string;
  customer?: Customer;
  date: string;
  type: "invoice" | "payment" | "adjustment" | "opening_balance_payment";
  reference_id: string;
  reference_number: string;
  debit: number;
  credit: number;
  balance: number;
  description: string;
  is_hidden?: boolean; // Add this
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

// Add Opening Balance Entry type
export interface OpeningBalanceEntry {
  customer_id: string;
  date: string;
  type: "opening_balance";
  reference_number: string;
  description: string;
  debit?: number;
  credit?: number;
  balance: number;
}

// Add for PDF generation
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
