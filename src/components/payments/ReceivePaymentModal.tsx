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
} from "antd";
import { customerService } from "../../services/customerService";
import { paymentService } from "../../services/paymentService";
import type { Customer, PaymentMethod, PaymentStatus } from "../../types";
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
  const [outstandingBalance, setOutstandingBalance] = useState(0);
  const [loadingBalance, setLoadingBalance] = useState(false);

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
        loadCustomerOutstandingBalance(foundCustomer.id);
      }
    }
  }, [visible, customers, customer, form]);

  const resetModal = () => {
    form.resetFields();
    setSelectedCustomer(null);
    setOutstandingBalance(0);
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
      // This returns balance that already includes opening balance
      const balance = await customerService.getCustomerOutstandingBalance(
        customerId
      );
      setOutstandingBalance(balance);
      console.log(`Outstanding balance for payment modal:`, balance);
    } catch (error) {
      console.error("Failed to load customer balance:", error);
      message.error("Failed to load customer balance");
    } finally {
      setLoadingBalance(false);
    }
  };

  const handleCustomerChange = async (customerId: string) => {
    console.log("Customer changed to ID:", customerId);

    if (!customerId) {
      setSelectedCustomer(null);
      setOutstandingBalance(0);
      return;
    }

    try {
      const customer = customers.find((c) => c.id === customerId);
      setSelectedCustomer(customer || null);

      if (customerId) {
        await loadCustomerOutstandingBalance(customerId);
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
    console.log("Form submission values:", values); // Debug log

    // Parse the amount as float to handle any string conversion issues
    const paymentAmount = parseFloat(values.total_received) || 0;

    console.log("Parsed payment amount:", paymentAmount); // Debug log

    if (paymentAmount <= 0) {
      message.error("Please enter a valid payment amount greater than 0");
      return;
    }

    if (!values.payment_number || !values.payment_number.trim()) {
      message.error("Please enter a payment number");
      return;
    }

    console.log("Form values:", values);

    setLoading(true);
    try {
      let paymentStatus: PaymentStatus = "completed";

      if (
        values.payment_method === "cheque" ||
        values.payment_method === "parchi"
      ) {
        paymentStatus = "pending";
      }

      // Check if payment number already exists
      const { payments: existingPayments } =
        await paymentService.getAllPayments();
      const isDuplicate = existingPayments.some(
        (p: any) => p.payment_number === values.payment_number.trim()
      );

      if (isDuplicate) {
        message.error(
          `Payment number "${values.payment_number}" already exists. Please use a different number.`
        );
        setLoading(false);
        return;
      }

      const paymentData = {
        customer_id: values.customer_id,
        payment_number: values.payment_number.trim(),
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
        message.success(
          `Payment of PKR ${paymentAmount.toLocaleString()} received successfully${
            paymentStatus === "pending" ? " (Pending Clearance)" : ""
          }`
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
                        new Error("Please enter payment amount")
                      );
                    }
                    if (parseFloat(value) > outstandingBalance) {
                      return Promise.reject(
                        new Error(
                          `Payment amount cannot exceed outstanding balance of PKR ${outstandingBalance.toLocaleString()}`
                        )
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
              outstandingBalance
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
