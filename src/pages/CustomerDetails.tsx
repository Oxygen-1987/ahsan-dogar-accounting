import React, { useState, useEffect } from "react";
import {
  Card,
  Row,
  Col,
  Typography,
  Button,
  Space,
  Tabs,
  Tag,
  Statistic,
  Descriptions,
  App,
  Table,
  Modal,
  Dropdown,
  type MenuProps,
  Badge,
} from "antd";
import {
  ArrowLeftOutlined,
  EditOutlined,
  DollarOutlined,
  FileTextOutlined,
  HistoryOutlined,
  EyeOutlined,
  DeleteOutlined,
  DownOutlined,
  CreditCardOutlined,
  TagOutlined,
} from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";
import { customerService } from "../services/customerService";
import { invoiceService } from "../services/invoiceService";
import { paymentService } from "../services/paymentService";
import { discountService } from "../services/discountService";
import type { Customer, Invoice, Payment, DiscountEntry } from "../types";
import dayjs from "dayjs";
import CustomerSidePanel from "../components/customers/CustomerSidePanel";
import PaymentSidePanel from "../components/payments/PaymentSidePanel";
import ReceivePaymentModal from "../components/payments/ReceivePaymentModal";

const { Title, Text } = Typography;
const { TabPane } = Tabs;

