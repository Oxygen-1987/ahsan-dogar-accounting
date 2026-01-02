import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Card,
  Form,
  Input,
  Button,
  DatePicker,
  InputNumber,
  message,
  App,
  Space,
} from "antd";
import { invoiceService } from "../services/invoiceService";
import { customerService } from "../services/customerService";
import type { InvoiceFormData, Customer } from "../types";
import dayjs from "dayjs";

const { TextArea } = Input;

const EditInvoice: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message: messageApi } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [invoice, setInvoice] = useState<any>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);

  useEffect(() => {
    loadInvoice();
    loadCustomers();
  }, [id]);

  const loadInvoice = async () => {
    if (!id) return;

    setLoading(true);
    try {
      const invoiceData = await invoiceService.getInvoiceById(id);
      if (invoiceData) {
        setInvoice(invoiceData);

        // Set form values
        form.setFieldsValue({
          customer_id: invoiceData.customer_id,
          invoice_number: invoiceData.invoice_number,
          issue_date: dayjs(invoiceData.issue_date),
          due_date: dayjs(invoiceData.due_date),
          notes: invoiceData.notes,
          payment_terms: invoiceData.payment_terms,
          line_items:
            invoiceData.items?.map((item) => ({
              description: item.description,
              quantity: item.quantity,
              inches: item.inches,
              rate: item.rate,
              amount: item.amount,
            })) || [],
        });
      }
    } catch (error) {
      messageApi.error("Failed to load invoice");
      console.error("Error loading invoice:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadCustomers = async () => {
    try {
      const customersData = await customerService.getAllCustomers();
      setCustomers(customersData);
    } catch (error) {
      console.error("Error loading customers:", error);
    }
  };

  const handleSubmit = async (values: any) => {
    if (!id) return;

    setSaving(true);
    try {
      const formData: InvoiceFormData = {
        customer_id: values.customer_id,
        invoice_number: values.invoice_number,
        issue_date: values.issue_date.format("YYYY-MM-DD"),
        due_date: values.due_date.format("YYYY-MM-DD"),
        line_items: values.line_items || [],
        notes: values.notes,
        payment_terms: values.payment_terms,
      };

      await invoiceService.updateInvoice(id, formData);
      messageApi.success("Invoice updated successfully");
      navigate("/invoices");
    } catch (error) {
      messageApi.error("Failed to update invoice");
      console.error("Error updating invoice:", error);
    } finally {
      setSaving(false);
    }
  };

  const calculateLineItemTotal = (index: number) => {
    const lineItems = form.getFieldValue("line_items") || [];
    const item = lineItems[index];
    if (item && item.inches && item.rate) {
      const total = item.inches * item.rate;
      form.setFieldsValue({
        line_items: lineItems.map((lineItem: any, i: number) =>
          i === index ? { ...lineItem, amount: total } : lineItem
        ),
      });
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!invoice) {
    return <div>Invoice not found</div>;
  }

  return (
    <div>
      <h1 style={{ marginBottom: 24 }}>
        Edit Invoice: {invoice.invoice_number}
      </h1>

      <Card>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            line_items: [{}],
          }}
        >
          {/* Customer Selection */}
          <Form.Item
            name="customer_id"
            label="Customer"
            rules={[{ required: true, message: "Please select a customer" }]}
          >
            <Select placeholder="Select customer">
              {customers.map((customer) => (
                <Select.Option key={customer.id} value={customer.id}>
                  {customer.company_name} ({customer.first_name}{" "}
                  {customer.last_name})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          {/* Invoice Number */}
          <Form.Item name="invoice_number" label="Invoice Number">
            <Input placeholder="Auto-generated if left empty" />
          </Form.Item>

          {/* Dates */}
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="issue_date"
                label="Issue Date"
                rules={[
                  { required: true, message: "Please select issue date" },
                ]}
              >
                <DatePicker style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="due_date"
                label="Due Date"
                rules={[{ required: true, message: "Please select due date" }]}
              >
                <DatePicker style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>

          {/* Line Items */}
          <Form.List name="line_items">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <Space
                    key={key}
                    style={{ display: "flex", marginBottom: 8 }}
                    align="baseline"
                  >
                    <Form.Item
                      {...restField}
                      name={[name, "description"]}
                      rules={[
                        { required: true, message: "Missing description" },
                      ]}
                    >
                      <Input placeholder="Description" />
                    </Form.Item>
                    <Form.Item
                      {...restField}
                      name={[name, "inches"]}
                      rules={[{ required: true, message: "Missing inches" }]}
                    >
                      <InputNumber
                        placeholder="Inches"
                        onChange={() => calculateLineItemTotal(name)}
                      />
                    </Form.Item>
                    <Form.Item
                      {...restField}
                      name={[name, "rate"]}
                      rules={[{ required: true, message: "Missing rate" }]}
                    >
                      <InputNumber
                        placeholder="Rate"
                        onChange={() => calculateLineItemTotal(name)}
                      />
                    </Form.Item>
                    <Form.Item {...restField} name={[name, "amount"]}>
                      <InputNumber placeholder="Amount" disabled />
                    </Form.Item>
                    <Button onClick={() => remove(name)} danger>
                      Remove
                    </Button>
                  </Space>
                ))}
                <Form.Item>
                  <Button type="dashed" onClick={() => add()} block>
                    Add Line Item
                  </Button>
                </Form.Item>
              </>
            )}
          </Form.List>

          {/* Notes */}
          <Form.Item name="notes" label="Notes">
            <TextArea rows={4} placeholder="Additional notes..." />
          </Form.Item>

          {/* Payment Terms */}
          <Form.Item name="payment_terms" label="Payment Terms">
            <TextArea rows={2} placeholder="Payment terms..." />
          </Form.Item>

          {/* Form Actions */}
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={saving}>
                Update Invoice
              </Button>
              <Button onClick={() => navigate("/invoices")}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default EditInvoice;
