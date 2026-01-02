import React from "react";
import {
  Drawer,
  Button,
  Space,
  Tag,
  Divider,
  Descriptions,
  Table,
  Modal,
  App,
} from "antd";
import {
  CloseOutlined,
  EditOutlined,
  PrinterOutlined,
  DeleteOutlined,
  CreditCardOutlined,
  SendOutlined,
  FileImageOutlined,
  FileTextOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import type { Invoice } from "../../types";
import { invoiceService } from "../../services/invoiceService";
import { professionalInvoiceService } from "../../services/professionalInvoiceService";

interface InvoiceViewPanelProps {
  visible: boolean;
  onClose: () => void;
  invoice: Invoice | null;
  onEdit: (invoice: Invoice) => void;
  onReceivePayment: (invoice: Invoice) => void;
  onPrint: (invoice: Invoice) => void;
  onDelete: (invoice: Invoice) => void;
  onMarkAsSent: (invoice: Invoice) => void;
  onReload: () => void;
}

const InvoiceViewPanel: React.FC<InvoiceViewPanelProps> = ({
  visible,
  onClose,
  invoice,
  onEdit,
  onReceivePayment,
  onPrint,
  onDelete,
  onMarkAsSent,
  onReload,
}) => {
  const { message, modal } = App.useApp();

  if (!invoice) return null;

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

  // Handle mark as sent from side panel
  const handleMarkAsSent = async () => {
    try {
      await invoiceService.markAsSent(invoice.id);
      message.success("Invoice marked as sent");
      onReload();
      onClose();
    } catch (error) {
      message.error("Failed to mark invoice as sent");
    }
  };

  // Handle delete from side panel
  const handleDelete = () => {
    modal.confirm({
      title: "Delete Invoice",
      content: `Are you sure you want to delete ${invoice.invoice_number}? This action cannot be undone.`,
      okText: "Delete",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        try {
          await invoiceService.deleteInvoice(invoice.id);
          message.success("Invoice deleted successfully");
          onReload();
          onClose();
        } catch (error) {
          message.error("Failed to delete invoice");
        }
      },
      centered: true,
    });
  };

  // Line items columns - Updated to show proper data
  const itemsColumns = [
    {
      title: "Description",
      dataIndex: "description",
      key: "description",
      width: "40%",
    },
    {
      title: "Qty",
      dataIndex: "quantity",
      key: "quantity",
      width: 80,
      render: (quantity: number) => quantity?.toLocaleString() || "0",
    },
    {
      title: "Length (Inches)",
      dataIndex: "inches",
      key: "inches",
      width: 120,
      render: (inches: number) => inches?.toLocaleString() || "0",
    },
    {
      title: "Rate (PKR/inch)",
      dataIndex: "rate",
      key: "rate",
      width: 120,
      render: (rate: number) => `PKR ${rate?.toLocaleString() || "0"}`,
    },
    {
      title: "Amount",
      dataIndex: "amount",
      key: "amount",
      width: 120,
      render: (amount: number) => `PKR ${amount?.toLocaleString() || "0"}`,
    },
  ];

  return (
    <Drawer
      title={
        <div style={{ textAlign: "center", position: "relative" }}>
          <Button
            type="text"
            icon={<CloseOutlined />}
            onClick={onClose}
            style={{ position: "absolute", left: 0, top: 0 }}
          />
          <div style={{ fontWeight: "bold", fontSize: "16px" }}>
            {invoice.invoice_number}
          </div>
        </div>
      }
      placement="right"
      onClose={onClose}
      open={visible}
      width={700}
      styles={{
        body: { padding: "16px 0" },
        header: { padding: "16px 24px", borderBottom: "1px solid #f0f0f0" },
        footer: {
          padding: "16px 24px",
          borderTop: "1px solid #f0f0f0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        },
      }}
      footer={
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <Space>
            <Button
              icon={<EditOutlined />}
              onClick={() => {
                onEdit(invoice);
                onClose(); // Close the panel when editing
              }}
            >
              Edit Invoice
            </Button>
            {invoice.status === "draft" ? (
              <Button icon={<SendOutlined />} onClick={handleMarkAsSent}>
                Mark as Sent
              </Button>
            ) : (
              <Button
                icon={<CreditCardOutlined />}
                type="primary"
                onClick={() => onReceivePayment(invoice)}
              >
                Receive Payment
              </Button>
            )}
          </Space>
          <Space>
            <Button
              icon={<PrinterOutlined />}
              onClick={() => {
                // Show print options modal
                modal.confirm({
                  title: "Print Invoice",
                  content: (
                    <div>
                      <p>How would you like to print this invoice?</p>
                      <Space direction="vertical" style={{ width: "100%" }}>
                        <Button
                          type="primary"
                          block
                          onClick={async () => {
                            modal.destroy();
                            try {
                              await professionalInvoiceService.downloadProfessionalInvoice(
                                invoice,
                                "pdf",
                                true
                              );
                              message.success(
                                "Invoice downloaded with letterhead"
                              );
                            } catch (error) {
                              message.error("Failed to generate invoice");
                            }
                          }}
                        >
                          With Letterhead (PDF)
                        </Button>
                        <Button
                          block
                          onClick={async () => {
                            modal.destroy();
                            try {
                              await professionalInvoiceService.downloadProfessionalInvoice(
                                invoice,
                                "pdf",
                                false
                              );
                              message.success(
                                "Invoice downloaded without letterhead"
                              );
                            } catch (error) {
                              message.error("Failed to generate invoice");
                            }
                          }}
                        >
                          Without Letterhead (PDF)
                        </Button>
                        <Button
                          block
                          onClick={() => {
                            modal.destroy();
                            onPrint(invoice);
                          }}
                        >
                          Simple Print
                        </Button>
                      </Space>
                    </div>
                  ),
                  okButtonProps: { style: { display: "none" } },
                  cancelButtonProps: { style: { display: "none" } },
                  centered: true,
                  width: 400,
                });
              }}
              title="Print Invoice"
            >
              Print
            </Button>
            <Button
              icon={<DeleteOutlined />}
              danger
              onClick={handleDelete}
              title="Delete Invoice"
            />
          </Space>
        </div>
      }
    >
      <div style={{ padding: "0 24px" }}>
        {/* Status and Amount */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <Tag
            color={getStatusColor(invoice.status)}
            style={{ fontSize: "14px", padding: "4px 12px" }}
          >
            {getStatusText(invoice.status)}
          </Tag>
          <div
            style={{
              fontSize: "32px",
              fontWeight: "bold",
              margin: "16px 0",
              color: "#1890ff",
            }}
          >
            PKR {(invoice.total_amount || 0).toLocaleString()}
          </div>
        </div>

        <Divider />

        {/* Invoice Details */}
        <Descriptions column={1} size="small">
          <Descriptions.Item label="Invoice Date">
            {new Date(invoice.issue_date).toLocaleDateString("en-GB")}
          </Descriptions.Item>
          <Descriptions.Item label="Due Date">
            {new Date(invoice.due_date).toLocaleDateString("en-GB")}
          </Descriptions.Item>
          <Descriptions.Item label="Customer">
            {invoice.customer?.company_name || "N/A"}
          </Descriptions.Item>
        </Descriptions>

        <Divider />

        {/* Invoice Items - Fixed to show actual line items */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: "500", marginBottom: 12 }}>
            Invoice Items
          </div>
          {invoice.items && invoice.items.length > 0 ? (
            <Table
              columns={itemsColumns}
              dataSource={invoice.items}
              pagination={false}
              size="small"
              rowKey="id"
              summary={() => (
                <Table.Summary>
                  <Table.Summary.Row>
                    <Table.Summary.Cell
                      index={0}
                      colSpan={3}
                      style={{ textAlign: "right", fontWeight: "bold" }}
                    >
                      Total Amount:
                    </Table.Summary.Cell>
                    <Table.Summary.Cell
                      index={1}
                      colSpan={2}
                      style={{ fontWeight: "bold" }}
                    >
                      PKR {(invoice.total_amount || 0).toLocaleString()}
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                  <Table.Summary.Row>
                    <Table.Summary.Cell
                      index={0}
                      colSpan={3}
                      style={{ textAlign: "right" }}
                    >
                      Paid Amount:
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={1} colSpan={2}>
                      PKR {(invoice.paid_amount || 0).toLocaleString()}
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                  <Table.Summary.Row>
                    <Table.Summary.Cell
                      index={0}
                      colSpan={3}
                      style={{ textAlign: "right", fontWeight: "bold" }}
                    >
                      Pending Amount:
                    </Table.Summary.Cell>
                    <Table.Summary.Cell
                      index={1}
                      colSpan={2}
                      style={{ fontWeight: "bold", color: "#ff4d4f" }}
                    >
                      PKR {(invoice.pending_amount || 0).toLocaleString()}
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                </Table.Summary>
              )}
            />
          ) : (
            <div
              style={{
                padding: "20px",
                textAlign: "center",
                color: "#999",
                border: "1px dashed #d9d9d9",
                borderRadius: "6px",
              }}
            >
              No line items found for this invoice
            </div>
          )}
        </div>

        {/* Removed the Print and Delete buttons from here since they are now in the footer */}
      </div>
    </Drawer>
  );
};

export default InvoiceViewPanel;