const CustomerDetails: React.FC = () => {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [discounts, setDiscounts] = useState<DiscountEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDiscounts, setLoadingDiscounts] = useState(false);
  const [outstandingBalance, setOutstandingBalance] = useState(0);

  // State for side panels and modals
  const [sidePanelVisible, setSidePanelVisible] = useState(false);
  const [paymentSidePanelVisible, setPaymentSidePanelVisible] = useState(false);
  const [receivePaymentModalVisible, setReceivePaymentModalVisible] =
    useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);

  useEffect(() => {
    if (id) {
      loadCustomerDetails();
      loadCustomerInvoices();
      loadCustomerPayments();
      loadCustomerDiscounts();
      loadCustomerOutstandingBalance();
    }
  }, [id]);

  const loadCustomerDetails = async () => {
    try {
      setLoading(true);
      const customerData = await customerService.getCustomerById(id!);
      if (customerData) {
        setCustomer(customerData);
      }
    } catch (error) {
      message.error("Failed to load customer details");
      console.error("Error loading customer:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadCustomerInvoices = async () => {
    try {
      const customerInvoices = await invoiceService.getCustomerInvoices(id!);
      setInvoices(customerInvoices);
      console.log(`Loaded ${customerInvoices.length} invoices for customer`);
    } catch (error) {
      console.error("Error loading invoices:", error);
      setInvoices([]);
    }
  };

  const loadCustomerPayments = async () => {
    try {
      const customerPayments = await paymentService.getPaymentsByCustomerId(
        id!
      );
      setPayments(customerPayments);
      console.log(`Loaded ${customerPayments.length} payments for customer`);
    } catch (error) {
      console.error("Error loading payments:", error);
      setPayments([]);
    }
  };

  const loadCustomerDiscounts = async () => {
    if (!id) return;

    try {
      setLoadingDiscounts(true);
      const discountData = await discountService.getCustomerDiscounts(id);
      setDiscounts(discountData);
      console.log(`Loaded ${discountData.length} discounts for customer`);
    } catch (error) {
      console.error("Error loading discounts:", error);
      setDiscounts([]);
    } finally {
      setLoadingDiscounts(false);
    }
  };

  const loadCustomerOutstandingBalance = async () => {
    if (!id) return;

    try {
      // This returns the correct balance including opening balance
      const balance = await customerService.getCustomerOutstandingBalance(id);
      setOutstandingBalance(balance);
      console.log(`Outstanding balance (including opening): ${balance}`);
    } catch (error) {
      console.error("Failed to load outstanding balance:", error);
      setOutstandingBalance(0);
    }
  };

  const handleEditCustomerDirect = () => {
    setSidePanelVisible(true);
  };

  const handleCreateInvoice = () => {
    navigate(`/invoices/create?customer=${id}`);
  };

  const handleViewLedger = () => {
    navigate(`/customers/${id}/ledger`);
  };

  const handleReceivePayment = () => {
    if (customer) {
      setReceivePaymentModalVisible(true);
    } else {
      message.error("Customer information not loaded yet");
    }
  };

  const handleSaveCustomer = async (data: any) => {
    setSaveLoading(true);
    try {
      if (customer) {
        await customerService.updateCustomer(customer.id, data);
        message.success("Customer updated successfully");
        setSidePanelVisible(false);
        await loadCustomerDetails();
        await loadCustomerOutstandingBalance();
      }
    } catch (error) {
      message.error("Failed to update customer");
      console.error("Error updating customer:", error);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDeleteCustomer = async () => {
    if (!customer) return;

    try {
      const canDeleteResult = await customerService.canDeleteCustomer(
        customer.id
      );

      if (!canDeleteResult.canDelete) {
        Modal.error({
          title: "Cannot Delete Customer",
          content: (
            <div style={{ textAlign: "left", padding: "10px 0" }}>
              <div
                style={{
                  fontSize: "16px",
                  marginBottom: "8px",
                  color: "#ff4d4f",
                }}
              >
                Cannot delete <strong>{customer.company_name}</strong>
              </div>
              <div style={{ color: "#666", marginBottom: "16px" }}>
                This customer has the following related records:
              </div>
              <ul style={{ color: "#666", marginBottom: "16px" }}>
                {canDeleteResult.reasons.map((reason, index) => (
                  <li key={index} style={{ marginBottom: "4px" }}>
                    • {reason}
                  </li>
                ))}
              </ul>
              <div style={{ fontSize: "13px", color: "#999" }}>
                Please delete all related invoices, payments, and non-opening
                ledger entries before deleting the customer.
              </div>
            </div>
          ),
          okText: "OK",
          cancelText: null,
          centered: true,
          width: 500,
          styles: {
            body: { padding: "0" },
          },
        });
        return;
      }

      Modal.confirm({
        title: "Delete Customer",
        content: (
          <div style={{ textAlign: "center", padding: "10px 0" }}>
            <div style={{ fontSize: "16px", marginBottom: "8px" }}>
              Are you sure you want to delete?
            </div>
            <div
              style={{
                fontWeight: "bold",
                fontSize: "16px",
                color: "#ff4d4f",
              }}
            >
              {customer.company_name}
            </div>
            <div style={{ color: "#999", marginTop: "8px" }}>
              Opening balance ledger entries will also be deleted.
            </div>
          </div>
        ),
        okText: "Delete",
        okType: "danger",
        cancelText: "Cancel",
        onOk: async () => {
          try {
            await customerService.deleteCustomer(customer.id);
            message.success("Customer deleted successfully");
            navigate("/customers");
          } catch (error: any) {
            console.error("Error deleting customer:", error);

            Modal.error({
              title: "Delete Failed",
              content: (
                <div style={{ textAlign: "left", padding: "10px 0" }}>
                  <div
                    style={{
                      fontSize: "14px",
                      marginBottom: "8px",
                      color: "#ff4d4f",
                    }}
                  >
                    Failed to delete customer
                  </div>
                  <div style={{ color: "#666" }}>
                    {error.message || "An unknown error occurred"}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#999",
                      marginTop: "12px",
                    }}
                  >
                    Note: Customers with invoices, payments, or non-opening
                    ledger entries cannot be deleted.
                  </div>
                </div>
              ),
              centered: true,
              width: 500,
            });
          }
        },
        centered: true,
        width: 400,
        styles: {
          body: { padding: "0" },
        },
      });
    } catch (error) {
      console.error("Error in delete process:", error);
      message.error("Failed to check customer status");
    }
  };

  const handlePaymentReceived = () => {
    message.success("Payment recorded successfully");
    setReceivePaymentModalVisible(false);
    loadCustomerDetails();
    loadCustomerPayments();
    loadCustomerDiscounts();
    loadCustomerInvoices();
    loadCustomerOutstandingBalance();
  };

  const handleViewPayment = (payment: Payment) => {
    setSelectedPayment(payment);
    setPaymentSidePanelVisible(true);
  };

  const handlePaymentAllocate = (payment: Payment) => {
    message.info(`Allocate payment ${payment.payment_number}`);
  };

  const handlePaymentEdit = (payment: Payment) => {
    message.info(`Edit payment ${payment.payment_number}`);
  };

  const handlePaymentDelete = async (payment: Payment) => {
    Modal.confirm({
      title: "Delete Payment",
      content: `Are you sure you want to delete payment ${payment.payment_number}?`,
      okText: "Delete",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        try {
          await paymentService.deletePayment(payment.id);
          message.success("Payment deleted successfully");
          loadCustomerPayments();
          setPaymentSidePanelVisible(false);
          setSelectedPayment(null);
          loadCustomerDiscounts();
          loadCustomerInvoices();
          loadCustomerOutstandingBalance();
        } catch (error) {
          message.error("Failed to delete payment");
        }
      },
    });
  };

  const handlePaymentReload = () => {
    loadCustomerPayments();
  };

  const handleDeleteDiscount = async (discount: DiscountEntry) => {
    Modal.confirm({
      title: "Delete Discount",
      content: `Are you sure you want to delete discount of PKR ${discount.amount.toLocaleString()}?`,
      okText: "Delete",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        try {
          await discountService.deleteDiscount(discount.id);
          message.success("Discount deleted successfully");
          loadCustomerDiscounts();
          loadCustomerDetails();
          loadCustomerInvoices();
          loadCustomerOutstandingBalance();
        } catch (error) {
          message.error("Failed to delete discount");
        }
      },
    });
  };

  // Invoice columns
  const invoiceColumns = [
    {
      title: "Invoice #",
      dataIndex: "invoice_number",
      key: "invoice_number",
      render: (text: string) => (
        <Text strong style={{ color: "#1890ff" }}>
          {text}
        </Text>
      ),
    },
    {
      title: "Date",
      dataIndex: "issue_date",
      key: "issue_date",
      render: (date: string) => dayjs(date).format("DD/MM/YYYY"),
    },
    {
      title: "Due Date",
      dataIndex: "due_date",
      key: "due_date",
      render: (date: string) => dayjs(date).format("DD/MM/YYYY"),
    },
    {
      title: "Amount",
      dataIndex: "total_amount",
      key: "total_amount",
      render: (amount: number) => (
        <Text strong>PKR {amount.toLocaleString()}</Text>
      ),
      align: "right",
    },
    {
      title: "Action",
      key: "action",
      render: (_: any, record: Invoice) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => navigate(`/invoices/edit/${record.id}`)}
        >
          View
        </Button>
      ),
    },
  ];

  // Payment columns
  const paymentColumns = [
    {
      title: "Payment #",
      dataIndex: "payment_number",
      key: "payment_number",
      render: (text: string) => (
        <Text
          strong
          style={{ color: "#52c41a", cursor: "pointer" }}
          onClick={() => {
            const payment = payments.find((p) => p.payment_number === text);
            if (payment) handleViewPayment(payment);
          }}
        >
          {text}
        </Text>
      ),
    },
    {
      title: "Date",
      dataIndex: "payment_date",
      key: "payment_date",
      render: (date: string) => dayjs(date).format("DD/MM/YYYY"),
    },
    {
      title: "Amount",
      dataIndex: "total_received",
      key: "total_received",
      render: (amount: number) => (
        <Text strong>PKR {amount.toLocaleString()}</Text>
      ),
      align: "right",
    },
    {
      title: "Method",
      dataIndex: "payment_method",
      key: "payment_method",
      render: (method: string) => {
        const methodNames: Record<string, string> = {
          cash: "Cash",
          bank_transfer: "Bank Transfer",
          cheque: "Cheque",
          parchi: "Parchi",
          jazzcash: "JazzCash",
          easypaisa: "EasyPaisa",
        };
        return <Tag color="blue">{methodNames[method] || method}</Tag>;
      },
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status: string) => {
        const statusConfig: Record<string, { color: string; text: string }> = {
          pending: { color: "orange", text: "Pending" },
          completed: { color: "green", text: "Completed" },
          cancelled: { color: "red", text: "Cancelled" },
        };
        const config = statusConfig[status] || {
          color: "default",
          text: status,
        };
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: "Action",
      key: "action",
      render: (_: any, record: Payment) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => handleViewPayment(record)}
        >
          View
        </Button>
      ),
    },
  ];

  // Discount columns
  const discountColumns = [
    {
      title: "Date",
      dataIndex: "date",
      key: "date",
      render: (date: string) => dayjs(date).format("DD/MM/YYYY"),
    },
    {
      title: "Amount",
      dataIndex: "amount",
      key: "amount",
      render: (amount: number) => (
        <Text strong style={{ color: "#52c41a" }}>
          PKR {amount.toLocaleString()}
        </Text>
      ),
      align: "right",
    },
    {
      title: "Reason",
      dataIndex: "reason",
      key: "reason",
      render: (reason: string) => reason || "Discount",
    },
    {
      title: "Reference",
      dataIndex: "reference_number",
      key: "reference_number",
      render: (ref: string) => <Tag color="purple">{ref || "N/A"}</Tag>,
    },
    {
      title: "Action",
      key: "action",
      render: (_: any, record: DiscountEntry) => (
        <Button
          type="link"
          icon={<DeleteOutlined />}
          danger
          onClick={() => handleDeleteDiscount(record)}
        >
          Delete
        </Button>
      ),
    },
  ];

  // Action menu for customer
  const getActionMenu = (): MenuProps => ({
    items: [
      {
        key: "edit",
        label: "Edit",
        icon: <EditOutlined />,
        onClick: handleEditCustomerDirect,
      },
      {
        type: "divider",
      },
      {
        key: "delete",
        label: "Delete",
        icon: <DeleteOutlined />,
        danger: true,
        onClick: handleDeleteCustomer,
      },
    ],
  });

  if (!customer) {
    return null;
  }

  // Calculate total discounts
  const totalDiscounts = discounts.reduce(
    (sum, discount) => sum + (discount.amount || 0),
    0
  );

  // Calculate total payments
  const totalPayments = payments.reduce(
    (sum, payment) => sum + (payment.total_received || 0),
    0
  );

  // Calculate total invoices
  const totalInvoices = invoices.reduce(
    (sum, invoice) => sum + (invoice.total_amount || 0),
    0
  );

  return (
    <div style={{ padding: "24px" }}>
      {/* Header */}
      <Card loading={loading} style={{ marginBottom: 24 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space direction="vertical" size="small">
              <Space>
                <Button
                  type="text"
                  icon={<ArrowLeftOutlined />}
                  onClick={() => navigate("/customers")}
                />
                <Title level={2} style={{ margin: 0 }}>
                  {customer.company_name}
                </Title>
                <Tag color={customer.status === "active" ? "green" : "red"}>
                  {customer.status.toUpperCase()}
                </Tag>
              </Space>
              <Text type="secondary">
                {customer.first_name} {customer.last_name}
              </Text>
            </Space>
          </Col>
          <Col>
            <Space>
              <Button icon={<HistoryOutlined />} onClick={handleViewLedger}>
                View Ledger
              </Button>
              <Button
                icon={<DollarOutlined />}
                onClick={handleReceivePayment}
                type="primary"
              >
                Receive Payment
              </Button>
              <Button
                icon={<FileTextOutlined />}
                onClick={handleCreateInvoice}
                type="primary"
              >
                Create Invoice
              </Button>
              <Dropdown
                menu={getActionMenu()}
                trigger={["click"]}
                overlayStyle={{ zIndex: 1001 }}
              >
                <Button>
                  <Space>
                    Actions
                    <DownOutlined />
                  </Space>
                </Button>
              </Dropdown>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Summary Cards */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Outstanding Balance"
              value={outstandingBalance}
              prefix="PKR "
              valueStyle={{
                color: outstandingBalance > 0 ? "#cf1322" : "#389e0d",
              }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Opening Balance"
              value={customer.opening_balance}
              prefix="PKR "
              valueStyle={{ color: "#1890ff" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Invoices"
              value={totalInvoices}
              prefix="PKR "
              valueStyle={{ color: "#722ed1" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Payments"
              value={totalPayments}
              prefix="PKR "
              valueStyle={{ color: "#52c41a" }}
            />
          </Card>
        </Col>
      </Row>

      {/* Tabs */}
      <Card>
        <Tabs defaultActiveKey="details">
          <TabPane
            tab={
              <span>
                <FileTextOutlined />
                Details
              </span>
            }
            key="details"
          >
            <Descriptions bordered column={2}>
              <Descriptions.Item label="Company Name" span={2}>
                {customer.company_name}
              </Descriptions.Item>
              <Descriptions.Item label="Contact Person">
                {customer.first_name} {customer.last_name}
              </Descriptions.Item>
              <Descriptions.Item label="Mobile">
                {customer.mobile}
              </Descriptions.Item>
              <Descriptions.Item label="Phone">
                {customer.phone || "N/A"}
              </Descriptions.Item>
              <Descriptions.Item label="Email">
                {customer.email || "N/A"}
              </Descriptions.Item>
              <Descriptions.Item label="Website">
                {customer.website || "N/A"}
              </Descriptions.Item>
              <Descriptions.Item label="Address" span={2}>
                {customer.address || "N/A"}
              </Descriptions.Item>
              <Descriptions.Item label="City">
                {customer.city || "N/A"}
              </Descriptions.Item>
              <Descriptions.Item label="State">
                {customer.state || "N/A"}
              </Descriptions.Item>
              <Descriptions.Item label="Country">
                {customer.country || "Pakistan"}
              </Descriptions.Item>
              <Descriptions.Item label="Opening Balance Date">
                {dayjs(customer.as_of_date).format("DD/MM/YYYY")}
              </Descriptions.Item>
              <Descriptions.Item label="Customer Since">
                {dayjs(customer.created_at).format("DD/MM/YYYY")}
              </Descriptions.Item>
              <Descriptions.Item label="Notes" span={2}>
                {customer.notes || "No notes"}
              </Descriptions.Item>
            </Descriptions>
          </TabPane>

          <TabPane
            tab={
              <Badge count={invoices.length} size="small">
                <span>
                  <FileTextOutlined />
                  Invoices ({invoices.length})
                </span>
              </Badge>
            }
            key="invoices"
          >
            <Table
              columns={invoiceColumns}
              dataSource={invoices}
              rowKey="id"
              loading={loading}
              pagination={{ pageSize: 10 }}
              locale={{
                emptyText: "No invoices found for this customer",
              }}
            />
          </TabPane>

          <TabPane
            tab={
              <Badge count={payments.length} size="small">
                <span>
                  <CreditCardOutlined />
                  Payments ({payments.length})
                </span>
              </Badge>
            }
            key="payments"
          >
            <Table
              columns={paymentColumns}
              dataSource={payments}
              rowKey="id"
              loading={loading}
              pagination={{ pageSize: 10 }}
              locale={{
                emptyText: "No payments found for this customer",
              }}
            />
          </TabPane>

          <TabPane
            tab={
              <Badge count={discounts.length} size="small">
                <span>
                  <TagOutlined />
                  Discounts ({discounts.length})
                </span>
              </Badge>
            }
            key="discounts"
          >
            <Table
              columns={discountColumns}
              dataSource={discounts}
              rowKey="id"
              loading={loadingDiscounts}
              pagination={{ pageSize: 10 }}
              locale={{
                emptyText: "No discounts found for this customer",
              }}
              summary={(pageData) => {
                const total = pageData.reduce(
                  (sum, item) => sum + (item.amount || 0),
                  0
                );
                return (
                  <Table.Summary>
                    <Table.Summary.Row>
                      <Table.Summary.Cell index={0} colSpan={2}>
                        <Text strong>Total Discounts</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={1} align="right">
                        <Text strong style={{ color: "#52c41a" }}>
                          PKR {total.toLocaleString()}
                        </Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={2} colSpan={3} />
                    </Table.Summary.Row>
                  </Table.Summary>
                );
              }}
            />
          </TabPane>
        </Tabs>
      </Card>

      {/* Customer Side Panel for editing */}
      <CustomerSidePanel
        visible={sidePanelVisible}
        onClose={() => setSidePanelVisible(false)}
        onSave={handleSaveCustomer}
        loading={saveLoading}
        customer={customer}
      />

      {/* Payment Side Panel */}
      {selectedPayment && (
        <PaymentSidePanel
          visible={paymentSidePanelVisible}
          onClose={() => {
            setPaymentSidePanelVisible(false);
            setSelectedPayment(null);
          }}
          payment={selectedPayment}
          onAllocate={handlePaymentAllocate}
          onEdit={handlePaymentEdit}
          onDelete={handlePaymentDelete}
          onReload={handlePaymentReload}
        />
      )}

      {/* Receive Payment Modal */}
      <ReceivePaymentModal
        visible={receivePaymentModalVisible}
        onCancel={() => setReceivePaymentModalVisible(false)}
        onSuccess={handlePaymentReceived}
        customer={customer}
      />
    </div>
  );
};

export default CustomerDetails;
