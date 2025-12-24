import React, { useEffect, useState } from "react";
import {
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  InputNumber,
  App,
  Space,
  Row,
  Col,
  Button,
} from "antd";
import { paymentService } from "../../services/paymentService";
import { customerService } from "../../services/customerService";
import type { Customer, Payment } from "../../types";
import dayjs from "dayjs";

const { TextArea } = Input;
const { Option } = Select;

interface EditPaymentModalProps {
  visible: boolean;
  payment: Payment | null;
  onClose: () => void;
  onSuccess: () => void;
}

const EditPaymentModal: React.FC<EditPaymentModalProps> = ({
  visible,
  payment,
  onClose,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);

  // Load customers
  useEffect(() => {
    const loadCustomers = async () => {
      try {
        const { customers: customersData } =
          await customerService.getAllCustomers();
        setCustomers(customersData);
      } catch (error) {
        console.error("Error loading customers:", error);
      }
    };
    loadCustomers();
  }, []);

  // Set form values when payment changes
  useEffect(() => {
    if (payment && visible) {
      form.setFieldsValue({
        customer_id: payment.customer_id,
        payment_date: dayjs(payment.payment_date),
        payment_method: payment.payment_method,
        total_received: payment.total_received,
        reference_number: payment.reference_number || "",
        bank_name: payment.bank_name || "",
        cheque_date: payment.cheque_date ? dayjs(payment.cheque_date) : null,
        notes: payment.notes || "",
      });
    }
  }, [payment, visible, form]);

  const handleSubmit = async (values: any) => {
    if (!payment) return;

    try {
      setLoading(true);

      const paymentData = {
        customer_id: values.customer_id,
        payment_date: values.payment_date.format("YYYY-MM-DD"),
        payment_method: values.payment_method,
        total_received: values.total_received,
        reference_number: values.reference_number || null,
        bank_name: values.bank_name || null,
        cheque_date: values.cheque_date
          ? values.cheque_date.format("YYYY-MM-DD")
          : null,
        notes: values.notes || null,
      };

      await paymentService.updatePayment(payment.id, paymentData);

      message.success("Payment updated successfully");
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Error updating payment:", error);
      message.error(error.message || "Failed to update payment");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    onClose();
  };

  const isPaymentMethodWithChequeDate = (method: string) => {
    return ["cheque", "parchi"].includes(method);
  };

  return (
    <Modal
      title="Edit Payment"
      open={visible}
      onCancel={handleCancel}
      width={600}
      footer={[
        <Button key="cancel" onClick={handleCancel}>
          Cancel
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={loading}
          onClick={() => form.submit()}
        >
          Update Payment
        </Button>,
      ]}
      centered
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          payment_method: "cash",
          status: "pending",
        }}
      >
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label="Customer"
              name="customer_id"
              rules={[{ required: true, message: "Please select a customer" }]}
            >
              <Select
                placeholder="Select customer"
                showSearch
                filterOption={(input, option) =>
                  (option?.label?.toString().toLowerCase() ?? "").includes(
                    input.toLowerCase()
                  )
                }
                options={customers.map((customer) => ({
                  value: customer.id,
                  label: customer.company_name,
                }))}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="Payment Date"
              name="payment_date"
              rules={[
                { required: true, message: "Please select payment date" },
              ]}
            >
              <DatePicker
                format="DD/MM/YYYY"
                style={{ width: "100%" }}
                placeholder="Select date"
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label="Payment Method"
              name="payment_method"
              rules={[
                { required: true, message: "Please select payment method" },
              ]}
            >
              <Select placeholder="Select method">
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
              label="Amount (PKR)"
              name="total_received"
              rules={[
                { required: true, message: "Please enter amount" },
                { type: "number", min: 1, message: "Amount must be positive" },
              ]}
            >
              <InputNumber
                placeholder="Enter amount"
                min={1}
                style={{ width: "100%" }}
                formatter={(value) =>
                  `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
                }
                parser={(value) => value!.replace(/\$\s?|(,*)/g, "")}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="Reference Number" name="reference_number">
              <Input placeholder="Optional reference number" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="Bank Name" name="bank_name">
              <Input placeholder="Optional bank name" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          noStyle
          shouldUpdate={(prevValues, currentValues) =>
            prevValues.payment_method !== currentValues.payment_method
          }
        >
          {({ getFieldValue }) =>
            isPaymentMethodWithChequeDate(getFieldValue("payment_method")) ? (
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    label="Cheque/Parchi Date"
                    name="cheque_date"
                    rules={[
                      {
                        required: true,
                        message: "Please select cheque/parchi date",
                      },
                    ]}
                  >
                    <DatePicker
                      format="DD/MM/YYYY"
                      style={{ width: "100%" }}
                      placeholder="Select date"
                    />
                  </Form.Item>
                </Col>
              </Row>
            ) : null
          }
        </Form.Item>

        <Form.Item label="Notes" name="notes">
          <TextArea placeholder="Add any notes or remarks" rows={3} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default EditPaymentModal;
