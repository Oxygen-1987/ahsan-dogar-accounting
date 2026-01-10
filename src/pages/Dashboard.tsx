import React, { useState, useEffect } from "react";
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Typography,
  DatePicker,
  Spin,
  Alert,
  Button,
  Progress,
  Tooltip,
  Tag,
  Grid,
  Space,
} from "antd";
import {
  UserOutlined,
  FileTextOutlined,
  DollarOutlined,
  ShoppingOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  ReloadOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  MenuOutlined,
} from "@ant-design/icons";
import { customerService } from "../services/customerService";
import { invoiceService } from "../services/invoiceService";
import { paymentService } from "../services/paymentService";
import type { Customer, Invoice, Payment } from "../types";
import dayjs from "dayjs";
import "./Dashboard.css";
import LoadingSpinner from "../components/common/LoadingSpinner";

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { useBreakpoint } = Grid;

interface DashboardStats {
  totalCustomers: number;
  totalInvoices: number;
  totalRevenue: number;
  pendingInvoices: number;
  pendingAmount: number;
  totalPayments: number;
  recentPayments: number;
  collectionEfficiency: number;
  overdueInvoices: number;
  overdueAmount: number;
}

interface RecentActivity {
  key: string;
  type: "invoice" | "payment" | "customer";
  description: string;
  amount: number;
  date: string;
  status: string;
  customerName?: string;
  invoiceNumber?: string;
  paymentNumber?: string;
}

interface InvoiceStatusSummary {
  draft: number;
  sent: number;
  paid: number;
  overdue: number;
  partial: number;
  cancelled: number;
}

interface PaymentMethodSummary {
  cash: number;
  bank_transfer: number;
  cheque: number;
  parchi: number;
  jazzcash: number;
  easypaisa: number;
}

const Dashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalCustomers: 0,
    totalInvoices: 0,
    totalRevenue: 0,
    pendingInvoices: 0,
    pendingAmount: 0,
    totalPayments: 0,
    recentPayments: 0,
    collectionEfficiency: 0,
    overdueInvoices: 0,
    overdueAmount: 0,
  });
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>(
    []
  );
  const [invoiceStatusSummary, setInvoiceStatusSummary] =
    useState<InvoiceStatusSummary>({
      draft: 0,
      sent: 0,
      paid: 0,
      overdue: 0,
      partial: 0,
      cancelled: 0,
    });
  const [paymentMethodSummary, setPaymentMethodSummary] =
    useState<PaymentMethodSummary>({
      cash: 0,
      bank_transfer: 0,
      cheque: 0,
      parchi: 0,
      jazzcash: 0,
      easypaisa: 0,
    });
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(
    null
  );
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mobileMenuVisible, setMobileMenuVisible] = useState(false);

  const screens = useBreakpoint();

  useEffect(() => {
    fetchDashboardData();
  }, [dateRange]);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch all data in parallel
      const [customersData, invoicesData, paymentsData] = await Promise.all([
        customerService.getAllCustomers(),
        invoiceService.getAllInvoices(),
        paymentService.getAllPayments(),
      ]);

      setCustomers(customersData.customers);
      setInvoices(invoicesData.invoices);
      setPayments(paymentsData.payments);

      // Calculate dashboard statistics
      calculateDashboardStats(
        customersData,
        invoicesData,
        paymentsData,
        dateRange
      );

      // Generate recent activities
      generateRecentActivities(
        invoicesData.invoices,
        paymentsData.payments,
        customersData.customers
      );
    } catch (err) {
      console.error("Error fetching dashboard data:", err);
      setError("Failed to load dashboard data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const calculateDashboardStats = (
    customersData: any,
    invoicesData: any,
    paymentsData: any,
    range: [dayjs.Dayjs, dayjs.Dayjs] | null
  ) => {
    const { customers } = customersData;
    const { invoices, summary: invoiceSummary } = invoicesData;
    const { payments, summary: paymentSummary } = paymentsData;

    // Filter by date range if provided
    let filteredInvoices = invoices;
    let filteredPayments = payments;

    if (range) {
      const [startDate, endDate] = range;
      filteredInvoices = invoices.filter((invoice: Invoice) => {
        const invoiceDate = dayjs(invoice.issue_date);
        return invoiceDate.isAfter(startDate) && invoiceDate.isBefore(endDate);
      });

      filteredPayments = payments.filter((payment: Payment) => {
        const paymentDate = dayjs(payment.payment_date);
        return paymentDate.isAfter(startDate) && paymentDate.isBefore(endDate);
      });
    }

    // Calculate stats
    const totalCustomers = customers.length;
    const totalInvoices = filteredInvoices.length;
    const totalRevenue = filteredInvoices.reduce(
      (sum: number, invoice: Invoice) => sum + (invoice.total_amount || 0),
      0
    );

    const pendingInvoices = filteredInvoices.filter(
      (invoice: Invoice) =>
        invoice.status !== "paid" && invoice.status !== "cancelled"
    ).length;

    const pendingAmount = filteredInvoices.reduce(
      (sum: number, invoice: Invoice) => sum + (invoice.pending_amount || 0),
      0
    );

    const totalPayments = filteredPayments.length;
    const recentPayments = filteredPayments
      .filter((payment: Payment) => payment.status === "completed")
      .reduce(
        (sum: number, payment: Payment) => sum + payment.total_received,
        0
      );

    const collectionEfficiency =
      totalRevenue > 0
        ? parseFloat(((recentPayments / totalRevenue) * 100).toFixed(2)) // Round to 2 decimal places
        : 0;

    const overdueInvoices = filteredInvoices.filter((invoice: Invoice) => {
      if (invoice.status === "paid" || invoice.status === "cancelled")
        return false;
      const dueDate = dayjs(invoice.due_date);
      return dueDate.isBefore(dayjs()) && invoice.pending_amount > 0;
    }).length;

    const overdueAmount = filteredInvoices.reduce(
      (sum: number, invoice: Invoice) => {
        if (invoice.status === "paid" || invoice.status === "cancelled")
          return sum;
        const dueDate = dayjs(invoice.due_date);
        if (dueDate.isBefore(dayjs()) && invoice.pending_amount > 0) {
          return sum + invoice.pending_amount;
        }
        return sum;
      },
      0
    );

    setStats({
      totalCustomers,
      totalInvoices,
      totalRevenue,
      pendingInvoices,
      pendingAmount,
      totalPayments,
      recentPayments,
      collectionEfficiency,
      overdueInvoices,
      overdueAmount,
    });
  };

  const generateRecentActivities = (
    invoices: Invoice[],
    payments: Payment[],
    customers: Customer[]
  ) => {
    const activities: RecentActivity[] = [];

    // Add recent invoices
    const recentInvoices = [...invoices]
      .sort((a, b) => dayjs(b.created_at).unix() - dayjs(a.created_at).unix())
      .slice(0, 5);

    recentInvoices.forEach((invoice) => {
      activities.push({
        key: `invoice-${invoice.id}`,
        type: "invoice",
        description: `Invoice ${invoice.invoice_number} created`,
        amount: invoice.total_amount,
        date: invoice.created_at,
        status: invoice.status,
        customerName: invoice.customer?.company_name,
        invoiceNumber: invoice.invoice_number,
      });
    });

    // Add recent payments
    const recentPayments = [...payments]
      .sort((a, b) => dayjs(b.created_at).unix() - dayjs(a.created_at).unix())
      .slice(0, 5);

    recentPayments.forEach((payment) => {
      activities.push({
        key: `payment-${payment.id}`,
        type: "payment",
        description: `Payment ${payment.payment_number} received`,
        amount: payment.total_received,
        date: payment.created_at,
        status: payment.status,
        customerName: payment.customer?.company_name,
        paymentNumber: payment.payment_number,
      });
    });

    // Add recent customers
    const recentCustomers = [...customers]
      .sort((a, b) => dayjs(b.created_at).unix() - dayjs(a.created_at).unix())
      .slice(0, 3);

    recentCustomers.forEach((customer) => {
      activities.push({
        key: `customer-${customer.id}`,
        type: "customer",
        description: `New customer ${customer.company_name} added`,
        amount: customer.opening_balance,
        date: customer.created_at,
        status: "active",
        customerName: customer.company_name,
      });
    });

    // Sort all activities by date
    activities.sort((a, b) => dayjs(b.date).unix() - dayjs(a.date).unix());

    setRecentActivities(activities.slice(0, 10));
  };

  const calculateInvoiceStatusSummary = (invoices: Invoice[]) => {
    const summary: InvoiceStatusSummary = {
      draft: 0,
      sent: 0,
      paid: 0,
      overdue: 0,
      partial: 0,
      cancelled: 0,
    };

    invoices.forEach((invoice) => {
      if (invoice.status in summary) {
        summary[invoice.status as keyof InvoiceStatusSummary]++;
      }
    });

    setInvoiceStatusSummary(summary);
  };

  const calculatePaymentMethodSummary = (payments: Payment[]) => {
    const summary: PaymentMethodSummary = {
      cash: 0,
      bank_transfer: 0,
      cheque: 0,
      parchi: 0,
      jazzcash: 0,
      easypaisa: 0,
    };

    payments.forEach((payment) => {
      if (payment.payment_method in summary) {
        summary[payment.payment_method as keyof PaymentMethodSummary]++;
      }
    });

    setPaymentMethodSummary(summary);
  };

  const handleDateRangeChange = (dates: any) => {
    setDateRange(dates);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft":
        return "default";
      case "sent":
        return "processing";
      case "paid":
        return "success";
      case "overdue":
        return "error";
      case "partial":
        return "warning";
      case "cancelled":
        return "default";
      default:
        return "default";
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "invoice":
        return <FileTextOutlined />;
      case "payment":
        return <DollarOutlined />;
      case "customer":
        return <UserOutlined />;
      default:
        return null;
    }
  };

  const getActivityColumns = () => {
    if (screens.xs) {
      return [
        {
          title: "Activity",
          key: "mobile-view",
          render: (record: RecentActivity) => (
            <div style={{ padding: "8px 0" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 4,
                }}
              >
                <Space>
                  {getTypeIcon(record.type)}
                  <Text strong style={{ textTransform: "capitalize" }}>
                    {record.type}
                  </Text>
                </Space>
                <Tag
                  color={getStatusColor(record.status)}
                  style={{ fontSize: "10px" }}
                >
                  {record.status}
                </Tag>
              </div>
              <Text style={{ fontSize: "12px", color: "#666" }}>
                {record.description}
              </Text>
              {record.customerName && (
                <Text
                  style={{ fontSize: "11px", color: "#999", display: "block" }}
                >
                  Customer: {record.customerName}
                </Text>
              )}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: 4,
                }}
              >
                <Text style={{ fontSize: "12px" }}>
                  PKR {record.amount?.toLocaleString()}
                </Text>
                <Text style={{ fontSize: "11px", color: "#999" }}>
                  {dayjs(record.date).format("DD/MM/YY")}
                </Text>
              </div>
            </div>
          ),
        },
      ];
    }

    return [
      {
        title: "Type",
        dataIndex: "type",
        key: "type",
        width: screens.md ? 80 : 60,
        render: (type: string) => (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {getTypeIcon(type)}
            {screens.md && (
              <span style={{ textTransform: "capitalize" }}>{type}</span>
            )}
          </div>
        ),
      },
      {
        title: "Description",
        dataIndex: "description",
        key: "description",
        ellipsis: true,
      },
      screens.md && {
        title: "Customer",
        dataIndex: "customerName",
        key: "customerName",
        render: (name: string) => name || "-",
        ellipsis: true,
      },
      {
        title: "Amount",
        dataIndex: "amount",
        key: "amount",
        width: screens.md ? 120 : 100,
        render: (amount: number) =>
          amount ? <Text strong>PKR {amount.toLocaleString()}</Text> : "-",
      },
      {
        title: "Date",
        dataIndex: "date",
        key: "date",
        width: screens.md ? 150 : 100,
        render: (date: string) => (
          <Tooltip title={dayjs(date).format("DD/MM/YYYY HH:mm")}>
            {dayjs(date).format(screens.md ? "DD/MM/YYYY" : "DD/MM/YY")}
          </Tooltip>
        ),
      },
      {
        title: "Status",
        dataIndex: "status",
        key: "status",
        width: screens.md ? 100 : 80,
        render: (status: string) => {
          if (!status) return <Tag>-</Tag>;
          return (
            <Tag
              color={getStatusColor(status)}
              style={{
                fontSize: screens.xs ? "10px" : "12px",
                padding: screens.xs ? "0 4px" : "2px 8px",
              }}
            >
              {status.charAt(0).toUpperCase()}
              {screens.sm && status.slice(1)}
            </Tag>
          );
        },
      },
    ].filter(Boolean);
  };

  if (loading) {
    return <LoadingSpinner />; // REPLACE THIS LINE
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <Title
          level={2}
          style={{
            margin: 0,
            color: "#1f2937",
            fontSize: screens.xs ? "20px" : "24px",
          }}
        >
          Dashboard Overview
        </Title>
        <div className="dashboard-controls">
          {screens.md ? (
            <Space>
              <RangePicker
                onChange={handleDateRangeChange}
                format="DD/MM/YYYY"
                placeholder={["Start Date", "End Date"]}
                style={{ width: screens.lg ? 300 : 250 }}
                suffixIcon={<CalendarOutlined />}
                size={screens.xs ? "small" : "middle"}
              />
              <Button
                icon={<ReloadOutlined />}
                onClick={fetchDashboardData}
                loading={loading}
                size={screens.xs ? "small" : "middle"}
              >
                {screens.sm && "Refresh"}
              </Button>
            </Space>
          ) : (
            <Space>
              <Button
                icon={<CalendarOutlined />}
                onClick={() => {
                  /* Mobile date picker modal */
                }}
                size="small"
                type="text"
              />
              <Button
                icon={<ReloadOutlined />}
                onClick={fetchDashboardData}
                loading={loading}
                size="small"
                type="text"
              />
            </Space>
          )}
        </div>
      </div>

      {error && (
        <Alert
          message="Error"
          description={error}
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setError(null)}
        />
      )}

      {/* Key Statistics */}
      <Row gutter={[12, 12]}>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" className="stat-card">
            <Statistic
              title="Total Customers"
              value={stats.totalCustomers}
              prefix={<UserOutlined />}
              valueStyle={{
                color: "#00b96b",
                fontSize: screens.xs ? "18px" : "24px",
              }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" className="stat-card">
            <Statistic
              title="Total Invoices"
              value={stats.totalInvoices}
              prefix={<FileTextOutlined />}
              valueStyle={{
                color: "#1890ff",
                fontSize: screens.xs ? "18px" : "24px",
              }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" className="stat-card">
            <Statistic
              title="Total Revenue"
              value={stats.totalRevenue}
              prefix="PKR "
              valueStyle={{
                color: "#52c41a",
                fontSize: screens.xs ? "18px" : "24px",
              }}
              formatter={(value) =>
                value.toLocaleString("en-PK", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })
              }
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" className="stat-card">
            <Statistic
              title="Pending Amount"
              value={stats.pendingAmount}
              prefix="PKR "
              valueStyle={{
                color: "#fa8c16",
                fontSize: screens.xs ? "18px" : "24px",
              }}
              formatter={(value) =>
                value.toLocaleString("en-PK", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })
              }
            />
          </Card>
        </Col>
      </Row>

      {/* Second Row Statistics - Show only on medium+ screens */}
      {screens.md && (
        <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
          <Col xs={24} sm={12} md={6}>
            <Card size="small" className="stat-card">
              <Statistic
                title="Pending Invoices"
                value={stats.pendingInvoices}
                valueStyle={{ color: "#faad14" }}
                suffix={`/ ${stats.totalInvoices}`}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small" className="stat-card">
              <Statistic
                title="Recent Payments"
                value={stats.recentPayments}
                prefix="PKR "
                valueStyle={{ color: "#722ed1" }}
                formatter={(value) =>
                  value.toLocaleString("en-PK", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })
                }
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small" className="stat-card">
              <Statistic
                title="Collection Efficiency"
                value={stats.collectionEfficiency}
                suffix="%"
                valueStyle={{
                  color:
                    stats.collectionEfficiency > 80
                      ? "#52c41a"
                      : stats.collectionEfficiency > 50
                      ? "#faad14"
                      : "#f5222d",
                }}
                prefix={
                  stats.collectionEfficiency > 50 ? (
                    <ArrowUpOutlined />
                  ) : (
                    <ArrowDownOutlined />
                  )
                }
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small" className="stat-card">
              <Statistic
                title="Overdue Invoices"
                value={stats.overdueInvoices}
                valueStyle={{ color: "#f5222d" }}
                prefix={<ExclamationCircleOutlined />}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* Charts and Additional Information */}
      <Row gutter={[12, 12]} style={{ marginTop: 16 }}>
        {/* Recent Activities */}
        <Col xs={24} lg={screens.lg ? 16 : 24}>
          <Card
            title="Recent Activities"
            size="small"
            className="activity-card"
            bodyStyle={{ padding: screens.xs ? "8px" : "16px" }}
          >
            <Table
              dataSource={recentActivities}
              columns={getActivityColumns() as any}
              size="small"
              pagination={{
                pageSize: screens.xs ? 3 : 5,
                simple: screens.xs,
                size: screens.xs ? "small" : "default",
              }}
              scroll={screens.xs ? { x: 300 } : { x: 800 }}
              rowKey="key"
              className="activity-table"
            />
          </Card>
        </Col>

        {/* Invoice Status Summary - Hide on extra small screens */}
        {screens.sm && (
          <Col xs={24} lg={screens.lg ? 8 : 24}>
            <Card title="Invoice Status" size="small" className="summary-card">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {Object.entries(invoiceStatusSummary).map(([status, count]) => (
                  <div
                    key={status}
                    style={{ display: "flex", alignItems: "center" }}
                  >
                    <Tag
                      color={getStatusColor(status)}
                      style={{
                        width: screens.md ? 80 : 60,
                        textAlign: "center",
                        fontSize: screens.xs ? "10px" : "12px",
                        padding: screens.xs ? "0 4px" : "2px 8px",
                      }}
                    >
                      {status.charAt(0).toUpperCase()}
                      {screens.md && status.slice(1)}
                    </Tag>
                    <Progress
                      percent={Math.round((count / stats.totalInvoices) * 100)}
                      style={{ flex: 1, margin: "0 8px" }}
                      size="small"
                      showInfo={screens.md}
                      strokeColor={
                        status === "paid"
                          ? "#52c41a"
                          : status === "overdue"
                          ? "#f5222d"
                          : status === "partial"
                          ? "#faad14"
                          : "#1890ff"
                      }
                    />
                    {screens.md && <Text strong>{count}</Text>}
                  </div>
                ))}
              </div>
            </Card>
          </Col>
        )}
      </Row>

      {/* Quick Stats - Responsive layout */}
      <Row gutter={[12, 12]} style={{ marginTop: 16 }}>
        <Col xs={24} sm={12} md={8}>
          <Card title="Quick Actions" size="small" className="action-card">
            <Space direction="vertical" style={{ width: "100%" }}>
              <Button
                type="primary"
                block
                href="/invoices/create"
                size={screens.xs ? "small" : "middle"}
              >
                New Invoice
              </Button>
              <Button
                type="default"
                block
                href="/payments"
                size={screens.xs ? "small" : "middle"}
              >
                Receive Payment
              </Button>
              <Button
                type="default"
                block
                href="/customers"
                size={screens.xs ? "small" : "middle"}
              >
                Add Customer
              </Button>
              <Button
                type="default"
                block
                href="/reports"
                size={screens.xs ? "small" : "middle"}
              >
                View Reports
              </Button>
            </Space>
          </Card>
        </Col>

        {screens.sm && (
          <>
            <Col xs={24} sm={12} md={8}>
              <Card
                title="Performance"
                size="small"
                className="performance-card"
              >
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 12 }}
                >
                  <div>
                    <Text style={{ fontSize: screens.xs ? "12px" : "14px" }}>
                      Collection Rate
                    </Text>
                    <Progress
                      percent={Math.round(stats.collectionEfficiency)}
                      status={
                        stats.collectionEfficiency > 80
                          ? "success"
                          : stats.collectionEfficiency > 50
                          ? "active"
                          : "exception"
                      }
                      size="small"
                    />
                  </div>
                  <div>
                    <Text style={{ fontSize: screens.xs ? "12px" : "14px" }}>
                      Invoice Completion
                    </Text>
                    <Progress
                      percent={Math.round(
                        ((stats.totalInvoices - stats.pendingInvoices) /
                          stats.totalInvoices) *
                          100
                      )}
                      status="active"
                      size="small"
                    />
                  </div>
                </div>
              </Card>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Card title="Overdue" size="small" className="overdue-card">
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ fontSize: screens.xs ? "12px" : "14px" }}>
                      Invoices:
                    </Text>
                    <Text
                      strong
                      style={{
                        color: "#f5222d",
                        fontSize: screens.xs ? "12px" : "14px",
                      }}
                    >
                      {stats.overdueInvoices}
                    </Text>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ fontSize: screens.xs ? "12px" : "14px" }}>
                      Amount:
                    </Text>
                    <Text
                      strong
                      style={{
                        color: "#f5222d",
                        fontSize: screens.xs ? "12px" : "14px",
                      }}
                    >
                      PKR {stats.overdueAmount.toLocaleString()}
                    </Text>
                  </div>
                  <Button
                    type="primary"
                    danger
                    block
                    href="/invoices?status=overdue"
                    size={screens.xs ? "small" : "middle"}
                    style={{ marginTop: 8 }}
                  >
                    View Overdue
                  </Button>
                </div>
              </Card>
            </Col>
          </>
        )}
      </Row>

      {/* Mobile-only quick stats summary */}
      {!screens.sm && (
        <Row gutter={[12, 12]} style={{ marginTop: 16 }}>
          <Col xs={24}>
            <Card
              title="Quick Summary"
              size="small"
              className="mobile-summary-card"
            >
              <Row gutter={[12, 12]}>
                <Col xs={12}>
                  <div style={{ textAlign: "center" }}>
                    <Text style={{ fontSize: "12px", color: "#666" }}>
                      Pending
                    </Text>
                    <div
                      style={{
                        fontSize: "16px",
                        fontWeight: "bold",
                        color: "#fa8c16",
                      }}
                    >
                      {stats.pendingInvoices}
                    </div>
                  </div>
                </Col>
                <Col xs={12}>
                  <div style={{ textAlign: "center" }}>
                    <Text style={{ fontSize: "12px", color: "#666" }}>
                      Overdue
                    </Text>
                    <div
                      style={{
                        fontSize: "16px",
                        fontWeight: "bold",
                        color: "#f5222d",
                      }}
                    >
                      {stats.overdueInvoices}
                    </div>
                  </div>
                </Col>
                <Col xs={12}>
                  <div style={{ textAlign: "center" }}>
                    <Text style={{ fontSize: "12px", color: "#666" }}>
                      Collected
                    </Text>
                    <div
                      style={{
                        fontSize: "16px",
                        fontWeight: "bold",
                        color: "#52c41a",
                      }}
                    >
                      PKR {stats.recentPayments.toLocaleString()}
                    </div>
                  </div>
                </Col>
                <Col xs={12}>
                  <div style={{ textAlign: "center" }}>
                    <Text style={{ fontSize: "12px", color: "#666" }}>
                      Efficiency
                    </Text>
                    <div
                      style={{
                        fontSize: "16px",
                        fontWeight: "bold",
                        color:
                          stats.collectionEfficiency > 50
                            ? "#52c41a"
                            : "#f5222d",
                      }}
                    >
                      {Math.round(stats.collectionEfficiency)}%
                    </div>
                  </div>
                </Col>
              </Row>
            </Card>
          </Col>
        </Row>
      )}
    </div>
  );
};

export default Dashboard;
