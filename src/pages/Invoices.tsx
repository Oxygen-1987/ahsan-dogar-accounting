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
  PrinterOutlined,
  DownOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { Invoice } from "../types";
import { invoiceService } from "../services/invoiceService";
import InvoiceViewPanel from "../components/invoices/InvoiceViewPanel";
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
  const [searchText, setSearchText] = useState("");
  const [summary, setSummary] = useState({
    totalInvoices: 0,
    totalAmount: 0,
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

  // Handle edit invoice - navigate to create page with invoice data
  const handleEditInvoice = (invoice: Invoice) => {
    navigate(`/invoices/edit/${invoice.id}`);
  };

  // Handle print invoice
  const handlePrintInvoice = async (invoice: Invoice) => {
    try {
      const fullInvoice = await invoiceService.getInvoiceById(invoice.id);
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
      console.error("Error printing invoice:", error);
      message.error("Failed to print invoice");
    }
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

  // Get status color for due date
  const getDueDateStatus = (dueDate: string) => {
    const today = new Date();
    const due = new Date(dueDate);
    const diffDays = Math.ceil(
      (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays < 0) return "red"; // Overdue
    if (diffDays <= 7) return "orange"; // Due soon
    return "green"; // On track
  };

  // Action dropdown menu
  const getActionMenu = (invoice: Invoice): MenuProps => ({
    onClick: (e) => {
      e.domEvent.stopPropagation();
    },
    items: [
      {
        key: "view",
        label: "View Details",
        icon: <EyeOutlined />,
        onClick: (e) => {
          e.domEvent.stopPropagation();
          handleViewInvoice(invoice);
        },
      },
      {
        key: "edit",
        label: "Edit Invoice",
        icon: <EditOutlined />,
        onClick: (e) => {
          e.domEvent.stopPropagation();
          handleEditInvoice(invoice);
        },
      },
      {
        type: "divider",
      },
      {
        key: "print_pdf_letterhead",
        label: "PDF with Letterhead",
        icon: <FilePdfOutlined />,
        onClick: async (e) => {
          if (e && e.domEvent) e.domEvent.stopPropagation();
          try {
            const fullInvoice = await invoiceService.getInvoiceById(invoice.id);
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
            const fullInvoice = await invoiceService.getInvoiceById(invoice.id);
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
            const fullInvoice = await invoiceService.getInvoiceById(invoice.id);
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
      width: 100,
      align: "center",
      render: (date: string) => {
        if (!date) return "N/A";
        try {
          return new Date(date).toLocaleDateString("en-GB");
        } catch (error) {
          return "Invalid Date";
        }
      },
      sorter: (a, b) => {
        const dateA = a.issue_date ? new Date(a.issue_date).getTime() : 0;
        const dateB = b.issue_date ? new Date(b.issue_date).getTime() : 0;
        return dateA - dateB;
      },
    },
    {
      title: "Invoice No.",
      dataIndex: "invoice_number",
      key: "invoice_number",
      width: 140,
      align: "center",
    },
    {
      title: "Customer",
      dataIndex: "customer",
      key: "customer",
      width: 200,
      ellipsis: true,
      render: (customer) => customer?.company_name || "N/A",
    },
    {
      title: "Total Amount",
      dataIndex: "total_amount",
      key: "total_amount",
      width: 140,
      align: "right",
      render: (amount: number) => {
        const safeAmount = amount || 0;
        return (
          <span style={{ fontWeight: "bold", color: "#1890ff" }}>
            PKR {safeAmount.toLocaleString()}
          </span>
        );
      },
      sorter: (a, b) => (a.total_amount || 0) - (b.total_amount || 0),
    },
    {
      title: "Customer Balance",
      dataIndex: ["customer", "current_balance"],
      key: "customer_balance",
      width: 160,
      align: "right",
      render: (balance: number, record: Invoice) => {
        const safeBalance = balance || 0;

        // Determine color based on balance
        let color = "#666"; // Default for zero
        if (safeBalance > 0) {
          color = "#cf1322"; // Red for positive balance (customer owes money)
        } else if (safeBalance < 0) {
          color = "#389e0d"; // Green for negative balance (customer has credit)
        }

        // Format the display
        const displayAmount = Math.abs(safeBalance);
        const displayText =
          safeBalance < 0
            ? `PKR ${displayAmount.toLocaleString()} CR`
            : `PKR ${displayAmount.toLocaleString()}`;

        return <span style={{ fontWeight: "bold", color }}>{displayText}</span>;
      },
      sorter: (a, b) =>
        (a.customer?.current_balance || 0) - (b.customer?.current_balance || 0),
    },
    {
      title: "Action",
      key: "action",
      width: 180,
      align: "center",
      render: (_, record: Invoice) => (
        <Space size="small">
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewInvoice(record)}
            title="View Details"
          />
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              handleEditInvoice(record);
            }}
            title="Edit Invoice"
          />
          <Dropdown
            menu={getActionMenu(record)}
            trigger={["click"]}
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              size="small"
              icon={<PrinterOutlined />}
              title="Print/Export Options"
              onClick={(e) => e.stopPropagation()}
            >
              <DownOutlined />
            </Button>
          </Dropdown>
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
          Bills/Invoices
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
              title="Average Invoice"
              value={
                summary.totalInvoices > 0
                  ? summary.totalAmount / summary.totalInvoices
                  : 0
              }
              prefix="PKR "
              valueStyle={{ color: "#722ed1" }}
              precision={2} // ADD THIS LINE
              formatter={(value) => value.toLocaleString("en-PK")} // ADD THIS LINE
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="This Month"
              value={
                invoices.filter((inv) => {
                  const invoiceDate = new Date(inv.issue_date);
                  const now = new Date();
                  return (
                    invoiceDate.getMonth() === now.getMonth() &&
                    invoiceDate.getFullYear() === now.getFullYear()
                  );
                }).length
              }
              valueStyle={{ color: "#faad14" }}
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
            onSearch={() => {}}
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
          locale={{
            emptyText: "No invoices found",
          }}
        />
      </Card>

      {/* Invoice View Panel */}
      <InvoiceViewPanel
        visible={viewPanelVisible}
        onClose={() => setViewPanelVisible(false)}
        invoice={selectedInvoice}
        onEdit={handleEditInvoice}
        onPrint={handlePrintInvoice}
        onDelete={handleDeleteInvoice}
        onReload={loadInvoices}
      />
    </div>
  );
};

export default Invoices;
