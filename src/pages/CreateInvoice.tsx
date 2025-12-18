// src/pages/CreateInvoice.tsx - UPDATED WITH PROFESSIONAL PRINT OPTIONS
import React, { useState, useEffect } from "react";
import {
  Card,
  Button,
  Form,
  Input,
  Select,
  DatePicker,
  InputNumber,
  Space,
  Row,
  Col,
  Table,
  Typography,
  Divider,
  message,
  App,
  Dropdown,
  Modal,
  type MenuProps,
} from "antd";
import {
  CloseOutlined,
  PlusOutlined,
  DeleteOutlined,
  PrinterOutlined,
  DownloadOutlined,
  SaveOutlined,
  DownOutlined,
  EyeOutlined,
  FilePdfOutlined,
  FileImageOutlined,
} from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";
import type { ColumnsType } from "antd/es/table";
import type {
  Customer,
  InvoiceLineItem,
  InvoiceTerm,
  Invoice,
  InvoiceFormData,
} from "../types";
import { customerService } from "../services/customerService";
import { invoiceService } from "../services/invoiceService";
import { professionalInvoiceService } from "../services/professionalInvoiceService";
import { supabase } from "../services/supabaseClient";
import dayjs from "dayjs";
import "./CreateInvoice.css";

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

const CreateInvoice: React.FC = () => {
  const { message: messageApi, modal } = App.useApp();
  const navigate = useNavigate();
  const { id } = useParams(); // Get invoice ID from URL for edit mode
  const [form] = Form.useForm();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([
    {
      id: "1",
      description: "",
      quantity: 1,
      inches: 0,
      rate: 0,
      amount: 0,
    },
  ]);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [isEditMode, setIsEditMode] = useState(false);
  const [currentInvoice, setCurrentInvoice] = useState<Invoice | null>(null);

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

  // Load invoice data if in edit mode
  useEffect(() => {
    if (id) {
      setIsEditMode(true);
      loadInvoiceData(id);
    }
  }, [id]);

  // Load invoice data for editing
  const loadInvoiceData = async (invoiceId: string) => {
    setLoading(true);
    try {
      const invoice = await invoiceService.getInvoiceById(invoiceId);

      if (invoice) {
        setCurrentInvoice(invoice);
        setInvoiceNumber(invoice.invoice_number);

        // Set form values
        form.setFieldsValue({
          invoice_number: invoice.invoice_number,
          customer_id: invoice.customer_id,
          issue_date: dayjs(invoice.issue_date),
          due_date: dayjs(invoice.due_date),
          term: "net_15",
          notes: invoice.notes,
          payment_terms: invoice.payment_terms,
        });

        // Set line items
        if (invoice.items && invoice.items.length > 0) {
          setLineItems(
            invoice.items.map((item) => ({
              id: item.id || `item-${Date.now()}-${Math.random()}`,
              description: item.description || "",
              quantity: item.quantity || 1,
              inches: item.inches || 0,
              rate: item.rate || 0,
              amount: item.amount || 0,
            }))
          );
        }

        // Set customer
        if (invoice.customer) {
          setSelectedCustomer(invoice.customer);
        }

        console.log("Loaded invoice data:", invoice);
      } else {
        messageApi.error("Invoice not found");
        navigate("/invoices");
      }
    } catch (error) {
      console.error("Error loading invoice data:", error);
      messageApi.error("Failed to load invoice data");
    } finally {
      setLoading(false);
    }
  };

  // Predict next invoice number
  const predictNextInvoiceNumber = async (): Promise<string> => {
    try {
      console.log("Predicting next invoice number...");
      const currentYear = new Date().getFullYear();

      // Get invoices directly from Supabase
      const { data: invoices, error } = await supabase
        .from("invoices")
        .select("invoice_number")
        .ilike("invoice_number", `INV-${currentYear}-%`)
        .order("invoice_number", { ascending: false });

      if (error) {
        console.error("Error fetching invoices:", error);
        return `INV-${currentYear}-001`;
      }

      console.log(`Found ${invoices?.length || 0} invoices for ${currentYear}`);

      if (!invoices || invoices.length === 0) {
        console.log("No invoices found, starting from 001");
        return `INV-${currentYear}-001`;
      }

      // Extract and find max sequence number
      let maxSequence = 0;
      invoices.forEach((inv) => {
        const match = inv.invoice_number.match(/INV-\d+-(\d+)/);
        if (match) {
          const seqNum = parseInt(match[1]);
          if (!isNaN(seqNum) && seqNum > maxSequence) {
            maxSequence = seqNum;
          }
        }
      });

      const nextSequence = maxSequence + 1;
      const nextNumber = `INV-${currentYear}-${nextSequence
        .toString()
        .padStart(3, "0")}`;

      console.log("Predicted next number:", {
        maxSequence,
        nextSequence,
        nextNumber,
      });

      return nextNumber;
    } catch (error) {
      console.error("Error predicting next invoice number:", error);
      return `INV-${new Date().getFullYear()}-001`;
    }
  };

  // Set predicted invoice number for new invoices
  useEffect(() => {
    if (!id && !isEditMode) {
      // For new invoices, predict the next number
      console.log("Loading new invoice form, predicting next number...");
      predictNextInvoiceNumber().then((predictedNumber) => {
        console.log("Setting predicted invoice number:", predictedNumber);
        setInvoiceNumber(predictedNumber);
        form.setFieldValue("invoice_number", predictedNumber);
      });
    }
  }, [id, isEditMode]);

  // Calculate due date based on term
  const calculateDueDate = (issueDate: string, term: InvoiceTerm): string => {
    const issue = dayjs(issueDate);
    switch (term) {
      case "due_on_receipt":
        return issue.format("YYYY-MM-DD");
      case "net_15":
        return issue.add(15, "day").format("YYYY-MM-DD");
      case "net_30":
        return issue.add(30, "day").format("YYYY-MM-DD");
      case "net_60":
        return issue.add(60, "day").format("YYYY-MM-DD");
      default:
        return issue.add(15, "day").format("YYYY-MM-DD");
    }
  };

  // Handle term change
  const handleTermChange = (term: InvoiceTerm) => {
    const issueDate = form.getFieldValue("issue_date");
    if (issueDate) {
      const dueDate = calculateDueDate(issueDate.format("YYYY-MM-DD"), term);
      form.setFieldValue("due_date", dayjs(dueDate));
    }
  };

  // Handle issue date change
  const handleIssueDateChange = (date: any) => {
    const term = form.getFieldValue("term") || "net_15";
    if (date) {
      const dueDate = calculateDueDate(date.format("YYYY-MM-DD"), term);
      form.setFieldValue("due_date", dayjs(dueDate));
    }
  };

  // Handle customer selection
  const handleCustomerChange = (customerId: string) => {
    const customer = customers.find((c) => c.id === customerId) || null;
    setSelectedCustomer(customer);
  };

  // Line item calculations
  const updateLineItem = (
    id: string,
    field: keyof InvoiceLineItem,
    value: number | string
  ) => {
    setLineItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const updatedItem = { ...item, [field]: value };

          // Auto-calculate amounts
          if (field === "inches" || field === "rate") {
            updatedItem.amount = updatedItem.inches * updatedItem.rate;
          } else if (field === "amount" && updatedItem.inches > 0) {
            updatedItem.rate = updatedItem.amount / updatedItem.inches;
          }

          return updatedItem;
        }
        return item;
      })
    );
  };

  // Add new line item
  const addLineItem = () => {
    const newItem: InvoiceLineItem = {
      id: Date.now().toString(),
      description: "",
      quantity: 1,
      inches: 0,
      rate: 0,
      amount: 0,
    };
    setLineItems((prev) => [...prev, newItem]);
  };

  // Remove line item
  const removeLineItem = (id: string) => {
    if (lineItems.length > 1) {
      setLineItems((prev) => prev.filter((item) => item.id !== id));
    } else {
      messageApi.warning("At least one line item is required");
    }
  };

  // Calculate totals
  const calculateTotals = () => {
    const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
    const total = subtotal; // You can add tax here if needed
    return { subtotal, total };
  };

  const { subtotal, total } = calculateTotals();

  // Handle save
  const handleSave = async (
    action: "save" | "save_and_new" | "save_and_close"
  ) => {
    try {
      setLoading(true);
      const values = await form.validateFields();

      console.log("Form values:", values);

      // Prepare invoice data
      const invoiceData: InvoiceFormData = {
        customer_id: values.customer_id,
        issue_date: values.issue_date.format("YYYY-MM-DD"),
        due_date: values.due_date.format("YYYY-MM-DD"),
        term: values.term,
        line_items: lineItems,
        notes: values.notes,
        payment_terms: values.payment_terms,
      };

      let result: Invoice;

      if (isEditMode && currentInvoice) {
        // For editing, include the invoice number
        invoiceData.invoice_number = currentInvoice.invoice_number;
        result = await invoiceService.updateInvoice(
          currentInvoice.id,
          invoiceData
        );
        messageApi.success("Invoice updated successfully");
      } else {
        // For new invoices, DO NOT include invoice_number
        result = await invoiceService.createInvoice(invoiceData);

        // Update with the generated number
        setInvoiceNumber(result.invoice_number);
        setCurrentInvoice(result);
        console.log("Generated invoice number:", result.invoice_number);

        messageApi.success(
          `Invoice ${result.invoice_number} created successfully`
        );
      }

      if (action === "save_and_new") {
        // Reset for new invoice
        form.resetFields();
        setLineItems([
          {
            id: "1",
            description: "",
            quantity: 1,
            inches: 0,
            rate: 0,
            amount: 0,
          },
        ]);
        setSelectedCustomer(null);
        setCurrentInvoice(null);

        // Predict next invoice number
        const nextNumber = await predictNextInvoiceNumber();
        setInvoiceNumber(nextNumber);
        form.setFieldsValue({
          invoice_number: nextNumber,
          issue_date: dayjs(),
          term: "net_15",
          due_date: dayjs().add(15, "day"),
        });

        console.log(
          "Reset form for new invoice, next predicted number:",
          nextNumber
        );
      } else if (action === "save_and_close") {
        navigate("/invoices");
      }
    } catch (error: any) {
      console.error("Error saving invoice:", error);
      messageApi.error(
        `Failed to ${isEditMode ? "update" : "create"} invoice: ${
          error.message
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  // Handle professional invoice export
  const handleExportInvoice = async (
    format: "pdf" | "jpg",
    includeLetterhead: boolean = true
  ) => {
    if (!currentInvoice) {
      messageApi.warning("Please save the invoice first");
      return;
    }

    try {
      setExporting(true);

      await professionalInvoiceService.downloadInvoice(
        currentInvoice,
        format,
        includeLetterhead
      );

      messageApi.success(
        `${format.toUpperCase()} downloaded ${
          includeLetterhead ? "with letterhead" : "without letterhead"
        }`
      );
    } catch (error) {
      console.error("Error exporting invoice:", error);
      messageApi.error("Failed to export invoice");
    } finally {
      setExporting(false);
    }
  };

  // Show export options modal
  const showExportOptions = () => {
    if (!currentInvoice) {
      messageApi.warning("Please save the invoice first");
      return;
    }

    const modalInstance = modal.confirm({
      title: "Export Invoice",
      icon: <FilePdfOutlined />,
      content: (
        <div style={{ padding: "16px 0" }}>
          <Space direction="vertical" style={{ width: "100%" }}>
            <Button
              type="primary"
              block
              size="large"
              icon={<FilePdfOutlined />}
              onClick={async () => {
                modalInstance.destroy();
                await handleExportInvoice("pdf", true);
              }}
              style={{ textAlign: "left", height: "48px" }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <FilePdfOutlined />
                <div>
                  <div style={{ fontWeight: "bold" }}>PDF with Letterhead</div>
                  <div style={{ fontSize: "12px", color: "#666" }}>
                    Professional invoice with your company letterhead
                  </div>
                </div>
              </div>
            </Button>

            <Button
              block
              size="large"
              icon={<FilePdfOutlined />}
              onClick={async () => {
                modalInstance.destroy();
                await handleExportInvoice("pdf", false);
              }}
              style={{ textAlign: "left", height: "48px" }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <FilePdfOutlined />
                <div>
                  <div style={{ fontWeight: "bold" }}>
                    PDF without Letterhead
                  </div>
                  <div style={{ fontSize: "12px", color: "#666" }}>
                    Simple invoice format
                  </div>
                </div>
              </div>
            </Button>

            <Button
              block
              size="large"
              icon={<FileImageOutlined />}
              onClick={async () => {
                modalInstance.destroy();
                await handleExportInvoice("jpg", true);
              }}
              style={{ textAlign: "left", height: "48px" }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <FileImageOutlined />
                <div>
                  <div style={{ fontWeight: "bold" }}>JPG Image</div>
                  <div style={{ fontSize: "12px", color: "#666" }}>
                    High-quality image format
                  </div>
                </div>
              </div>
            </Button>

            <Button
              block
              size="large"
              icon={<EyeOutlined />}
              onClick={async () => {
                modalInstance.destroy();
                try {
                  await professionalInvoiceService.previewProfessionalInvoice(
                    currentInvoice,
                    true
                  );
                } catch (error) {
                  messageApi.error("Failed to preview invoice");
                }
              }}
              style={{ textAlign: "left", height: "48px" }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <EyeOutlined />
                <div>
                  <div style={{ fontWeight: "bold" }}>Preview in Browser</div>
                  <div style={{ fontSize: "12px", color: "#666" }}>
                    Open invoice in new window
                  </div>
                </div>
              </div>
            </Button>
          </Space>
        </div>
      ),
      okButtonProps: { style: { display: "none" } },
      cancelButtonProps: { style: { display: "none" } },
      centered: true,
      width: 450,
    });
  };

  // Save dropdown menu
  const saveMenu: MenuProps = {
    items: [
      {
        key: "save",
        label: "Save",
        icon: <SaveOutlined />,
        onClick: () => handleSave("save"),
      },
      {
        key: "save_and_new",
        label: "Save & New",
        icon: <PlusOutlined />,
        onClick: () => handleSave("save_and_new"),
      },
      {
        key: "save_and_close",
        label: "Save & Close",
        icon: <CloseOutlined />,
        onClick: () => handleSave("save_and_close"),
      },
    ],
  };

  // Export dropdown menu
  const exportMenu: MenuProps = {
    items: [
      {
        key: "export_pdf_letterhead",
        label: "PDF with Letterhead",
        icon: <FilePdfOutlined />,
        onClick: () => handleExportInvoice("pdf", true),
      },
      {
        key: "export_pdf_simple",
        label: "PDF without Letterhead",
        icon: <FilePdfOutlined />,
        onClick: () => handleExportInvoice("pdf", false),
      },
      {
        key: "export_jpg",
        label: "JPG Image",
        icon: <FileImageOutlined />,
        onClick: () => handleExportInvoice("jpg", true),
      },
      {
        key: "preview",
        label: "Preview in Browser",
        icon: <EyeOutlined />,
        onClick: async () => {
          if (currentInvoice) {
            try {
              await professionalInvoiceService.previewProfessionalInvoice(
                currentInvoice,
                true
              );
            } catch (error) {
              messageApi.error("Failed to preview invoice");
            }
          } else {
            messageApi.warning("Please save the invoice first");
          }
        },
      },
    ],
  };

  // Line items table columns
  const lineItemsColumns: ColumnsType<InvoiceLineItem> = [
    {
      title: "Product Description",
      dataIndex: "description",
      key: "description",
      render: (_, record) => (
        <Input
          placeholder="Enter product description"
          value={record.description}
          onChange={(e) =>
            updateLineItem(record.id, "description", e.target.value)
          }
        />
      ),
    },
    {
      title: "Qty",
      dataIndex: "quantity",
      key: "quantity",
      width: 100,
      render: (_, record) => (
        <InputNumber
          min={1}
          value={record.quantity}
          onChange={(value) =>
            updateLineItem(record.id, "quantity", value || 1)
          }
          style={{ width: "100%" }}
        />
      ),
    },
    {
      title: "Length (Inches)",
      dataIndex: "inches",
      key: "inches",
      width: 120,
      render: (_, record) => (
        <InputNumber
          min={0}
          step={0.01}
          value={record.inches}
          onChange={(value) => updateLineItem(record.id, "inches", value || 0)}
          style={{ width: "100%" }}
        />
      ),
    },
    {
      title: "Rate (PKR/inch)",
      dataIndex: "rate",
      key: "rate",
      width: 120,
      render: (_, record) => (
        <InputNumber
          min={0}
          step={0.01}
          value={record.rate}
          onChange={(value) => updateLineItem(record.id, "rate", value || 0)}
          style={{ width: "100%" }}
          formatter={(value) =>
            `PKR ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
          }
          parser={(value) => value?.replace(/PKR\s?|(,*)/g, "") as any}
        />
      ),
    },
    {
      title: "Amount",
      dataIndex: "amount",
      key: "amount",
      width: 120,
      render: (amount) => `PKR ${amount.toLocaleString()}`,
    },
    {
      title: "",
      key: "action",
      width: 60,
      render: (_, record) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => removeLineItem(record.id)}
          disabled={lineItems.length === 1}
        />
      ),
    },
  ];

  return (
    <div className="create-invoice-page">
      {/* Header */}
      <Card
        styles={{
          body: { padding: "16px 24px" },
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Title level={3} style={{ margin: 0 }}>
              {isEditMode ? "Edit Invoice" : "Create Invoice"}
            </Title>
            <Text type="secondary" style={{ fontSize: "16px" }}>
              {invoiceNumber || "New Invoice"}
            </Text>
          </div>
          <Button
            type="text"
            icon={<CloseOutlined />}
            onClick={() => navigate("/invoices")}
          />
        </div>
      </Card>

      <div style={{ padding: "24px" }}>
        {/* Company Info and Balance Section */}
        <Row gutter={24} style={{ marginBottom: 24 }}>
          <Col span={12}>
            <div style={{ textAlign: "left" }}>
              <Text
                strong
                style={{ fontSize: "20px", display: "block", marginBottom: 8 }}
              >
                INVOICE
              </Text>
              <div>
                <Text strong style={{ display: "block" }}>
                  Ahsan Dogar Rubber Works
                </Text>
                <Text type="secondary" style={{ display: "block" }}>
                  123 Industrial Area
                </Text>
                <Text type="secondary" style={{ display: "block" }}>
                  Lahore, Punjab, Pakistan
                </Text>
                <Text type="secondary" style={{ display: "block" }}>
                  Phone: +92421234567
                </Text>
                <Text type="secondary" style={{ display: "block" }}>
                  Email: info@dogarrubber.com
                </Text>
              </div>
            </div>
          </Col>
          <Col span={12}>
            <div style={{ textAlign: "right" }}>
              <Card
                size="small"
                style={{ display: "inline-block", minWidth: 200 }}
              >
                <div style={{ textAlign: "center" }}>
                  <Text type="secondary" style={{ display: "block" }}>
                    Invoice Total
                  </Text>
                  <Title
                    level={2}
                    style={{ margin: "8px 0", color: "#1890ff" }}
                  >
                    PKR {total.toLocaleString()}
                  </Title>
                  <Text type="secondary">
                    Due:{" "}
                    {form.getFieldValue("due_date")
                      ? dayjs(form.getFieldValue("due_date")).format(
                          "DD/MM/YYYY"
                        )
                      : "N/A"}
                  </Text>
                </div>
              </Card>
            </div>
          </Col>
        </Row>

        <Form
          form={form}
          layout="vertical"
          initialValues={{
            issue_date: dayjs(),
            term: "net_15",
            due_date: dayjs().add(15, "day"),
          }}
        >
          {/* Customer and Invoice Details Section */}
          <Row gutter={24} style={{ marginBottom: 24 }}>
            <Col span={8}>
              <Form.Item
                label="Customer"
                name="customer_id"
                rules={[
                  { required: true, message: "Please select a customer" },
                ]}
              >
                <Select
                  placeholder="Select customer"
                  onChange={handleCustomerChange}
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

              {selectedCustomer && (
                <Card size="small" style={{ marginTop: 8 }}>
                  <div>
                    <Text strong style={{ display: "block" }}>
                      {selectedCustomer.company_name}
                    </Text>
                    <Text type="secondary" style={{ display: "block" }}>
                      {selectedCustomer.address}
                    </Text>
                    <Text type="secondary" style={{ display: "block" }}>
                      {selectedCustomer.mobile}
                    </Text>
                    <Text type="secondary" style={{ display: "block" }}>
                      {selectedCustomer.email}
                    </Text>
                  </div>
                </Card>
              )}
            </Col>

            <Col span={8}>{/* Empty column for spacing */}</Col>

            <Col span={8}>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    label="Invoice Number"
                    name="invoice_number"
                    rules={[
                      { required: true, message: "Invoice number is required" },
                      {
                        pattern: /^INV-\d{4}-\d{3}$/,
                        message:
                          "Invoice number must be in format INV-YYYY-NNN (e.g., INV-2025-001)",
                      },
                    ]}
                  >
                    <Input
                      value={invoiceNumber}
                      onChange={(e) => {
                        setInvoiceNumber(e.target.value);
                        form.setFieldValue("invoice_number", e.target.value);
                      }}
                      placeholder="Enter invoice number (e.g., INV-2025-001)"
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    label="Invoice Date"
                    name="issue_date"
                    rules={[
                      { required: true, message: "Please select invoice date" },
                    ]}
                  >
                    <DatePicker
                      format="DD/MM/YYYY"
                      style={{ width: "100%" }}
                      onChange={handleIssueDateChange}
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    label="Term"
                    name="term"
                    rules={[{ required: true, message: "Please select term" }]}
                  >
                    <Select onChange={handleTermChange}>
                      <Option value="due_on_receipt">Due upon receipt</Option>
                      <Option value="net_15">Net 15</Option>
                      <Option value="net_30">Net 30</Option>
                      <Option value="net_60">Net 60</Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Due Date" name="due_date">
                    <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
                  </Form.Item>
                </Col>
              </Row>
            </Col>
          </Row>

          <Divider />

          {/* Line Items Section */}
          <div style={{ marginBottom: 24 }}>
            <Table
              columns={lineItemsColumns}
              dataSource={lineItems}
              rowKey="id"
              pagination={false}
              size="small"
              className="line-items-table"
              footer={() => (
                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  onClick={addLineItem}
                  block
                >
                  Add Line Item
                </Button>
              )}
            />
          </div>

          <Divider />

          {/* Total and Notes Section */}
          <Row gutter={24}>
            <Col span={12}>
              <Space direction="vertical" style={{ width: "100%" }}>
                <Form.Item label="Payment Terms" name="payment_terms">
                  <TextArea placeholder="Enter payment terms" rows={3} />
                </Form.Item>
                <Form.Item label="Notes" name="notes">
                  <TextArea placeholder="Enter any notes" rows={3} />
                </Form.Item>
              </Space>
            </Col>

            <Col span={12}>
              <div style={{ textAlign: "right" }}>
                <Card
                  size="small"
                  style={{ display: "inline-block", minWidth: 300 }}
                >
                  <div style={{ textAlign: "left" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: 8,
                      }}
                    >
                      <Text>Subtotal:</Text>
                      <Text>PKR {subtotal.toLocaleString()}</Text>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: 8,
                      }}
                    >
                      <Text>Tax (0%):</Text>
                      <Text>PKR 0</Text>
                    </div>
                    <Divider style={{ margin: "12px 0" }} />
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontWeight: "bold",
                      }}
                    >
                      <Text>Total:</Text>
                      <Text style={{ fontSize: "16px", color: "#1890ff" }}>
                        PKR {total.toLocaleString()}
                      </Text>
                    </div>
                  </div>
                </Card>
              </div>
            </Col>
          </Row>
        </Form>

        {/* Footer Actions */}
        <Divider />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Space>
            <Dropdown menu={exportMenu} trigger={["click"]}>
              <Button icon={<PrinterOutlined />} loading={exporting}>
                Export <DownOutlined />
              </Button>
            </Dropdown>
            <Button
              icon={<DownloadOutlined />}
              onClick={showExportOptions}
              loading={exporting}
            >
              Download
            </Button>
          </Space>

          <Space>
            <Dropdown menu={saveMenu} trigger={["click"]}>
              <Button type="primary" icon={<SaveOutlined />} loading={loading}>
                Save <DownOutlined />
              </Button>
            </Dropdown>
          </Space>
        </div>
      </div>
    </div>
  );
};

export default CreateInvoice;
