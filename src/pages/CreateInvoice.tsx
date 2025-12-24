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
  Tag,
  Popconfirm,
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
  EditOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";
import type { ColumnsType } from "antd/es/table";
import type {
  Customer,
  InvoiceLineItem,
  Invoice,
  InvoiceFormData,
} from "../types";
import { customerService } from "../services/customerService";
import { invoiceService } from "../services/invoiceService";
import { productService } from "../services/productService";
import { professionalInvoiceService } from "../services/professionalInvoiceService";
import { supabase } from "../services/supabaseClient";
import dayjs from "dayjs";
import "./CreateInvoice.css";

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

interface Product {
  id: string;
  name: string;
  description?: string;
  default_rate?: number;
  is_predefined?: boolean;
  is_editable?: boolean;
  status: "active" | "inactive";
}

const CreateInvoice: React.FC = () => {
  const { message: messageApi, modal } = App.useApp();
  const navigate = useNavigate();
  const { id } = useParams();
  const [form] = Form.useForm();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
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
  const [showProductManagementModal, setShowProductManagementModal] =
    useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm] = Form.useForm();
  const [productManagementModal, setProductManagementModal] =
    useState<ReturnType<typeof modal.confirm> | null>(null);

  // Load customers and products
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load customers
        const { customers: customersData } =
          await customerService.getAllCustomers();
        setCustomers(customersData);

        // Load products
        await loadProducts();
      } catch (error) {
        console.error("Error loading data:", error);
      }
    };
    loadData();
  }, []);

  // Load products
  const loadProducts = async () => {
    try {
      const productsData = await productService.getActiveProducts();
      setProducts(productsData as Product[]);
    } catch (error) {
      console.error("Error loading products:", error);
    }
  };

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
          notes: invoice.notes,
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
      const currentYear = new Date().getFullYear();
      const { data: invoices } = await supabase
        .from("invoices")
        .select("invoice_number")
        .ilike("invoice_number", `INV-${currentYear}-%`)
        .order("invoice_number", { ascending: false });

      if (!invoices || invoices.length === 0) {
        return `INV-${currentYear}-001`;
      }

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
      return `INV-${currentYear}-${nextSequence.toString().padStart(3, "0")}`;
    } catch (error) {
      console.error("Error predicting next invoice number:", error);
      return `INV-${new Date().getFullYear()}-001`;
    }
  };

  // Set predicted invoice number for new invoices
  useEffect(() => {
    if (!id && !isEditMode) {
      predictNextInvoiceNumber().then((predictedNumber) => {
        setInvoiceNumber(predictedNumber);
        form.setFieldValue("invoice_number", predictedNumber);
      });
    }
  }, [id, isEditMode]);

  // Handle customer selection
  const handleCustomerChange = (customerId: string) => {
    const customer = customers.find((c) => c.id === customerId) || null;
    setSelectedCustomer(customer);
  };

  // Handle product selection
  const handleProductSelect = (productId: string, itemId: string) => {
    const selectedProduct = products.find((p) => p.id === productId);
    if (selectedProduct) {
      updateLineItem(itemId, "description", selectedProduct.name);
      if (selectedProduct.default_rate) {
        updateLineItem(itemId, "rate", selectedProduct.default_rate);
      }
    }
  };

  // Update line item with auto-calculation
  const updateLineItem = (
    id: string,
    field: keyof InvoiceLineItem,
    value: number | string
  ) => {
    setLineItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const updatedItem = { ...item, [field]: value };

          // Auto-calculate based on which field changed
          if (field === "inches" || field === "rate") {
            // If inches or rate changes, recalculate amount for single item
            const singleItemAmount = updatedItem.inches * updatedItem.rate;
            // Then multiply by quantity
            updatedItem.amount = singleItemAmount * updatedItem.quantity;
          } else if (field === "amount" && updatedItem.inches > 0) {
            // If amount changes, calculate rate per inch for single item
            const ratePerInch = updatedItem.amount / updatedItem.inches;
            updatedItem.rate = ratePerInch;
          } else if (field === "quantity") {
            // If quantity changes, recalculate total amount
            const singleItemAmount = updatedItem.inches * updatedItem.rate;
            updatedItem.amount = singleItemAmount * updatedItem.quantity;
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
    const total = subtotal;
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

      // Validate line items
      const hasEmptyDescriptions = lineItems.some(
        (item) => !item.description.trim()
      );
      if (hasEmptyDescriptions) {
        throw new Error("Please fill all product descriptions");
      }

      // Prepare invoice data
      const invoiceData: InvoiceFormData = {
        customer_id: values.customer_id,
        issue_date: values.issue_date.format("YYYY-MM-DD"),
        due_date: values.issue_date.format("YYYY-MM-DD"), // Same as issue date
        term: "due_on_receipt", // Default term
        line_items: lineItems,
        notes: values.notes,
        payment_terms: "",
      };

      let result: Invoice;

      if (isEditMode && currentInvoice) {
        // For editing
        invoiceData.invoice_number = currentInvoice.invoice_number;
        result = await invoiceService.updateInvoice(
          currentInvoice.id,
          invoiceData
        );
        messageApi.success("Invoice updated successfully");
      } else {
        // For new invoices
        result = await invoiceService.createInvoice(invoiceData);
        setInvoiceNumber(result.invoice_number);
        setCurrentInvoice(result);
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
        });
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
          </Space>
        </div>
      ),
      okButtonProps: { style: { display: "none" } },
      cancelButtonProps: { style: { display: "none" } },
      centered: true,
      width: 450,
    });
  };

  // Handle product form submission
  const handleProductFormSubmit = async (values: any) => {
    try {
      setLoading(true);

      if (editingProduct) {
        // Don't allow editing predefined product type
        const updates = { ...values };
        if (editingProduct.is_predefined) {
          delete updates.is_predefined; // Don't change predefined status
        }

        await productService.updateProduct(editingProduct.id, updates);
        messageApi.success("Product updated successfully");
      } else {
        await productService.createProduct({
          ...values,
          is_predefined: false, // New products are always custom
        });
        messageApi.success("Product added successfully");
      }

      // Refresh products
      await loadProducts();

      // Close modal
      setShowProductManagementModal(false);
      setEditingProduct(null);
      productForm.resetFields();
    } catch (error: any) {
      console.error("Error saving product:", error);
      messageApi.error(`Failed to save product: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Show product management modal
  const showProductManagement = () => {
    const modalInstance = modal.confirm({
      title: "Manage Products",
      width: 800,
      content: (
        <div style={{ maxHeight: 400, overflowY: "auto" }}>
          <Table
            dataSource={products}
            rowKey="id"
            pagination={false}
            size="small"
            columns={[
              {
                title: "Product Name",
                dataIndex: "name",
                key: "name",
                width: 200,
              },
              {
                title: "Description",
                dataIndex: "description",
                key: "description",
                width: 200,
                ellipsis: true,
              },
              {
                title: "Rate (PKR/inch)",
                dataIndex: "default_rate",
                key: "default_rate",
                width: 120,
                render: (rate) =>
                  rate
                    ? rate.toLocaleString("en-PK", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    : "0.00",
              },
              {
                title: "Type",
                key: "type",
                width: 120,
                render: (_, product) =>
                  product.is_predefined ? (
                    <Tag color="orange">Predefined</Tag>
                  ) : (
                    <Tag color="green">Custom</Tag>
                  ),
              },
              {
                title: "Status",
                dataIndex: "status",
                key: "status",
                width: 100,
                render: (status) => (
                  <Tag color={status === "active" ? "success" : "error"}>
                    {status}
                  </Tag>
                ),
              },
              {
                title: "Actions",
                key: "actions",
                width: 120,
                render: (_, product) => (
                  <Space>
                    <Button
                      type="text"
                      icon={<EditOutlined />}
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        // Close the management modal first
                        modalInstance.destroy();
                        setProductManagementModal(null);

                        // Then open edit modal
                        setTimeout(() => {
                          setEditingProduct(product);
                          productForm.setFieldsValue({
                            name: product.name,
                            default_rate: product.default_rate || 0,
                            description: product.description || "",
                            is_predefined: product.is_predefined || false,
                          });
                          setShowProductManagementModal(true);
                        }, 100);
                      }}
                    />
                    {!product.is_predefined && (
                      <Popconfirm
                        title="Delete this product?"
                        description="This will permanently delete the product."
                        onConfirm={async () => {
                          try {
                            await productService.deleteProduct(product.id);
                            messageApi.success("Product deleted permanently");
                            await loadProducts();
                          } catch (error: any) {
                            messageApi.error(
                              `Failed to delete product: ${error.message}`
                            );
                          }
                        }}
                        okText="Yes"
                        cancelText="No"
                        okButtonProps={{ danger: true }}
                      >
                        <Button
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          size="small"
                        />
                      </Popconfirm>
                    )}
                  </Space>
                ),
              },
            ]}
          />
        </div>
      ),
      okButtonProps: { style: { display: "none" } },
      cancelText: "Close",
      centered: true,
      onCancel: () => {
        setProductManagementModal(null);
      },
    });

    setProductManagementModal(modalInstance);
  };

  // Render product dropdown with custom render
  const renderProductDropdown = (
    menu: React.ReactElement,
    record: InvoiceLineItem
  ) => (
    <>
      {menu}
      <Divider style={{ margin: "4px 0" }} />
      <div style={{ padding: "4px 8px" }}>
        <Button
          type="text"
          icon={<PlusOutlined />}
          size="small"
          block
          onClick={() => {
            // Close dropdown first
            const dropdown = document.querySelector(".ant-select-dropdown");
            if (dropdown) {
              (dropdown as HTMLElement).style.display = "none";
            }

            // Open product management modal
            setEditingProduct(null);
            productForm.resetFields();
            setShowProductManagementModal(true);
          }}
        >
          Add New Product
        </Button>
      </div>
    </>
  );

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
    ],
  };

  // Line items table columns with product dropdown
  const lineItemsColumns: ColumnsType<InvoiceLineItem> = [
    {
      title: "Product Description",
      dataIndex: "description",
      key: "description",
      width: 300,
      render: (_, record) => (
        <div style={{ display: "flex", gap: 8 }}>
          <Select
            placeholder="Select or search product"
            style={{ flex: 1 }}
            value={record.description || undefined}
            onChange={(value) => handleProductSelect(value, record.id)}
            showSearch
            optionFilterProp="children"
            filterOption={(input, option) =>
              (option?.children as string)
                ?.toLowerCase()
                .includes(input.toLowerCase()) ||
              (option?.value as string)
                ?.toLowerCase()
                .includes(input.toLowerCase())
            }
            dropdownRender={(menu) => renderProductDropdown(menu, record)}
          >
            <Select.OptGroup label="Custom Products">
              {products
                .filter(
                  (product) =>
                    !product.is_predefined && product.status === "active"
                )
                .map((product) => (
                  <Option key={product.id} value={product.id}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span>{product.name}</span>
                      {product.default_rate && product.default_rate > 0 && (
                        <Tag
                          color="blue"
                          style={{ marginLeft: 8, fontSize: 11 }}
                        >
                          {product.default_rate.toLocaleString("en-PK", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                          /inch
                        </Tag>
                      )}
                    </div>
                  </Option>
                ))}
            </Select.OptGroup>

            <Select.OptGroup label="Predefined Products">
              {products
                .filter(
                  (product) =>
                    product.is_predefined && product.status === "active"
                )
                .map((product) => (
                  <Option key={product.id} value={product.id}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span>{product.name}</span>
                      <Tag
                        color="orange"
                        style={{ marginLeft: 8, fontSize: 11 }}
                      >
                        Predefined
                      </Tag>
                    </div>
                  </Option>
                ))}
            </Select.OptGroup>
          </Select>

          <Input
            placeholder="Or enter custom description"
            value={record.description}
            onChange={(e) =>
              updateLineItem(record.id, "description", e.target.value)
            }
            style={{ flex: 1 }}
          />
        </div>
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
      width: 140,
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
      width: 140,
      render: (_, record) => (
        <InputNumber
          min={0}
          step={0.01}
          value={record.rate}
          onChange={(value) => updateLineItem(record.id, "rate", value || 0)}
          style={{ width: "100%" }}
          formatter={(value) => {
            if (!value) return "0";
            const num = parseFloat(value.toString());
            if (isNaN(num)) return "0";
            return num.toLocaleString("en-PK", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            });
          }}
          parser={(value) => {
            return value ? parseFloat(value.replace(/,/g, "")) : 0;
          }}
        />
      ),
    },
    {
      title: "Amount",
      dataIndex: "amount",
      key: "amount",
      width: 140,
      render: (_, record) => (
        <InputNumber
          min={0}
          step={0.01}
          value={record.amount}
          onChange={(value) => updateLineItem(record.id, "amount", value || 0)}
          style={{ width: "100%" }}
          formatter={(value) => {
            if (!value) return "0";
            const num = parseFloat(value.toString());
            if (isNaN(num)) return "0";
            return num.toLocaleString("en-PK", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            });
          }}
          parser={(value) => {
            return value ? parseFloat(value.replace(/,/g, "")) : 0;
          }}
        />
      ),
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
      {/* Product Management Modal */}
      <Modal
        title={editingProduct ? "Edit Product" : "Add New Product"}
        open={showProductManagementModal}
        onCancel={() => {
          setShowProductManagementModal(false);
          setEditingProduct(null);
          productForm.resetFields();
        }}
        footer={[
          <Button
            key="cancel"
            onClick={() => {
              setShowProductManagementModal(false);
              setEditingProduct(null);
              productForm.resetFields();
            }}
          >
            Cancel
          </Button>,
          <Button
            key="submit"
            type="primary"
            onClick={() => {
              productForm.submit();
            }}
            loading={loading}
          >
            {editingProduct ? "Update Product" : "Add Product"}
          </Button>,
        ]}
        destroyOnClose
        zIndex={1001}
      >
        <div style={{ padding: "16px 0" }}>
          <Form
            form={productForm}
            layout="vertical"
            initialValues={
              editingProduct || { default_rate: 0, is_predefined: false }
            }
            onFinish={handleProductFormSubmit}
          >
            <Form.Item
              label="Product Name"
              name="name"
              rules={[{ required: true, message: "Please enter product name" }]}
            >
              <Input placeholder="e.g., Conveyor Belt" />
            </Form.Item>

            <Form.Item
              label="Default Rate (PKR/inch)"
              name="default_rate"
              rules={[{ required: false }]}
            >
              <InputNumber
                placeholder="0.00"
                min={0}
                step={0.01}
                style={{ width: "100%" }}
                formatter={(value) => {
                  if (!value) return "0";
                  const num = parseFloat(value.toString());
                  if (isNaN(num)) return "0";
                  return num.toLocaleString("en-PK", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  });
                }}
                parser={(value) => {
                  return value ? parseFloat(value.replace(/,/g, "")) : 0;
                }}
              />
            </Form.Item>

            <Form.Item label="Description" name="description">
              <TextArea placeholder="Product description (optional)" rows={2} />
            </Form.Item>

            {!editingProduct && (
              <Form.Item name="is_predefined" hidden>
                <Input type="hidden" value={false} />
              </Form.Item>
            )}

            {editingProduct?.is_predefined && (
              <div
                style={{
                  padding: "8px",
                  backgroundColor: "#fffbe6",
                  borderRadius: 4,
                  marginTop: 8,
                }}
              >
                <Text type="warning">
                  <InfoCircleOutlined /> This is a predefined product. Some
                  fields may be restricted.
                </Text>
              </div>
            )}
          </Form>
        </div>
      </Modal>

      {/* Header */}
      <Card styles={{ body: { padding: "16px 24px" } }}>
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
                  <Text type="secondary">Manual Invoice Number Entry</Text>
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

            <Col span={8}>{/* Spacing column */}</Col>

            <Col span={8}>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    label="Invoice Number"
                    name="invoice_number"
                    rules={[
                      { required: true, message: "Invoice number is required" },
                      {
                        pattern: /^INV-.+/,
                        message: "Invoice number must start with INV-",
                      },
                    ]}
                  >
                    <Input
                      prefix="INV-"
                      placeholder="Enter number after INV-"
                      value={invoiceNumber?.replace(/^INV-/, "")}
                      onChange={(e) => {
                        const newNumber = `INV-${e.target.value}`;
                        setInvoiceNumber(newNumber);
                        form.setFieldValue("invoice_number", newNumber);
                      }}
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
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button
                      type="dashed"
                      icon={<PlusOutlined />}
                      onClick={addLineItem}
                    >
                      Add Line Item
                    </Button>
                    <Button
                      icon={<EditOutlined />}
                      onClick={showProductManagement}
                    >
                      Manage Products
                    </Button>
                  </div>
                  <div>{/* Empty div for spacing */}</div>
                </div>
              )}
            />
          </div>

          <Divider />

          {/* Total and Notes Section */}
          <Row gutter={24}>
            <Col span={12}>
              <Space direction="vertical" style={{ width: "100%" }}>
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
