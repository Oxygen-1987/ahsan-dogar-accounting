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
  Button,
  Space,
  Alert,
  App,
  Typography,
} from "antd";
import { customerService } from "../../services/customerService";
import { paymentService } from "../../services/paymentService";
import type { Customer, PaymentMethod, PaymentStatus } from "../../types";
import dayjs from "dayjs";

const { Option } = Select;
const { TextArea } = Input;
const { Text } = Typography;

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
    null,
  );
  const [outstandingBalance, setOutstandingBalance] = useState(0);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [generatedPaymentNumber, setGeneratedPaymentNumber] =
    useState<string>("");
  const [generatingPaymentNumber, setGeneratingPaymentNumber] = useState(false);

  useEffect(() => {
    if (visible) {
      console.log("Modal opened - resetting all data");
      resetModal();
      loadCustomers();

      if (customer) {
        console.log(
          "Customer provided, will auto-select:",
          customer.company_name,
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
        loadCustomerOutstandingBalance(foundCustomer.id);
        generatePaymentNumber(foundCustomer.id);
      }
    }
  }, [visible, customers, customer, form]);

  const resetModal = () => {
    form.resetFields();
    setSelectedCustomer(null);
    setOutstandingBalance(0);
    setGeneratedPaymentNumber("");
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

  const loadCustomerOutstandingBalance = async (customerId: string) => {
    try {
      setLoadingBalance(true);
      const balance =
        await customerService.getCustomerOutstandingBalance(customerId);
      setOutstandingBalance(balance);
      console.log(`Outstanding balance for payment modal:`, balance);
    } catch (error) {
      console.error("Failed to load customer balance:", error);
      message.error("Failed to load customer balance");
    } finally {
      setLoadingBalance(false);
    }
  };

  const generatePaymentNumber = async (customerId: string) => {
    try {
      setGeneratingPaymentNumber(true);
      const paymentNumber =
        await paymentService.generateCustomerPaymentNumber(customerId);
      setGeneratedPaymentNumber(paymentNumber);
      form.setFieldsValue({ payment_number: paymentNumber });
      console.log(`Generated payment number: ${paymentNumber}`);
    } catch (error) {
      console.error("Failed to generate payment number:", error);
      setGeneratedPaymentNumber("PAY-001");
    } finally {
      setGeneratingPaymentNumber(false);
    }
  };

  const handleCustomerChange = async (customerId: string) => {
    console.log("Customer changed to ID:", customerId);

    if (!customerId) {
      setSelectedCustomer(null);
      setOutstandingBalance(0);
      setGeneratedPaymentNumber("");
      form.setFieldsValue({ payment_number: "" });
      return;
    }

    try {
      const customer = customers.find((c) => c.id === customerId);
      setSelectedCustomer(customer || null);

      if (customerId) {
        await loadCustomerOutstandingBalance(customerId);
        await generatePaymentNumber(customerId);
      }
    } catch (error) {
      console.error("Error in handleCustomerChange:", error);
      message.error("Failed to load customer data");
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

  const handleSubmit = async (values: any) => {
    console.log("Form submission values:", values);

    // Parse the amount as float to handle any string conversion issues
    const paymentAmount = parseFloat(values.total_received) || 0;

    console.log("Parsed payment amount:", paymentAmount);

    if (paymentAmount <= 0) {
      message.error("Please enter a valid payment amount greater than 0");
      return;
    }

    if (paymentAmount > outstandingBalance) {
      message.error(
        `Payment amount cannot exceed outstanding balance of PKR ${outstandingBalance.toLocaleString()}`,
      );
      return;
    }

    console.log("Form values:", values);

    setLoading(true);
    try {
      // Use the generated payment number
      const paymentNumber = generatedPaymentNumber || values.payment_number;

      if (!paymentNumber) {
        message.error("Payment number is required");
        setLoading(false);
        return;
      }

      // Check if payment number already exists
      const { payments: existingPayments } =
        await paymentService.getAllPayments();
      const isDuplicate = existingPayments.some(
        (p: any) => p.payment_number === paymentNumber,
      );

      if (isDuplicate) {
        // If duplicate, generate a new one
        console.log(
          `Payment number "${paymentNumber}" already exists, regenerating...`,
        );
        await generatePaymentNumber(values.customer_id);
        message.error(`Payment number conflict. New number generated.`);
        setLoading(false);
        return;
      }

      const paymentData = {
        customer_id: values.customer_id,
        payment_number: paymentNumber,
        payment_date: values.payment_date.format("YYYY-MM-DD"),
        total_received: paymentAmount,
        payment_method: values.payment_method,
        reference_number: values.reference_number || undefined,
        bank_name: values.bank_name || undefined,
        cheque_date: values.cheque_date?.format("YYYY-MM-DD") || undefined,
        notes: values.notes,
      };

      console.log("Sending payment data to service:", paymentData);

      // Create payment
      const result = await paymentService.createCustomerPayment(paymentData);

      console.log("Payment creation result:", result);

      if (result) {
        const paymentStatus =
          values.payment_method === "cheque" ||
          values.payment_method === "parchi"
            ? "pending"
            : "completed";

        message.success(
          `Payment of PKR ${paymentAmount.toLocaleString()} received successfully${
            paymentStatus === "pending" ? " (Pending Clearance)" : ""
          }`,
        );

        // Refresh customer balance
        if (selectedCustomer) {
          await loadCustomerOutstandingBalance(selectedCustomer.id);
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

  const paymentMethodOptions = [
    { value: "cash", label: "Cash" },
    { value: "bank_transfer", label: "Bank Transfer" },
    { value: "cheque", label: "Cheque" },
    { value: "parchi", label: "Parchi" },
    { value: "jazzcash", label: "JazzCash" },
    { value: "easypaisa", label: "EasyPaisa" },
  ];

  // Helper function to get payment prefix preview
  const getPaymentPrefixPreview = (customer: Customer | null) => {
    if (!customer || !customer.company_name) return "PAY";

    const cleanName = customer.company_name
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase()
      .substring(0, 3);

    if (cleanName.length >= 3) {
      return `PAY-${cleanName}`;
    }

    return "PAY";
  };

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
          disabled={!selectedCustomer}
        >
          Receive Payment
        </Button>,
      ]}
      width={800}
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
                optionFilterProp="label"
                filterOption={(input, option) => {
                  const label = option?.label as string;
                  return (
                    label?.toLowerCase().includes(input.toLowerCase()) || false
                  );
                }}
                filterSort={(optionA, optionB) => {
                  const labelA = (optionA?.label as string) || "";
                  const labelB = (optionB?.label as string) || "";
                  return labelA.localeCompare(labelB);
                }}
                allowClear
                loading={customers.length === 0}
                value={selectedCustomer?.id}
                options={customers.map((customer) => ({
                  value: customer.id,
                  label: `${customer.company_name} (${customer.first_name} ${customer.last_name})`,
                }))}
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
                      Outstanding Balance:{" "}
                      <strong
                        style={{
                          color: outstandingBalance > 0 ? "#ff4d4f" : "#00b96b",
                        }}
                      >
                        PKR {outstandingBalance.toLocaleString()}
                      </strong>
                    </div>
                    {loadingBalance && (
                      <div style={{ fontSize: "12px", color: "#666" }}>
                        Loading balance...
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* Auto-generated Payment Number */}
            <Form.Item label="Payment Number">
              <Input
                value={generatedPaymentNumber}
                readOnly
                placeholder="Select customer to generate payment number"
                style={{
                  backgroundColor: "#f5f5f5",
                  fontWeight: "bold",
                  color: "#1890ff",
                }}
                suffix={generatingPaymentNumber ? "⏳" : "✓"}
              />
            </Form.Item>

            <Form.Item
              name="total_received"
              label="Payment Amount"
              rules={[
                {
                  required: true,
                  message: "Please enter payment amount",
                  type: "number",
                },
                {
                  validator: (_, value) => {
                    if (value === undefined || value === null || value === "") {
                      return Promise.reject(
                        new Error("Please enter payment amount"),
                      );
                    }
                    if (parseFloat(value) > outstandingBalance) {
                      return Promise.reject(
                        new Error(
                          `Payment amount cannot exceed outstanding balance of PKR ${outstandingBalance.toLocaleString()}`,
                        ),
                      );
                    }
                    return Promise.resolve();
                  },
                },
              ]}
            >
              <InputNumber
                style={{ width: "100%" }}
                placeholder="Enter payment amount"
                min={1}
                max={outstandingBalance}
                addonBefore="PKR"
                formatter={(value) =>
                  value ? `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : ""
                }
                parser={(value) => {
                  if (value === undefined || value === null || value === "")
                    return "";
                  const parsed = value.replace(/,/g, "");
                  return isNaN(parseFloat(parsed)) ? "" : parseFloat(parsed);
                }}
                onChange={(value) => {
                  // Force update form value
                  form.setFieldsValue({ total_received: value });
                }}
              />
              <div style={{ fontSize: "12px", color: "#666", marginTop: 4 }}>
                Maximum allowed: PKR {outstandingBalance.toLocaleString()}
              </div>
            </Form.Item>

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
                {paymentMethodOptions.map((option) => (
                  <Option key={option.value} value={option.value}>
                    {option.label}
                  </Option>
                ))}
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

        {selectedCustomer && outstandingBalance === 0 && (
          <Alert
            message="No Outstanding Balance"
            description="This customer has no outstanding balance. You can still record a payment if needed."
            type="info"
            showIcon
            style={{ marginTop: 16 }}
          />
        )}

        {selectedCustomer && outstandingBalance < 0 && (
          <Alert
            message="Credit Balance"
            description={`This customer has a credit balance of PKR ${Math.abs(
              outstandingBalance,
            ).toLocaleString()}. Recording a payment will increase their credit.`}
            type="warning"
            showIcon
            style={{ marginTop: 16 }}
          />
        )}
      </Form>
    </Modal>
  );
};

export default ReceivePaymentModal;
