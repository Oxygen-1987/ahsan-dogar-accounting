import React, { useState, useEffect } from "react";
import {
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  InputNumber,
  Row,
  Col,
  Card,
  Table,
  Button,
  Space,
  Tag,
  Alert,
  App,
} from "antd";
import { customerService } from "../../services/customerService";
import { invoiceService } from "../../services/invoiceService";
import { paymentService } from "../../services/paymentService";
import { ledgerService } from "../../services/ledgerService";
import { discountService } from "../../services/discountService";
import { paymentApplicationService } from "../../services/paymentApplicationService";
import type {
  Customer,
  Invoice,
  PaymentFormData,
  PaymentMethod,
  PaymentStatus,
} from "../../types";
import dayjs from "dayjs";

const { Option } = Select;
const { TextArea } = Input;

interface ReceivePaymentModalProps {
  visible: boolean;
  onCancel: () => void;
  onSuccess: () => void;
  customer?: Customer | null;
}

const ReceivePaymentModal: React.FC<ReceivePaymentModalProps> = ({
  visible,
  onCancel,
  onSuccess,
  customer,
}) => {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );
  const [customerInvoices, setCustomerInvoices] = useState<Invoice[]>([]);
  const [selectedInvoices, setSelectedInvoices] = useState<{
    [key: string]: number;
  }>({});
  const [totalSelectedAmount, setTotalSelectedAmount] = useState(0);
  const [totalPendingAmount, setTotalPendingAmount] = useState(0);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [openingBalance, setOpeningBalance] = useState<{
    amount: number;
    date: string;
    isPositive: boolean;
    remaining: number;
  }>({ amount: 0, date: "", isPositive: true, remaining: 0 });
  const [openingBalanceAllocation, setOpeningBalanceAllocation] =
    useState<number>(0);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [discountReason, setDiscountReason] = useState<string>("");

  useEffect(() => {
    if (visible) {
      console.log("Modal opened - resetting all data");
      resetModal();
      loadCustomers();

      if (customer) {
        console.log(
          "Customer provided, will auto-select:",
          customer.company_name
        );
      }
    }
  }, [visible]);

  useEffect(() => {
    if (visible && customer && customers.length > 0) {
      const foundCustomer = customers.find((c) => c.id === customer.id);
      if (foundCustomer) {
        form.setFieldsValue({
          customer_id: foundCustomer.id,
        });
        setSelectedCustomer(foundCustomer);
        handleCustomerLoad(foundCustomer.id);
      }
    }
  }, [visible, customers, customer, form]);

  const resetModal = () => {
    form.resetFields();
    setSelectedCustomer(null);
    setCustomerInvoices([]);
    setSelectedInvoices({});
    setTotalSelectedAmount(0);
    setTotalPendingAmount(0);
    setOpeningBalance({ amount: 0, date: "", isPositive: true, remaining: 0 });
    setOpeningBalanceAllocation(0);
    setDiscountAmount(0);
    setDiscountReason("");
    form.setFieldsValue({
      payment_date: dayjs(),
      payment_method: "cash",
    });
  };

  const loadCustomers = async () => {
    try {
      const result = await customerService.getAllCustomers();
      setCustomers(result.customers);
    } catch (error) {
      console.error("Failed to load customers:", error);
      message.error("Failed to load customers");
    }
  };

  const handleCustomerLoad = async (customerId: string) => {
    try {
      console.log("Loading customer data for:", customerId);

      // Find customer in the customers array
      const customer = customers.find((c) => c.id === customerId);
      if (!customer) {
        message.error("Customer not found");
        return;
      }

      // Get opening balance payments from new service
      const openingBalanceData =
        await paymentApplicationService.getOpeningBalancePayments(customerId);
      console.log("Opening balance payments data:", openingBalanceData);

      // Calculate remaining opening balance
      const remainingOpeningBalance = Math.max(
        0,
        (customer.opening_balance || 0) - (openingBalanceData?.totalPaid || 0)
      );

      // Get customer invoices
      const customerPendingInvoices =
        await invoiceService.getCustomerPendingInvoices(customerId);
      console.log("Customer invoices:", customerPendingInvoices);

      setCustomerInvoices(customerPendingInvoices);
      setOpeningBalance({
        amount: customer.opening_balance || 0,
        date: customer.as_of_date || dayjs().format("YYYY-MM-DD"),
        isPositive: true,
        remaining: remainingOpeningBalance,
      });

      // Calculate total pending (invoices + remaining opening balance)
      const invoicePending = customerPendingInvoices.reduce(
        (sum, inv) => sum + (inv.pending_amount || 0),
        0
      );
      const totalPending = invoicePending + remainingOpeningBalance;

      console.log("Total pending calculation:", {
        customerOpeningBalance: customer.opening_balance,
        paidToOpeningBalance: openingBalanceData?.totalPaid,
        remainingOpeningBalance,
        invoicePending,
        totalPending,
      });

      setTotalPendingAmount(totalPending);
      setSelectedInvoices({});
      setTotalSelectedAmount(0);
      setOpeningBalanceAllocation(0);
      setDiscountAmount(0);
      setDiscountReason("");
    } catch (error) {
      console.error("Error in handleCustomerLoad:", error);
      message.error("Failed to load customer data");
      setCustomerInvoices([]);
      setTotalPendingAmount(0);
    }
  };

  // Currently unused but available if needed
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const refreshCustomerData = async (customerId: string) => {
    try {
      console.log("Refreshing customer data for:", customerId);

      // Find the customer in the customers array
      const customer = customers.find((c) => c.id === customerId);
      if (!customer) {
        console.error("Customer not found");
        return;
      }

      // Get opening balance payments from new service
      const openingBalanceData =
        await paymentApplicationService.getOpeningBalancePayments(customerId);

      // Calculate remaining opening balance
      const remainingOpeningBalance = Math.max(
        0,
        (customer.opening_balance || 0) - (openingBalanceData?.totalPaid || 0)
      );

      // Get customer invoices
      const customerPendingInvoices =
        await invoiceService.getCustomerPendingInvoices(customerId);

      // Update state
      setCustomerInvoices(customerPendingInvoices);
      setOpeningBalance({
        amount: customer.opening_balance || 0,
        date: customer.as_of_date || dayjs().format("YYYY-MM-DD"),
        isPositive: true,
        remaining: remainingOpeningBalance,
      });

      // Calculate total pending
      const invoicePending = customerPendingInvoices.reduce(
        (sum, inv) => sum + (inv.pending_amount || 0),
        0
      );
      const totalPending = invoicePending + remainingOpeningBalance;

      setTotalPendingAmount(totalPending);

      // Reset allocations
      setSelectedInvoices({});
      setTotalSelectedAmount(0);
      setOpeningBalanceAllocation(0);
      setDiscountAmount(0);
      setDiscountReason("");

      console.log("Customer data refreshed successfully:", {
        openingBalance: customer.opening_balance,
        paid: openingBalanceData?.totalPaid,
        remaining: remainingOpeningBalance,
        invoices: customerPendingInvoices.length,
      });
    } catch (error) {
      console.error("Error refreshing customer data:", error);
    }
  };

  const handleCustomerChange = async (customerId: string) => {
    console.log("Customer changed to ID:", customerId);

    if (!customerId) {
      setSelectedCustomer(null);
      setCustomerInvoices([]);
      setTotalPendingAmount(0);
      setSelectedInvoices({});
      setTotalSelectedAmount(0);
      setOpeningBalance({
        amount: 0,
        date: "",
        isPositive: true,
        remaining: 0,
      });
      setOpeningBalanceAllocation(0);
      setDiscountAmount(0);
      setDiscountReason("");
      return;
    }

    try {
      const customer = customers.find((c) => c.id === customerId);
      setSelectedCustomer(customer || null);

      if (customerId) {
        setLoadingInvoices(true);
        await handleCustomerLoad(customerId);
        setLoadingInvoices(false);
      }
    } catch (error) {
      console.error("Error in handleCustomerChange:", error);
      message.error("Failed to load customer data");
      setLoadingInvoices(false);
    }
  };

  const applyFIFO = (amountToAllocate?: number) => {
    const sortedInvoices = [...customerInvoices].sort(
      (a, b) => dayjs(a.due_date).valueOf() - dayjs(b.due_date).valueOf()
    );

    const newSelectedInvoices: { [key: string]: number } = {};
    let remainingAmount = amountToAllocate || totalSelectedAmount;
    let openingBalanceApplied = 0;

    console.log("Applying FIFO with discount:", {
      amountToAllocate,
      remainingAmount,
      discountAmount,
      openingBalanceRemaining: openingBalance.remaining,
      isPositive: openingBalance.isPositive,
      invoiceCount: sortedInvoices.length,
    });

    // FIRST: Apply to REMAINING opening balance if it's positive
    if (
      openingBalance.isPositive &&
      openingBalance.remaining > 0 &&
      remainingAmount > 0
    ) {
      const amountToApply = Math.min(openingBalance.remaining, remainingAmount);
      openingBalanceApplied = amountToApply;
      remainingAmount -= amountToApply;
      console.log(
        `Applied ${amountToApply} to opening balance (remaining: ${openingBalance.remaining}), leftover: ${remainingAmount}`
      );
    }

    // THEN: Apply to invoices in FIFO order
    // IMPORTANT: Discount will be applied to the LAST invoice in FIFO order
    for (let i = 0; i < sortedInvoices.length; i++) {
      if (remainingAmount <= 0) break;

      const invoice = sortedInvoices[i];
      const isLastInvoice = i === sortedInvoices.length - 1;

      let amountToApply = Math.min(invoice.pending_amount, remainingAmount);

      // If this is the last invoice and we have discount, adjust the amount
      if (isLastInvoice && discountAmount > 0) {
        // The discount effectively reduces what needs to be paid for this invoice
        const effectiveAmountNeeded = Math.max(
          0,
          invoice.pending_amount - discountAmount
        );
        amountToApply = Math.min(effectiveAmountNeeded, remainingAmount);
        console.log(
          `Discount applied to last invoice ${invoice.invoice_number}:`,
          {
            originalPending: invoice.pending_amount,
            discount: discountAmount,
            effectiveNeeded: effectiveAmountNeeded,
            amountToApply,
          }
        );
      }

      if (amountToApply > 0) {
        newSelectedInvoices[invoice.id] = amountToApply;
        remainingAmount -= amountToApply;
        console.log(
          `Applied ${amountToApply} to invoice ${invoice.invoice_number}, remaining: ${remainingAmount}`
        );
      }
    }

    setSelectedInvoices(newSelectedInvoices);
    setOpeningBalanceAllocation(openingBalanceApplied);

    // Update total selected amount
    const newTotal =
      openingBalanceApplied +
      Object.values(newSelectedInvoices).reduce((sum, amt) => sum + amt, 0);
    setTotalSelectedAmount(newTotal);

    console.log("FIFO application complete:", {
      openingBalanceApplied,
      discountAmount,
      invoiceAllocations: Object.keys(newSelectedInvoices).length,
      newTotal,
    });
  };

  const handleTotalAmountChange = (totalAmount: number) => {
    const amount = totalAmount || 0;
    console.log("Total amount changed to:", amount);
    setTotalSelectedAmount(amount);

    // If total amount changes, clear existing allocations and reapply FIFO
    if (amount > 0) {
      applyFIFO(amount);
    } else {
      setSelectedInvoices({});
      setOpeningBalanceAllocation(0);
    }
  };

  const handleInvoiceAmountChange = (invoiceId: string, amount: number) => {
    const invoice = customerInvoices.find((inv) => inv.id === invoiceId);
    if (!invoice) return;

    const maxAmount = invoice.pending_amount;
    const actualAmount = Math.min(Math.max(0, amount), maxAmount);

    const newSelectedInvoices = {
      ...selectedInvoices,
      [invoiceId]: actualAmount,
    };

    // Remove zero amounts
    if (actualAmount === 0) {
      delete newSelectedInvoices[invoiceId];
    }

    setSelectedInvoices(newSelectedInvoices);

    // Calculate total (opening balance allocation + invoice allocations)
    const invoiceTotal = Object.values(newSelectedInvoices).reduce(
      (sum, amt) => sum + amt,
      0
    );
    const total = openingBalanceAllocation + invoiceTotal;
    setTotalSelectedAmount(total);
  };

  const handleOpeningBalanceChange = (amount: number) => {
    const maxAmount = openingBalance.isPositive ? openingBalance.remaining : 0;
    const actualAmount = Math.min(Math.max(0, amount), maxAmount);
    setOpeningBalanceAllocation(actualAmount);

    // Recalculate total
    const invoiceTotal = Object.values(selectedInvoices).reduce(
      (sum, amt) => sum + amt,
      0
    );
    const total = actualAmount + invoiceTotal;
    setTotalSelectedAmount(total);
  };

  const handleDiscountAmountChange = (amount: number) => {
    const newDiscountAmount = amount || 0;
    setDiscountAmount(newDiscountAmount);

    // Reapply FIFO when discount changes
    if (totalSelectedAmount > 0 || newDiscountAmount > 0) {
      applyFIFO(totalSelectedAmount);
    }
  };

  // New function to create payment with discount
  const createPaymentWithDiscount = async (paymentData: any) => {
    try {
      const { supabase } = await import("../../services/supabaseClient");

      // Create the payment with discount field
      const { data: payment, error } = await supabase
        .from("payments")
        .insert([
          {
            payment_number: paymentData.payment_number,
            customer_id: paymentData.customer_id,
            payment_date: paymentData.payment_date,
            total_received: paymentData.total_received,
            discount_amount: paymentData.discount_amount || 0,
            payment_method: paymentData.payment_method,
            reference_number: paymentData.reference_number || null,
            bank_name: paymentData.bank_name || null,
            cheque_date: paymentData.cheque_date || null,
            notes: paymentData.notes || null,
            status: paymentData.status,
          },
        ])
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create payment: ${error.message}`);
      }

      if (payment) {
        // Create ledger entry for ACTUAL payment received
        let ledgerDescription = `Payment ${payment.payment_number} received`;

        if (paymentData.discount_amount > 0) {
          ledgerDescription += ` with PKR ${paymentData.discount_amount.toLocaleString()} discount`; // ← THIS IS WRONG!
        }

        if (paymentData.opening_balance_allocation?.amount) {
          const openingAmount = paymentData.opening_balance_allocation.amount;
          ledgerDescription += ` (PKR ${openingAmount.toLocaleString()} to opening balance)`;
        }

        // Create main payment ledger entry
        await ledgerService.addLedgerEntry({
          customer_id: paymentData.customer_id,
          date: paymentData.payment_date,
          type: "payment",
          reference_id: payment.id,
          reference_number: payment.payment_number,
          debit: 0,
          credit: paymentData.total_received, // ← ONLY the 350,000
          description: `Payment ${payment.payment_number} received`, // ← NO mention of discount here!
        });

        // Update invoice balances for actual payments
        if (
          paymentData.invoice_allocations &&
          paymentData.invoice_allocations.length > 0
        ) {
          for (const allocation of paymentData.invoice_allocations) {
            if (allocation.amount > 0) {
              await invoiceService.updateInvoicePayment(
                allocation.invoice_id,
                allocation.amount
              );
            }
          }
        }

        // Apply discount to last invoice if discount exists
        if (paymentData.discount_amount > 0) {
          const sortedInvoices = [...customerInvoices].sort(
            (a, b) => dayjs(a.due_date).valueOf() - dayjs(b.due_date).valueOf()
          );

          if (sortedInvoices.length > 0) {
            const lastInvoice = sortedInvoices[sortedInvoices.length - 1];

            // Apply discount to the last invoice
            await discountService.applyDiscountToInvoice(
              paymentData.customer_id,
              lastInvoice.id,
              payment.id,
              {
                amount: paymentData.discount_amount,
                reason: paymentData.discount_reason,
                date: paymentData.payment_date,
                paymentNumber: payment.payment_number,
              }
            );

            console.log(
              `✅ Discount of PKR ${paymentData.discount_amount} applied to invoice ${lastInvoice.invoice_number}`
            );
          }
        }

        // Record opening balance payment if any
        if (paymentData.opening_balance_allocation?.amount) {
          const openingBalanceAmount =
            paymentData.opening_balance_allocation.amount;
          try {
            const { error: appError } = await supabase
              .from("customer_payment_applications")
              .insert([
                {
                  payment_id: payment.id,
                  customer_id: paymentData.customer_id,
                  amount: openingBalanceAmount,
                  application_date: paymentData.payment_date,
                  notes: `Opening balance payment - ${payment.payment_number}`,
                  // invoice_id is NULL for opening balance
                },
              ]);

            if (appError) {
              console.error(
                "Failed to save to customer_payment_applications:",
                appError
              );
            } else {
              console.log("✅ Saved opening balance payment to new system");
            }
          } catch (error) {
            console.log(
              "customer_payment_applications table might not exist yet"
            );
          }
        }

        // After creating payment and discount, recalculate customer balance
        // Add this after all updates:
        try {
          await ledgerService.recalculateCustomerBalance(
            paymentData.customer_id
          );
          console.log("Customer balance recalculated");
        } catch (balanceError) {
          console.error("Error recalculating balance:", balanceError);
        }

        return payment;
      }

      return null;
    } catch (error: any) {
      console.error("Error in createPaymentWithDiscount:", error);
      throw error;
    }
  };

  const handleSubmit = async (values: any) => {
    if (totalSelectedAmount === 0 && discountAmount === 0) {
      message.error("Please enter a payment amount or discount");
      return;
    }

    if (!values.payment_number || !values.payment_number.trim()) {
      message.error("Please enter a payment number");
      return;
    }

    console.log("Form values:", values);
    console.log("Opening balance allocation:", openingBalanceAllocation);
    console.log("Selected invoices:", selectedInvoices);
    console.log("Total selected amount:", totalSelectedAmount);
    console.log("Discount amount:", discountAmount);
    console.log("Discount reason:", discountReason);

    setLoading(true);
    try {
      let paymentStatus: PaymentStatus = "completed";

      if (
        values.payment_method === "cheque" ||
        values.payment_method === "parchi"
      ) {
        paymentStatus = "pending";
      }

      const invoiceAllocations = Object.entries(selectedInvoices)
        .filter(([_, amount]) => amount > 0)
        .map(([invoiceId, amount]) => ({
          invoice_id: invoiceId,
          amount: amount,
        }));

      console.log("All allocations:", {
        openingBalance: openingBalanceAllocation,
        invoiceAllocations,
        discountAmount,
        totalSelectedAmount,
      });

      // Prepare payment notes including discount
      let paymentNotes = values.notes || "";
      if (openingBalanceAllocation > 0) {
        if (paymentNotes) paymentNotes += "\n";
        paymentNotes += `PKR ${openingBalanceAllocation.toLocaleString()} paid against opening balance.`;
      }

      if (discountAmount > 0) {
        if (paymentNotes) paymentNotes += "\n";
        paymentNotes += `PKR ${discountAmount.toLocaleString()} discount applied${
          discountReason ? `: ${discountReason}` : ""
        }.`;
      }

      const paymentData = {
        payment_number: values.payment_number.trim(),
        customer_id: values.customer_id,
        payment_date: values.payment_date.format("YYYY-MM-DD"),
        total_received: totalSelectedAmount, // This is ACTUAL cash received
        discount_amount: discountAmount, // Add discount amount
        discount_reason: discountReason,
        payment_method: values.payment_method,
        reference_number: values.reference_number || undefined,
        bank_name: values.bank_name || undefined,
        cheque_date: values.cheque_date?.format("YYYY-MM-DD") || undefined,
        status: paymentStatus,
        notes: paymentNotes.trim(),
        invoice_allocations: invoiceAllocations,
        opening_balance_allocation:
          openingBalanceAllocation > 0
            ? {
                amount: openingBalanceAllocation,
                date: openingBalance.date,
              }
            : undefined,
      };

      console.log("Sending payment data to service:", paymentData);

      // Check if payment number already exists
      const { payments: existingPayments } =
        await paymentService.getAllPayments();
      const isDuplicate = existingPayments.some(
        (p: any) => p.payment_number === paymentData.payment_number
      );

      if (isDuplicate) {
        message.error(
          `Payment number "${paymentData.payment_number}" already exists. Please use a different number.`
        );
        setLoading(false);
        return;
      }

      // Create payment with discount
      const result = await createPaymentWithDiscount(paymentData);

      console.log("Payment creation result:", result);

      if (result) {
        message.success(
          `Payment received successfully${
            discountAmount > 0
              ? ` with PKR ${discountAmount.toLocaleString()} discount`
              : ""
          }${paymentStatus === "pending" ? " (Pending Clearance)" : ""}`
        );

        // IMPORTANT: Force refresh of customer data
        if (selectedCustomer) {
          await handleCustomerLoad(selectedCustomer.id);
        }

        onSuccess(); // This should trigger parent to refresh
        onCancel();
      } else {
        throw new Error("Payment creation failed");
      }
    } catch (error: any) {
      console.error("Payment creation error:", error);
      message.error(`Failed to receive payment: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentMethodChange = (method: PaymentMethod) => {
    if (method !== "cheque") {
      form.setFieldsValue({
        bank_name: undefined,
        cheque_date: undefined,
      });
    }
    if (method !== "cheque" && method !== "bank_transfer") {
      form.setFieldsValue({
        reference_number: undefined,
      });
    }
  };

  const paymentDistributionData = [
    ...(openingBalance.isPositive && openingBalance.remaining > 0
      ? [
          {
            id: "opening_balance",
            isOpeningBalance: true,
            description: `Opening Balance (${dayjs(openingBalance.date).format(
              "DD/MM/YYYY"
            )})`,
            pending_amount: openingBalance.remaining,
            allocation: openingBalanceAllocation,
          },
        ]
      : []),
    ...customerInvoices.map((invoice) => ({
      ...invoice,
      isOpeningBalance: false,
      allocation: selectedInvoices[invoice.id] || 0,
      discount_applied:
        discountAmount > 0 &&
        invoice.id ===
          [...customerInvoices].sort(
            (a, b) => dayjs(a.due_date).valueOf() - dayjs(b.due_date).valueOf()
          )[customerInvoices.length - 1]?.id
          ? discountAmount
          : 0,
    })),
  ];

  const invoiceColumns = [
    {
      title: "Description",
      dataIndex: "description",
      key: "description",
      render: (text: string, record: any) => (
        <div>
          {record.isOpeningBalance ? (
            <div>
              <strong style={{ color: "#faad14" }}>{text}</strong>
              <div style={{ fontSize: "12px", color: "#666" }}>
                Opening Balance (Remaining)
              </div>
            </div>
          ) : (
            <div>
              <strong>{record.invoice_number}</strong>
              <div style={{ fontSize: "12px", color: "#666" }}>
                Due: {dayjs(record.due_date).format("DD/MM/YYYY")}
                {record.status === "partial" && (
                  <div style={{ color: "#fa8c16", fontSize: "11px" }}>
                    Partial Payment Applied
                  </div>
                )}
                {record.discount_applied > 0 && (
                  <div style={{ color: "#52c41a", fontSize: "11px" }}>
                    Discount: PKR {record.discount_applied.toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Pending Amount",
      dataIndex: "pending_amount",
      key: "pending_amount",
      render: (amount: number, record: any) => {
        const originalAmount = amount;
        const discountApplied = record.discount_applied || 0;
        const effectiveAmount = Math.max(0, originalAmount - discountApplied);

        return (
          <div>
            <span
              style={{
                fontWeight: "bold",
                color: record.isOpeningBalance ? "#faad14" : "#000",
              }}
            >
              PKR {effectiveAmount.toLocaleString()}
            </span>
            {discountApplied > 0 && (
              <div style={{ fontSize: "11px", color: "#52c41a" }}>
                (Original: PKR {originalAmount.toLocaleString()})
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: "Payment Amount",
      key: "payment_amount",
      render: (record: any) => {
        if (record.isOpeningBalance) {
          return (
            <InputNumber
              style={{ width: "100%" }}
              placeholder="0"
              min={0}
              max={record.pending_amount}
              value={openingBalanceAllocation || undefined}
              onChange={(value) => handleOpeningBalanceChange(value || 0)}
              addonBefore="PKR"
              formatter={(value) =>
                value ? `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : ""
              }
              parser={(value) => (value ? value.replace(/,/g, "") : "")}
            />
          );
        }

        return (
          <InputNumber
            style={{ width: "100%" }}
            placeholder="0"
            min={0}
            max={record.pending_amount - (record.discount_applied || 0)}
            value={selectedInvoices[record.id] || undefined}
            onChange={(value) =>
              handleInvoiceAmountChange(record.id, value || 0)
            }
            addonBefore="PKR"
            formatter={(value) =>
              value ? `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : ""
            }
            parser={(value) => (value ? value.replace(/,/g, "") : "")}
          />
        );
      },
    },
  ];

  const isPartialPayment =
    totalSelectedAmount + discountAmount > 0 &&
    totalSelectedAmount + discountAmount < totalPendingAmount;

  return (
    <Modal
      title="Receive Payment"
      open={visible}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          Cancel
        </Button>,
        <Button
          key="submit"
          type="primary"
          onClick={() => form.submit()}
          loading={loading}
          disabled={
            (totalSelectedAmount === 0 && discountAmount === 0) ||
            !selectedCustomer
          }
        >
          Receive Payment
        </Button>,
      ]}
      width={1100}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          payment_date: dayjs(),
          payment_method: "cash",
        }}
      >
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="customer_id"
              label="Select Customer"
              rules={[{ required: true, message: "Please select a customer" }]}
            >
              <Select
                placeholder="Select customer"
                onChange={handleCustomerChange}
                showSearch
                optionFilterProp="children"
                filterOption={(input, option) =>
                  (option?.children as string)
                    .toLowerCase()
                    .includes(input.toLowerCase())
                }
                allowClear
                loading={customers.length === 0}
                value={selectedCustomer?.id}
              >
                {customers.map((customer) => (
                  <Option key={customer.id} value={customer.id}>
                    {customer.company_name} ({customer.first_name}{" "}
                    {customer.last_name})
                  </Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              name="payment_number"
              label="Payment Number"
              rules={[
                { required: true, message: "Please enter payment number" },
              ]}
              help="Enter any payment number format (e.g., PAY-001, CHQ-2024-01, CASH-123)"
            >
              <Input
                placeholder="Enter payment number"
                style={{ width: "100%" }}
              />
            </Form.Item>

            {selectedCustomer && (
              <Card size="small" style={{ marginBottom: 16 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div>
                      <strong>{selectedCustomer.company_name}</strong>
                    </div>
                    <div>
                      Total Pending:{" "}
                      <strong
                        style={{
                          color: totalPendingAmount > 0 ? "#ff4d4f" : "#00b96b",
                        }}
                      >
                        PKR {(totalPendingAmount || 0).toLocaleString()}
                      </strong>
                      {openingBalance.remaining > 0 && (
                        <div style={{ fontSize: "12px", color: "#faad14" }}>
                          (Includes remaining opening balance: PKR{" "}
                          {openingBalance.remaining.toLocaleString()})
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: "12px", color: "#666" }}>
                      {customerInvoices.length} pending invoice(s)
                      {openingBalance.remaining > 0
                        ? " + remaining opening balance"
                        : ""}
                    </div>
                  </div>
                  <Space>
                    <Button type="link" onClick={() => applyFIFO()}>
                      Apply FIFO
                    </Button>
                  </Space>
                </div>
              </Card>
            )}

            <Form.Item label="Total Payment Amount">
              <InputNumber
                style={{ width: "100%" }}
                placeholder="Enter payment amount"
                value={totalSelectedAmount || undefined}
                onChange={handleTotalAmountChange}
                min={0}
                max={totalPendingAmount}
                addonBefore="PKR"
                formatter={(value) =>
                  value ? `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : ""
                }
                parser={(value) => (value ? value.replace(/,/g, "") : "")}
              />
              <div style={{ fontSize: "12px", color: "#666", marginTop: 4 }}>
                Maximum allowed: PKR {totalPendingAmount.toLocaleString()}
                {openingBalance.remaining > 0 && (
                  <span> (including remaining opening balance)</span>
                )}
              </div>
            </Form.Item>

            <Form.Item label="Discount Amount">
              <InputNumber
                style={{ width: "100%" }}
                placeholder="Enter discount amount"
                value={discountAmount || undefined}
                onChange={handleDiscountAmountChange}
                min={0}
                addonBefore="PKR"
                formatter={(value) =>
                  value ? `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : ""
                }
                parser={(value) => (value ? value.replace(/,/g, "") : "")}
              />
              <div style={{ fontSize: "12px", color: "#666", marginTop: 4 }}>
                Discount will be applied to invoices as per FIFO
              </div>
            </Form.Item>

            <Form.Item label="Discount Reason">
              <Input
                placeholder="Reason for discount (optional)"
                value={discountReason}
                onChange={(e) => setDiscountReason(e.target.value)}
              />
            </Form.Item>

            {isPartialPayment && (
              <Alert
                message="Partial Payment"
                description={`This is a partial payment. Total pending: PKR ${(
                  totalPendingAmount || 0
                ).toLocaleString()}, Payment: PKR ${(
                  totalSelectedAmount || 0
                ).toLocaleString()}, Discount: PKR ${
                  discountAmount || 0
                }.toLocaleString()`}
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}

            <Form.Item
              name="payment_method"
              label="Payment Method"
              rules={[
                { required: true, message: "Please select payment method" },
              ]}
            >
              <Select
                placeholder="Select payment method"
                onChange={handlePaymentMethodChange}
              >
                <Option value="cash">Cash</Option>
                <Option value="bank_transfer">Bank Transfer</Option>
                <Option value="cheque">Cheque</Option>
                <Option value="parchi">Parchi</Option>
                <Option value="jazzcash">JazzCash</Option>
                <Option value="easypaisa">Easypaisa</Option>
              </Select>
            </Form.Item>
          </Col>

          <Col span={12}>
            <Form.Item
              name="payment_date"
              label="Payment Date"
              rules={[
                { required: true, message: "Please select payment date" },
              ]}
            >
              <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" />
            </Form.Item>

            <Form.Item name="reference_number" label="Reference Number">
              <Input placeholder="Enter reference number" />
            </Form.Item>

            <Form.Item
              noStyle
              shouldUpdate={(prevValues, currentValues) =>
                prevValues.payment_method !== currentValues.payment_method
              }
            >
              {({ getFieldValue }) =>
                getFieldValue("payment_method") === "cheque" ? (
                  <>
                    <Form.Item
                      name="bank_name"
                      label="Bank Name"
                      rules={[
                        { required: false, message: "Please enter bank name" },
                      ]}
                    >
                      <Input placeholder="Enter bank name (optional)" />
                    </Form.Item>
                    <Form.Item
                      name="cheque_date"
                      label="Cheque Date"
                      rules={[
                        {
                          required: false,
                          message: "Please select cheque date",
                        },
                      ]}
                    >
                      <DatePicker
                        style={{ width: "100%" }}
                        format="DD/MM/YYYY"
                        placeholder="Select cheque date (optional)"
                      />
                    </Form.Item>
                  </>
                ) : null
              }
            </Form.Item>

            <Form.Item
              noStyle
              shouldUpdate={(prevValues, currentValues) =>
                prevValues.payment_method !== currentValues.payment_method
              }
            >
              {({ getFieldValue }) =>
                getFieldValue("payment_method") === "bank_transfer" ? (
                  <Form.Item
                    name="bank_name"
                    label="Bank Name"
                    rules={[
                      { required: false, message: "Please enter bank name" },
                    ]}
                  >
                    <Input placeholder="Enter bank name (optional)" />
                  </Form.Item>
                ) : null
              }
            </Form.Item>

            <Form.Item name="notes" label="Notes">
              <TextArea placeholder="Additional notes (optional)" rows={3} />
            </Form.Item>
          </Col>
        </Row>

        {selectedCustomer && paymentDistributionData.length > 0 && (
          <Card
            title="Payment Distribution"
            size="small"
            style={{ marginTop: 16 }}
            extra={
              <div>
                <div>
                  Total Payment:{" "}
                  <strong>
                    PKR {(totalSelectedAmount || 0).toLocaleString()}
                  </strong>
                </div>
                <div>
                  Total Discount:{" "}
                  <strong style={{ color: "#52c41a" }}>
                    PKR {(discountAmount || 0).toLocaleString()}
                  </strong>
                </div>
                <div style={{ fontSize: "12px", color: "#666" }}>
                  of PKR {(totalPendingAmount || 0).toLocaleString()} pending
                  {openingBalance.remaining > 0 && (
                    <span> (including remaining opening balance)</span>
                  )}
                </div>
              </div>
            }
          >
            <div style={{ marginBottom: 12 }}>
              <Space>
                <span>You can manually adjust the distribution:</span>
                <Button size="small" type="link" onClick={() => applyFIFO()}>
                  Reset to FIFO
                </Button>
              </Space>
            </div>
            <Table
              columns={invoiceColumns}
              dataSource={paymentDistributionData}
              rowKey="id"
              pagination={false}
              size="small"
              scroll={{ y: 300 }}
              loading={loadingInvoices}
            />
          </Card>
        )}

        {selectedCustomer &&
          customerInvoices.length === 0 &&
          openingBalance.remaining === 0 &&
          !loadingInvoices && (
            <Card style={{ marginTop: 16, textAlign: "center" }}>
              <p>
                No pending invoices or opening balance found for this customer.
              </p>
            </Card>
          )}

        {loadingInvoices && (
          <Card style={{ marginTop: 16, textAlign: "center" }}>
            <p>Loading invoices...</p>
          </Card>
        )}
      </Form>
    </Modal>
  );
};

export default ReceivePaymentModal;
