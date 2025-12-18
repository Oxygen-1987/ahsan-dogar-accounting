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
  customer?: Customer | null; // Add customer prop
}

const ReceivePaymentModal: React.FC<ReceivePaymentModalProps> = ({
  visible,
  onCancel,
  onSuccess,
  customer, // Destructure the customer prop
}) => {
  const [form] = Form.useForm();
  const { message } = App.useApp(); // Get message from App context
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

  // Reset and auto-select when modal opens
  useEffect(() => {
    if (visible) {
      console.log("Modal opened - resetting all data");
      console.log("Customer prop received:", customer);

      resetModal();
      loadCustomers();

      // If customer prop is provided, auto-select it after customers are loaded
      if (customer) {
        console.log(
          "Customer provided, will auto-select:",
          customer.company_name
        );
      }
    }
  }, [visible]); // Only depend on visible

  // Auto-select customer when customers are loaded
  useEffect(() => {
    if (visible && customer && customers.length > 0) {
      console.log("Customers loaded, auto-selecting:", customer.company_name);

      // Find the customer in the loaded list
      const foundCustomer = customers.find((c) => c.id === customer.id);
      if (foundCustomer) {
        console.log("Found customer in list:", foundCustomer.company_name);

        // Set form value
        form.setFieldsValue({
          customer_id: foundCustomer.id,
        });

        // Set selected customer state
        setSelectedCustomer(foundCustomer);

        // Load this customer's invoices
        loadCustomerInvoices(foundCustomer.id);

        console.log("Customer auto-selected successfully");
      } else {
        console.warn("Customer not found in customers list:", customer.id);
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

    // Set default form values
    form.setFieldsValue({
      payment_date: dayjs(),
      payment_method: "cash",
    });
  };

  const loadCustomers = async () => {
    try {
      console.log("Loading customers...");
      const result = await customerService.getAllCustomers();
      setCustomers(result.customers);
      console.log("Customers loaded:", result.customers.length);
    } catch (error) {
      console.error("Failed to load customers:", error);
      message.error("Failed to load customers");
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
      return;
    }

    try {
      const customer = customers.find((c) => c.id === customerId);
      console.log("Found customer:", customer);
      setSelectedCustomer(customer || null);

      if (customerId) {
        await loadCustomerInvoices(customerId);
      }
    } catch (error) {
      console.error("Error in handleCustomerChange:", error);
      message.error("Failed to load customer data");
    }
  };

  const loadCustomerInvoices = async (customerId: string) => {
    setLoadingInvoices(true);
    try {
      console.log("Loading invoices for customer:", customerId);
      const customerPendingInvoices =
        await invoiceService.getCustomerPendingInvoices(customerId);

      console.log("Loaded invoices:", customerPendingInvoices);

      setCustomerInvoices(customerPendingInvoices);

      // Calculate total pending amount
      const totalPending = customerPendingInvoices.reduce(
        (sum, inv) => sum + (inv.pending_amount || 0),
        0
      );
      setTotalPendingAmount(totalPending);

      setSelectedInvoices({});
      setTotalSelectedAmount(0);

      console.log("Total pending amount:", totalPending);

      // Auto-fill payment amount with total pending or customer's current balance
      const customer = customers.find((c) => c.id === customerId);
      if (customer) {
        const suggestedAmount = Math.min(
          customer.current_balance || 0,
          totalPending
        );
        if (suggestedAmount > 0) {
          setTotalSelectedAmount(suggestedAmount);
          // Auto-apply FIFO
          applyFIFO(suggestedAmount);
        }
      }
    } catch (error) {
      console.error("Error loading customer invoices:", error);
      message.error("Failed to load customer invoices");
      setCustomerInvoices([]);
      setTotalPendingAmount(0);
    } finally {
      setLoadingInvoices(false);
    }
  };

  const applyFIFO = (amountToAllocate?: number) => {
    const sortedInvoices = [...customerInvoices].sort(
      (a, b) => dayjs(a.due_date).valueOf() - dayjs(b.due_date).valueOf()
    );

    const newSelectedInvoices: { [key: string]: number } = {};
    let remainingAmount = amountToAllocate || totalSelectedAmount;

    for (const invoice of sortedInvoices) {
      if (remainingAmount <= 0) break;

      const amountToApply = Math.min(invoice.pending_amount, remainingAmount);
      if (amountToApply > 0) {
        newSelectedInvoices[invoice.id] = amountToApply;
        remainingAmount -= amountToApply;
      }
    }

    setSelectedInvoices(newSelectedInvoices);

    // Update total selected amount
    const newTotal = Object.values(newSelectedInvoices).reduce(
      (sum, amt) => sum + amt,
      0
    );
    setTotalSelectedAmount(newTotal);
  };

  const handleTotalAmountChange = (totalAmount: number) => {
    const amount = totalAmount || 0;
    setTotalSelectedAmount(amount);

    // If total amount changes, clear existing allocations and reapply FIFO
    if (amount > 0) {
      applyFIFO(amount);
    } else {
      setSelectedInvoices({});
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

    // Calculate total
    const total = Object.values(newSelectedInvoices).reduce(
      (sum, amt) => sum + amt,
      0
    );
    setTotalSelectedAmount(total);
  };

  const handleSubmit = async (values: any) => {
    if (totalSelectedAmount === 0) {
      message.error("Please enter a payment amount");
      return;
    }

    console.log("Form values:", values);
    console.log("Selected invoices:", selectedInvoices);
    console.log("Total selected amount:", totalSelectedAmount);

    setLoading(true);
    try {
      // Determine payment status based on payment method
      let paymentStatus: PaymentStatus = "completed";

      if (
        values.payment_method === "cheque" ||
        values.payment_method === "parchi"
      ) {
        paymentStatus = "pending";
      }

      // Prepare invoice allocations array
      const invoiceAllocations = Object.entries(selectedInvoices)
        .filter(([_, amount]) => amount > 0)
        .map(([invoiceId, amount]) => ({
          invoice_id: invoiceId,
          amount: amount,
        }));

      console.log("Invoice allocations:", invoiceAllocations);

      // Create payment data
      const paymentData = {
        customer_id: values.customer_id,
        payment_date: values.payment_date.format("YYYY-MM-DD"),
        total_received: totalSelectedAmount,
        payment_method: values.payment_method,
        reference_number: values.reference_number || undefined,
        bank_name: values.bank_name || undefined,
        cheque_date: values.cheque_date?.format("YYYY-MM-DD") || undefined,
        status: paymentStatus,
        notes: values.notes || undefined,
        invoice_allocations: invoiceAllocations,
      };

      console.log("Sending payment data to service:", paymentData);

      const result = await paymentService.createCustomerPayment(paymentData);

      console.log("Payment creation result:", result);

      if (result) {
        message.success(
          `Payment received successfully${
            paymentStatus === "pending" ? " (Pending Clearance)" : ""
          }`
        );
        onSuccess();
        onCancel();
      } else {
        throw new Error("Payment creation failed");
      }
    } catch (error) {
      console.error("Payment creation error:", error);
      message.error("Failed to receive payment. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentMethodChange = (method: PaymentMethod) => {
    // Reset related fields when payment method changes
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

  const invoiceColumns = [
    {
      title: "Invoice Number",
      dataIndex: "invoice_number",
      key: "invoice_number",
      render: (text: string) => <strong>{text}</strong>,
    },
    {
      title: "Due Date",
      dataIndex: "due_date",
      key: "due_date",
      render: (date: string) => dayjs(date).format("DD/MM/YYYY"),
    },
    {
      title: "Pending Amount",
      dataIndex: "pending_amount",
      key: "pending_amount",
      render: (amount: number) => (
        <span style={{ fontWeight: "bold" }}>
          PKR {(amount || 0).toLocaleString()}
        </span>
      ),
    },
    {
      title: "Payment Amount",
      key: "payment_amount",
      render: (record: Invoice) => (
        <InputNumber
          style={{ width: "100%" }}
          placeholder="0"
          min={0}
          max={record.pending_amount}
          value={selectedInvoices[record.id] || undefined}
          onChange={(value) => handleInvoiceAmountChange(record.id, value || 0)}
          addonBefore="PKR"
          formatter={(value) =>
            value ? `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : ""
          }
          parser={(value) => (value ? value.replace(/,/g, "") : "")}
        />
      ),
    },
  ];

  const isPartialPayment =
    totalSelectedAmount > 0 && totalSelectedAmount < totalPendingAmount;

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
          disabled={totalSelectedAmount === 0 || !selectedCustomer}
        >
          Receive Payment
        </Button>,
      ]}
      width={1000}
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
                      <strong>
                        PKR {(totalPendingAmount || 0).toLocaleString()}
                      </strong>
                    </div>
                    <div style={{ fontSize: "12px", color: "#666" }}>
                      {customerInvoices.length} pending invoices
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
                placeholder="Enter total payment amount"
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
            </Form.Item>

            {isPartialPayment && (
              <Alert
                message="Partial Payment"
                description={`This is a partial payment. Total pending: PKR ${(
                  totalPendingAmount || 0
                ).toLocaleString()}, Payment: PKR ${(
                  totalSelectedAmount || 0
                ).toLocaleString()}`}
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
                        { required: true, message: "Please enter bank name" },
                      ]}
                    >
                      <Input placeholder="Enter bank name" />
                    </Form.Item>
                    <Form.Item
                      name="cheque_date"
                      label="Cheque Date"
                      rules={[
                        {
                          required: true,
                          message: "Please select cheque date",
                        },
                      ]}
                    >
                      <DatePicker
                        style={{ width: "100%" }}
                        format="DD/MM/YYYY"
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
                      { required: true, message: "Please enter bank name" },
                    ]}
                  >
                    <Input placeholder="Enter bank name" />
                  </Form.Item>
                ) : null
              }
            </Form.Item>

            <Form.Item name="notes" label="Notes">
              <TextArea placeholder="Additional notes (optional)" rows={3} />
            </Form.Item>
          </Col>
        </Row>

        {selectedCustomer && customerInvoices.length > 0 && (
          <Card
            title="Payment Distribution"
            size="small"
            style={{ marginTop: 16 }}
            extra={
              <div>
                Total Selected:{" "}
                <strong>
                  PKR {(totalSelectedAmount || 0).toLocaleString()}
                </strong>
                <div style={{ fontSize: "12px", color: "#666" }}>
                  of PKR {(totalPendingAmount || 0).toLocaleString()} pending
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
              dataSource={customerInvoices}
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
          !loadingInvoices && (
            <Card style={{ marginTop: 16, textAlign: "center" }}>
              <p>No pending invoices found for this customer.</p>
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
