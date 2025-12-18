import React, { useState, useEffect } from "react";
import {
  Table,
  Card,
  Button,
  Space,
  Input,
  Row,
  Col,
  Statistic,
  Dropdown,
  Modal,
  Tag,
  type MenuProps,
  App,
} from "antd";
import {
  PlusOutlined,
  EyeOutlined,
  FilePdfOutlined,
  FileImageOutlined,
  EditOutlined,
  DeleteOutlined,
  CreditCardOutlined,
  CopyOutlined,
  PrinterOutlined,
  DownOutlined,
  SendOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { Invoice } from "../types";
import { invoiceService } from "../services/invoiceService";
import InvoiceViewPanel from "../components/invoices/InvoiceViewPanel";
import ReceivePaymentModal from "../components/payments/ReceivePaymentModal";
import LoadingSpinner from "../components/common/LoadingSpinner";
import { professionalInvoiceService } from "../services/professionalInvoiceService";
import "./Invoices.css";
import { useNavigate } from "react-router-dom";

const { Search } = Input;

const Invoices: React.FC = () => {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewPanelVisible, setViewPanelVisible] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [receivePaymentModalVisible, setReceivePaymentModalVisible] =
    useState(false);
  const [paymentSelectedCustomer, setPaymentSelectedCustomer] =
    useState<any>(null);
  const [searchText, setSearchText] = useState("");
  const [summary, setSummary] = useState({
    totalInvoices: 0,
    totalAmount: 0,
    pendingAmount: 0,
    paidAmount: 0,
  });

  // Load invoices data
  const loadInvoices = async () => {
    setLoading(true);
    try {
      const { invoices: invoicesData, summary: summaryData } =
        await invoiceService.getAllInvoices();
      setInvoices(invoicesData);
      setSummary(summaryData);
    } catch (error) {
      message.error("Failed to load invoices");
      console.error("Error loading invoices:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices();
  }, []);

  // Handle view invoice
  const handleViewInvoice = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setViewPanelVisible(true);
  };

  // Handle receive payment
  const handleReceivePayment = (invoice: Invoice) => {
    if (!invoice.customer) {
      message.error("Customer information not found for this invoice");
      return;
    }

    // Create customer object for payment modal
    const customerForPayment = {
      id: invoice.customer_id,
      company_name: invoice.customer.company_name,
      first_name: invoice.customer.first_name,
      last_name: invoice.customer.last_name,
      current_balance: invoice.customer.current_balance || 0,
      opening_balance: invoice.customer.opening_balance || 0,
    };

    // Set the customer for payment modal
    setPaymentSelectedCustomer(customerForPayment);

    // Open the payment modal
    setReceivePaymentModalVisible(true);
  };

  // Add this function for payment success
  const handlePaymentReceived = () => {
    message.success("Payment recorded successfully");
    setReceivePaymentModalVisible(false);
    setPaymentSelectedCustomer(null);
    loadInvoices(); // Refresh invoices list
  };

  // Handle mark as sent - ONLY for draft invoices
  const handleMarkAsSent = async (invoice: Invoice) => {
    // Check if invoice can be marked as sent
    if (invoice.status !== "draft") {
      message.warning(
        `Cannot mark as sent. Invoice is already ${invoice.status}.`
      );
      return;
    }

    try {
      await invoiceService.markAsSent(invoice.id);
      message.success(`Invoice ${invoice.invoice_number} marked as sent`);
      loadInvoices();
    } catch (error) {
      message.error("Failed to mark invoice as sent");
      console.error("Error marking invoice as sent:", error);
    }
  };

  // Handle edit invoice - navigate to create page with invoice data
  const handleEditInvoice = (invoice: Invoice) => {
    navigate(`/invoices/edit/${invoice.id}`);
  };

  // Handle print invoice
  const handlePrintInvoice = (invoice: Invoice) => {
    message.info(`Print invoice ${invoice.invoice_number}`);
  };

  // Handle delete invoice
  const handleDeleteInvoice = (invoice: Invoice) => {
    modal.confirm({
      title: "Delete Invoice",
      content: `Are you sure you want to delete invoice ${invoice.invoice_number}? This action cannot be undone.`,
      okText: "Delete",
      okType: "danger",
      cancelText: "Cancel",
      centered: true,
      onOk: async () => {
        try {
          await invoiceService.deleteInvoice(invoice.id);
          message.success(
            `Invoice ${invoice.invoice_number} deleted successfully`
          );
          loadInvoices();
        } catch (error: any) {
          console.error("Error deleting invoice:", error);
          message.error(error.message || "Failed to delete invoice");
        }
      },
    });
  };

  // Check if invoice can be marked as sent
  const canMarkAsSent = (invoice: Invoice): boolean => {
    // Only draft invoices can be marked as sent
    return invoice.status === "draft";
  };

  // Check if invoice can receive payment
  const canReceivePayment = (invoice: Invoice): boolean => {
    // Invoices that are sent, partial, or overdue can receive payment
    return ["sent", "partial", "overdue"].includes(invoice.status);
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case "paid":
        return "green";
      case "overdue":
        return "red";
      case "partial":
        return "orange";
      case "sent":
        return "blue";
      case "draft":
        return "default";
      default:
        return "default";
    }
  };

  // Get status text
  const getStatusText = (status: string) => {
    switch (status) {
      case "paid":
        return "Paid";
      case "overdue":
        return "Overdue";
      case "partial":
        return "Partial";
      case "sent":
        return "Sent";
      case "draft":
        return "Draft";
      default:
        return status;
    }
  };

  // Action dropdown menu - UPDATED
  const getActionMenu = (invoice: Invoice): MenuProps => ({
    onClick: (e) => {
      e.domEvent.stopPropagation();
    },
    items: [
      {
        key: "view-edit",
        label: "View/Edit",
        icon: <EyeOutlined />,
        onClick: (e) => {
          e.domEvent.stopPropagation();
          handleEditInvoice(invoice);
        },
      },
      {
        key: "mark-as-sent",
        label: "Mark as Sent",
        icon: <SendOutlined />,
        disabled: !canMarkAsSent(invoice), // Disable if not draft
        onClick: (e) => {
          e.domEvent.stopPropagation();
          if (canMarkAsSent(invoice)) {
            handleMarkAsSent(invoice);
          }
        },
      },
      {
        key: "receive-payment",
        label: "Receive Payment",
        icon: <CreditCardOutlined />,
        disabled: !canReceivePayment(invoice), // Disable if not payable
        onClick: (e) => {
          e.domEvent.stopPropagation();
          if (canReceivePayment(invoice)) {
            handleReceivePayment(invoice);
          }
        },
      },
      {
        type: "divider",
      },
      {
        key: "print",
        label: "Print",
        icon: <PrinterOutlined />,
        onClick: (e) => {
          e.domEvent.stopPropagation();
          handlePrintInvoice(invoice);
        },
      },
      {
        type: "divider",
      },
      {
        key: "delete",
        label: "Delete",
        icon: <DeleteOutlined />,
        danger: true,
        onClick: (e) => {
          e.domEvent.stopPropagation();
          modal.confirm({
            title: "Delete Invoice",
            content: `Are you sure you want to delete ${invoice.invoice_number}? This action cannot be undone.`,
            okText: "Delete",
            okType: "danger",
            cancelText: "Cancel",
            onOk: () => handleDeleteInvoice(invoice),
            centered: true,
          });
        },
      },
    ],
  });

  // Table columns
  const columns: ColumnsType<Invoice> = [
    {
      title: "Date",
      dataIndex: "issue_date",
      key: "issue_date",
      width: 120,
      render: (date: string) => new Date(date).toLocaleDateString("en-GB"),
    },
    {
      title: "No.",
      dataIndex: "invoice_number",
      key: "invoice_number",
      width: 140,
    },
    {
      title: "Customer",
      dataIndex: "customer",
      key: "customer",
      render: (customer) => customer?.company_name || "N/A",
    },
    {
      title: "Amount",
      dataIndex: "total_amount",
      key: "total_amount",
      width: 120,
      render: (amount: number) => `PKR ${amount.toLocaleString()}`,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 100,
      render: (status: string) => (
        <Tag color={getStatusColor(status)}>{getStatusText(status)}</Tag>
      ),
    },
    {
      title: "Action",
      key: "action",
      width: 250,
      render: (_, record: Invoice) => (
        <Space size="small">
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              console.log("Viewing invoice:", record.id);
              handleViewInvoice(record);
            }}
            title="View Details"
          />
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              console.log("Editing invoice:", record.id);
              navigate(`/create-invoice/${record.id}`);
            }}
            title="Edit Invoice"
          />
          <Dropdown
            menu={{
              items: [
                {
                  key: "print_pdf_letterhead",
                  label: "PDF with Letterhead",
                  icon: <FilePdfOutlined />,
                  onClick: async (e) => {
                    if (e && e.domEvent) e.domEvent.stopPropagation();
                    try {
                      const fullInvoice = await invoiceService.getInvoiceById(
                        record.id
                      );
                      if (fullInvoice) {
                        await professionalInvoiceService.downloadInvoice(
                          fullInvoice,
                          "pdf",
                          true
                        );
                        message.success("PDF downloaded with letterhead");
                      } else {
                        message.error("Could not load invoice data");
                      }
                    } catch (error) {
                      console.error("Error downloading invoice:", error);
                      message.error("Failed to download invoice");
                    }
                  },
                },
                {
                  key: "print_pdf_simple",
                  label: "PDF without Letterhead",
                  icon: <FilePdfOutlined />,
                  onClick: async (e) => {
                    if (e && e.domEvent) e.domEvent.stopPropagation();
                    try {
                      const fullInvoice = await invoiceService.getInvoiceById(
                        record.id
                      );
                      if (fullInvoice) {
                        await professionalInvoiceService.downloadInvoice(
                          fullInvoice,
                          "pdf",
                          false
                        );
                        message.success("PDF downloaded without letterhead");
                      } else {
                        message.error("Could not load invoice data");
                      }
                    } catch (error) {
                      console.error("Error downloading invoice:", error);
                      message.error("Failed to download invoice");
                    }
                  },
                },
                {
                  key: "export_jpg",
                  label: "JPG Image",
                  icon: <FileImageOutlined />,
                  onClick: async (e) => {
                    if (e && e.domEvent) e.domEvent.stopPropagation();
                    try {
                      const fullInvoice = await invoiceService.getInvoiceById(
                        record.id
                      );
                      if (fullInvoice) {
                        await professionalInvoiceService.downloadInvoice(
                          fullInvoice,
                          "jpg",
                          true
                        );
                        message.success("JPG image downloaded");
                      } else {
                        message.error("Could not load invoice data");
                      }
                    } catch (error) {
                      console.error("Error exporting invoice:", error);
                      message.error("Failed to export invoice");
                    }
                  },
                },
                {
                  key: "preview",
                  label: "Preview in Browser",
                  icon: <EyeOutlined />,
                  onClick: async (e) => {
                    if (e && e.domEvent) e.domEvent.stopPropagation();
                    try {
                      const fullInvoice = await invoiceService.getInvoiceById(
                        record.id
                      );
                      if (fullInvoice) {
                        await professionalInvoiceService.previewInvoice(
                          fullInvoice,
                          true
                        );
                      } else {
                        message.error("Could not load invoice data");
                      }
                    } catch (error) {
                      console.error("Error previewing invoice:", error);
                      message.error("Failed to preview invoice");
                    }
                  },
                },
              ],
            }}
            trigger={["click"]}
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              size="small"
              icon={<PrinterOutlined />}
              title="Print/Export Options"
              onClick={(e) => e.stopPropagation()}
            >
              Print <DownOutlined />
            </Button>
          </Dropdown>
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteInvoice(record);
            }}
            title="Delete Invoice"
          />
        </Space>
      ),
    },
  ];

  // Filter invoices based on search
  const filteredInvoices = invoices.filter(
    (invoice) =>
      invoice.invoice_number.toLowerCase().includes(searchText.toLowerCase()) ||
      invoice.customer?.company_name
        .toLowerCase()
        .includes(searchText.toLowerCase()) ||
      invoice.customer?.first_name
        .toLowerCase()
        .includes(searchText.toLowerCase()) ||
      invoice.customer?.last_name
        .toLowerCase()
        .includes(searchText.toLowerCase())
  );

  if (loading && invoices.length === 0) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: "24px", fontWeight: "bold" }}>
          Bill/Invoice
        </h1>
      </div>

      {/* Summary Cards */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Invoices"
              value={summary.totalInvoices}
              valueStyle={{ color: "#00b96b" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Amount"
              value={summary.totalAmount}
              prefix="PKR "
              valueStyle={{ color: "#1890ff" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Pending Amount"
              value={summary.pendingAmount}
              prefix="PKR "
              valueStyle={{ color: "#ff4d4f" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Paid Amount"
              value={summary.paidAmount}
              prefix="PKR "
              valueStyle={{ color: "#52c41a" }}
            />
          </Card>
        </Col>
      </Row>

      {/* Filters and Actions */}
      <Card
        styles={{
          body: { padding: "16px" },
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <Search
            placeholder="Search invoices by number, customer..."
            allowClear
            style={{ width: 400 }}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate("/invoices/create")}
          >
            New Invoice
          </Button>
        </div>

        {/* Invoices Table */}
        <Table
          columns={columns}
          dataSource={filteredInvoices}
          rowKey="id"
          loading={loading}
          onRow={(record) => ({
            onClick: () => handleViewInvoice(record),
            style: { cursor: "pointer" },
          })}
          rowClassName="invoice-table-row"
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) =>
              `${range[0]}-${range[1]} of ${total} invoices`,
          }}
        />
      </Card>

      {/* Invoice View Panel */}
      <InvoiceViewPanel
        visible={viewPanelVisible}
        onClose={() => setViewPanelVisible(false)}
        invoice={selectedInvoice}
        onEdit={handleEditInvoice}
        onReceivePayment={handleReceivePayment}
        onPrint={handlePrintInvoice}
        onDelete={handleDeleteInvoice}
        onMarkAsSent={handleMarkAsSent}
        onReload={loadInvoices}
      />

      {/* Receive Payment Modal */}
      <ReceivePaymentModal
        visible={receivePaymentModalVisible}
        onCancel={() => {
          setReceivePaymentModalVisible(false);
          setPaymentSelectedCustomer(null);
        }}
        onSuccess={handlePaymentReceived}
        customer={paymentSelectedCustomer}
      />
    </div>
  );
};

export default Invoices;
