// src/components/reports/PaymentDetailsReport.tsx
import React, { useState, useEffect } from "react";
import {
  Table,
  Card,
  Button,
  Space,
  Select,
  DatePicker,
  Row,
  Col,
  Statistic,
  Typography,
  Tag,
  App,
  Dropdown,
  type MenuProps,
  Input,
  Tooltip,
  Divider,
} from "antd";
import {
  DownloadOutlined,
  FilePdfOutlined,
  FileExcelOutlined,
  FilterOutlined,
  EyeOutlined,
  DollarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { Payment, PaymentDistribution } from "../../types";
import { paymentService } from "../../services/paymentService";
import { reportPdfService } from "../../services/reportPdfService";
import dayjs from "dayjs";

const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;
const { Search } = Input;

interface PaymentDetail {
  payment: Payment;
  totalDistributed: number; // Changed from totalDistributed
  remainingAmount: number;
  distributionCount: number; // Changed from DistributionCount
}

const PaymentDetailsReport: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetail[]>([]);
  const [filteredData, setFilteredData] = useState<PaymentDetail[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [dateRange, setDateRange] = useState<any>(null);
  const [searchText, setSearchText] = useState("");
  const [exportLoading, setExportLoading] = useState(false);

  useEffect(() => {
    loadPaymentsDetails();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [selectedMethod, selectedStatus, dateRange, searchText, paymentDetails]);

  const loadPaymentsDetails = async () => {
    setLoading(true);
    try {
      const { payments } = await paymentService.getAllPayments();

      const details = payments.map((payment) => {
        const totalDistributed = // Changed variable name
          payment.distributions?.reduce((sum, dist) => sum + dist.amount, 0) ||
          0; // Changed from Distributions to distributions
        const remainingAmount = payment.total_received - totalDistributed;

        return {
          payment,
          totalDistributed, // Changed
          remainingAmount,
          distributionCount: payment.distributions?.length || 0, // Changed
        };
      });

      setPaymentDetails(details);

      // Extract unique payment methods
      const uniqueMethods = Array.from(
        new Set(
          payments.map((p) => p.payment_method).filter((method) => method)
        )
      ) as string[];
      setPaymentMethods(uniqueMethods);
    } catch (error) {
      console.error("Error loading payments details:", error);
      message.error("Failed to load payments details");
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...paymentDetails];

    // Apply payment method filter
    if (selectedMethod !== "all") {
      filtered = filtered.filter(
        (item) => item.payment.payment_method === selectedMethod
      );
    }

    // Apply status filter
    if (selectedStatus !== "all") {
      filtered = filtered.filter(
        (item) => item.payment.status === selectedStatus
      );
    }

    // Apply date range filter
    if (dateRange && dateRange.length === 2) {
      const [startDate, endDate] = dateRange;
      filtered = filtered.filter((item) => {
        const paymentDate = dayjs(item.payment.payment_date);
        return paymentDate.isAfter(startDate) && paymentDate.isBefore(endDate);
      });
    }

    // Apply search filter
    if (searchText) {
      const searchLower = searchText.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.payment.payment_number.toLowerCase().includes(searchLower) ||
          item.payment.customer?.company_name
            .toLowerCase()
            .includes(searchLower) ||
          (item.payment.reference_number?.toLowerCase() || "").includes(
            searchLower
          )
      );
    }

    setFilteredData(filtered);
  };

  const calculateTotals = () => {
    return filteredData.reduce(
      (acc, item) => ({
        totalReceived: acc.totalReceived + item.payment.total_received,
        totalDistributed: acc.totalDistributed + item.totalDistributed, // Changed
        remainingAmount: acc.remainingAmount + item.remainingAmount,
        paymentCount: acc.paymentCount + 1,
      }),
      {
        totalReceived: 0,
        totalDistributed: 0, // Changed from totalDistributed
        remainingAmount: 0,
        paymentCount: 0,
      }
    );
  };

  const getPaymentMethodColor = (method: string) => {
    const colors: Record<string, string> = {
      cash: "green",
      bank_transfer: "blue",
      cheque: "orange",
      parchi: "purple",
      jazzcash: "red",
      easypaisa: "cyan",
    };
    return colors[method] || "default";
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: "orange",
      completed: "green",
      cancelled: "red",
    };
    return colors[status] || "default";
  };

  const generatePDF = async () => {
    setExportLoading(true);
    try {
      const totals = calculateTotals();

      await reportPdfService.generatePaymentDetailsReportPDF(
        filteredData,
        totals,
        {
          method: selectedMethod,
          status: selectedStatus,
          dateRange: dateRange
            ? `${dateRange[0].format("DD/MM/YYYY")} - ${dateRange[1].format(
                "DD/MM/YYYY"
              )}`
            : null,
        }
      );

      message.success("PDF generated successfully");
    } catch (error) {
      console.error("Error generating PDF:", error);
      message.error("Failed to generate PDF");
    } finally {
      setExportLoading(false);
    }
  };

  const generateExcel = () => {
    setExportLoading(true);
    try {
      const csvContent = convertToCSV(filteredData);
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);

      link.setAttribute("href", url);
      link.setAttribute(
        "download",
        `Payments_Details_Report_${dayjs().format("YYYY-MM-DD")}.csv`
      );

      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      message.success("Excel file exported successfully");
    } catch (error) {
      console.error("Error exporting Excel:", error);
      message.error("Failed to export Excel file");
    } finally {
      setExportLoading(false);
    }
  };

  const convertToCSV = (data: PaymentDetail[]): string => {
    const headers = [
      "Payment Number",
      "Payment Date",
      "Customer",
      "Total Received (PKR)",
      "Payment Method",
      "Status",
      "Reference Number",
      "Bank Name",
      "Cheque Date",
      "Total Distributed (PKR)", // Changed
      "Remaining Amount (PKR)",
      "Distribution Count", // Changed
      "Notes",
    ];

    const rows = data.map((item) => [
      item.payment.payment_number,
      dayjs(item.payment.payment_date).format("DD/MM/YYYY"),
      item.payment.customer?.company_name || "",
      item.payment.total_received,
      item.payment.payment_method,
      item.payment.status,
      item.payment.reference_number || "",
      item.payment.bank_name || "",
      item.payment.cheque_date
        ? dayjs(item.payment.cheque_date).format("DD/MM/YYYY")
        : "",
      item.totalDistributed, // Changed
      item.remainingAmount,
      item.distributionCount, // Changed
      item.payment.notes || "",
    ]);

    const totals = calculateTotals();
    const summaryRows = [
      [],
      ["PAYMENT DETAILS REPORT SUMMARY"],
      ["Total Payments:", totals.paymentCount],
      ["Total Received:", totals.totalReceived],
      ["Total Distributed:", totals.totalDistributed], // Changed
      ["Total Remaining:", totals.remainingAmount],
      [
        "Percentage Distributed:", // Changed
        totals.totalReceived > 0
          ? `${((totals.totalDistributed / totals.totalReceived) * 100).toFixed(
              2
            )}%`
          : "0%",
      ],
      [],
      ["Generated on:", dayjs().format("DD/MM/YYYY HH:mm")],
    ];

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.join(",")),
      ...summaryRows.map((row) => row.join(",")),
    ].join("\n");

    return csvContent;
  };

  const exportMenuItems: MenuProps["items"] = [
    {
      key: "pdf",
      label: "Export as PDF",
      icon: <FilePdfOutlined />,
      onClick: generatePDF,
    },
    {
      key: "excel",
      label: "Export as Excel (CSV)",
      icon: <FileExcelOutlined />,
      onClick: generateExcel,
    },
  ];

  // Detailed columns for payment distribution (like side panel)
  const distributionColumns: ColumnsType<any> = [
    {
      title: "Payee",
      dataIndex: "payee_name",
      key: "payee_name",
      width: 150,
      render: (
        text: string,
        record: any // Changed type
      ) => (
        <div>
          <div style={{ fontWeight: 500 }}>{text}</div>
          <Tag color="blue" style={{ marginTop: 4, fontSize: "11px" }}>
            {record.payee_type.toUpperCase()}
          </Tag>
        </div>
      ),
    },
    {
      title: "Purpose",
      dataIndex: "purpose",
      key: "purpose",
      width: 200,
    },
    {
      title: "Amount",
      dataIndex: "amount",
      key: "amount",
      width: 120,
      render: (amount: number) => (
        <strong style={{ color: "#00b96b", fontSize: "13px" }}>
          PKR {amount.toLocaleString()}
        </strong>
      ),
      align: "right" as const,
    },
    {
      title: "Distribution Date", // Changed
      dataIndex: "distribution_date", // Keep this if database column hasn't changed
      key: "distribution_date",
      width: 120,
      render: (date: string) => dayjs(date).format("DD/MM/YYYY"),
      align: "center" as const,
    },
    {
      title: "Notes",
      dataIndex: "notes",
      key: "notes",
      width: 150,
      render: (notes: string) => notes || "-",
    },
  ];

  // Main payment summary columns
  const columns: ColumnsType<PaymentDetail> = [
    {
      title: "#",
      key: "index",
      width: 60,
      render: (_, __, index) => index + 1,
      align: "center" as const,
    },
    {
      title: "Payment Details",
      key: "payment_details",
      width: 300,
      render: (_, record: PaymentDetail) => (
        <div style={{ lineHeight: 1.4 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 4,
            }}
          >
            <Text strong style={{ fontSize: "14px" }}>
              {record.payment.payment_number}
            </Text>
            <Space size={4}>
              <Tag
                color={getPaymentMethodColor(record.payment.payment_method)}
                style={{ fontSize: "11px" }}
              >
                {record.payment.payment_method.replace("_", " ").toUpperCase()}
              </Tag>
              <Tag
                color={getStatusColor(record.payment.status)}
                style={{ fontSize: "11px" }}
              >
                {record.payment.status.toUpperCase()}
              </Tag>
            </Space>
          </div>
          <div style={{ fontSize: "12px", color: "#666" }}>
            {dayjs(record.payment.payment_date).format("DD/MM/YYYY")}
          </div>
          <div style={{ fontSize: "13px", fontWeight: 500, marginTop: 4 }}>
            {record.payment.customer?.company_name}
          </div>
          {record.payment.reference_number && (
            <div style={{ fontSize: "12px", color: "#666", marginTop: 2 }}>
              Ref: {record.payment.reference_number}
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Amounts",
      key: "amounts",
      width: 250,
      render: (_, record: PaymentDetail) => (
        <div style={{ lineHeight: 1.4 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 4,
            }}
          >
            <Text style={{ fontSize: "12px" }}>Total Received:</Text>
            <Text strong style={{ color: "#00b96b", fontSize: "13px" }}>
              PKR {record.payment.total_received.toLocaleString()}
            </Text>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 4,
            }}
          >
            <Text style={{ fontSize: "12px" }}>Distributed:</Text>{" "}
            {/* Changed */}
            <Text strong style={{ color: "#1890ff", fontSize: "13px" }}>
              PKR {record.totalDistributed.toLocaleString()} {/* Changed */}
            </Text>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <Text style={{ fontSize: "12px" }}>Remaining:</Text>
            <Text
              strong
              style={{
                fontSize: "13px",
                color:
                  record.remainingAmount > 0
                    ? "#faad14"
                    : record.remainingAmount < 0
                    ? "#ff4d4f"
                    : "#00b96b",
              }}
            >
              PKR {record.remainingAmount.toLocaleString()}
            </Text>
          </div>
          {record.distributionCount > 0 && ( // Changed
            <div
              style={{
                fontSize: "11px",
                color: "#666",
                marginTop: 4,
                textAlign: "right",
              }}
            >
              ({record.distributionCount} distribution {/* Changed */}
              {record.distributionCount > 1 ? "s" : ""})
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Bank/Cheque Details",
      key: "bank_details",
      width: 200,
      render: (_, record: PaymentDetail) => (
        <div style={{ lineHeight: 1.4 }}>
          {record.payment.bank_name && (
            <div style={{ fontSize: "12px", marginBottom: 2 }}>
              <Text strong>Bank:</Text> {record.payment.bank_name}
            </div>
          )}
          {record.payment.cheque_date && (
            <div style={{ fontSize: "12px", marginBottom: 2 }}>
              <Text strong>Cheque Date:</Text>{" "}
              {dayjs(record.payment.cheque_date).format("DD/MM/YYYY")}
            </div>
          )}
          {record.payment.notes && (
            <div style={{ fontSize: "11px", color: "#666", marginTop: 4 }}>
              {record.payment.notes.substring(0, 50)}
              {record.payment.notes.length > 50 ? "..." : ""}
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Actions",
      key: "actions",
      width: 100,
      render: (_, record: PaymentDetail) => (
        <Tooltip title="View Detailed Report">
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => generateSinglePaymentPDF(record)}
            loading={exportLoading}
          >
            Report
          </Button>
        </Tooltip>
      ),
      align: "center" as const,
    },
  ];

  const generateSinglePaymentPDF = async (paymentDetail: PaymentDetail) => {
    setExportLoading(true);
    try {
      await reportPdfService.generateSinglePaymentReportPDF(paymentDetail);
      message.success("Payment report generated successfully");
    } catch (error) {
      console.error("Error generating payment report:", error);
      message.error("Failed to generate payment report");
    } finally {
      setExportLoading(false);
    }
  };

  const totals = calculateTotals();

  return (
    <div className="payment-details-report">
      {/* Header */}
      <Card>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <Title level={3} style={{ margin: 0 }}>
              PAYMENT DETAILS REPORT
            </Title>
            <Text type="secondary">
              Comprehensive payment distributions and details - Similar to
              Payment Side Panel
            </Text>
          </div>
          <Space>
            <Dropdown
              menu={{ items: exportMenuItems }}
              placement="bottomRight"
              trigger={["click"]}
            >
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                loading={exportLoading}
              >
                Export All
              </Button>
            </Dropdown>
          </Space>
        </div>
      </Card>

      <div style={{ padding: "24px" }}>
        {/* Summary Cards */}
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Total Payments"
                value={totals.paymentCount}
                valueStyle={{ color: "#1890ff" }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Total Received"
                value={totals.totalReceived}
                prefix="PKR "
                valueStyle={{ color: "#00b96b" }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Total Distributed"
                value={totals.totalDistributed}
                prefix="PKR "
                valueStyle={{ color: "#1890ff" }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Total Remaining"
                value={totals.remainingAmount}
                prefix="PKR "
                valueStyle={{
                  color:
                    totals.remainingAmount > 0
                      ? "#faad14"
                      : totals.remainingAmount < 0
                      ? "#ff4d4f"
                      : "#00b96b",
                }}
              />
            </Card>
          </Col>
        </Row>

        {/* Filters */}
        <Card style={{ marginBottom: 16 }}>
          <Row gutter={16} align="middle">
            <Col xs={24} md={6}>
              <Select
                placeholder="Payment Method"
                style={{ width: "100%" }}
                value={selectedMethod}
                onChange={setSelectedMethod}
                suffixIcon={<FilterOutlined />}
              >
                <Option value="all">All Methods</Option>
                {paymentMethods.map((method) => (
                  <Option key={method} value={method}>
                    {method.replace("_", " ").toUpperCase()}
                  </Option>
                ))}
              </Select>
            </Col>
            <Col xs={24} md={6}>
              <Select
                placeholder="Payment Status"
                style={{ width: "100%" }}
                value={selectedStatus}
                onChange={setSelectedStatus}
                suffixIcon={<FilterOutlined />}
              >
                <Option value="all">All Status</Option>
                <Option value="pending">Pending</Option>
                <Option value="completed">Completed</Option>
                <Option value="cancelled">Cancelled</Option>
              </Select>
            </Col>
            <Col xs={24} md={8}>
              <RangePicker
                style={{ width: "100%" }}
                format="DD/MM/YYYY"
                onChange={setDateRange}
              />
            </Col>
            <Col xs={24} md={4} style={{ textAlign: "right" }}>
              <Button onClick={loadPaymentsDetails} loading={loading}>
                Refresh
              </Button>
            </Col>
          </Row>
          <Row gutter={16} style={{ marginTop: 16 }}>
            <Col xs={24}>
              <Search
                placeholder="Search by payment number, customer, or reference..."
                allowClear
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onSearch={() => applyFilters()}
              />
            </Col>
          </Row>
        </Card>

        {/* Payments Table */}
        <Card>
          <Table
            columns={columns}
            dataSource={filteredData}
            rowKey={(record) => record.payment.id}
            loading={loading}
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) =>
                `${range[0]}-${range[1]} of ${total} payments`,
            }}
            scroll={{ x: 1100 }}
            bordered
            size="middle"
            expandable={{
              expandedRowRender: (record: PaymentDetail) => (
                <div
                  style={{
                    margin: 0,
                    padding: "16px",
                    backgroundColor: "#fafafa",
                  }}
                >
                  <div style={{ marginBottom: 16 }}>
                    <Text strong style={{ fontSize: "14px" }}>
                      Payment Distributions {/* Changed */}
                    </Text>
                    {record.payment.distributions && // Changed
                    record.payment.distributions.length > 0 ? ( // Changed
                      <Table
                        columns={distributionColumns} // Changed
                        dataSource={record.payment.distributions} // Changed
                        pagination={false}
                        size="small"
                        rowKey="id"
                        style={{ marginTop: 12 }}
                      />
                    ) : (
                      <div
                        style={{
                          padding: "20px",
                          textAlign: "center",
                          color: "#999",
                          marginTop: 12,
                        }}
                      >
                        No distributions found for this payment {/* Changed */}
                      </div>
                    )}
                  </div>

                  <Divider style={{ margin: "16px 0" }} />

                  <div>
                    <Text strong style={{ fontSize: "14px" }}>
                      Payment Timeline
                    </Text>
                    <div style={{ marginTop: 12, paddingLeft: 8 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          marginBottom: 12,
                        }}
                      >
                        <ClockCircleOutlined
                          style={{
                            color: "#1890ff",
                            marginRight: 8,
                            marginTop: 2,
                          }}
                        />
                        <div>
                          <div>Payment Received</div>
                          <div style={{ fontSize: "12px", color: "#666" }}>
                            {dayjs(record.payment.created_at).format(
                              "DD/MM/YYYY HH:mm"
                            )}
                          </div>
                        </div>
                      </div>
                      {(record.payment.payment_method === "cheque" ||
                        record.payment.payment_method === "parchi") && (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            marginBottom: 12,
                          }}
                        >
                          <CheckCircleOutlined
                            style={{
                              color:
                                record.payment.status === "completed"
                                  ? "#52c41a"
                                  : "#d9d9d9",
                              marginRight: 8,
                              marginTop: 2,
                            }}
                          />
                          <div>
                            <div>Cleared / Cashed Out</div>
                            <div style={{ fontSize: "12px", color: "#666" }}>
                              {record.payment.status === "completed"
                                ? "Completed"
                                : "Pending"}
                            </div>
                          </div>
                        </div>
                      )}
                      {record.payment.distributions?.map(
                        (
                          dist,
                          index // Changed
                        ) => (
                          <div
                            key={dist.id}
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              marginBottom: 12,
                            }}
                          >
                            <DollarOutlined
                              style={{
                                color: "#52c41a",
                                marginRight: 8,
                                marginTop: 2,
                              }}
                            />
                            <div>
                              <div>Distributed to {dist.payee_name}</div>{" "}
                              {/* Changed */}
                              <div style={{ fontSize: "12px", color: "#666" }}>
                                {dayjs(dist.distribution_date).format(
                                  "DD/MM/YYYY"
                                )}{" "}
                                - PKR {dist.amount.toLocaleString()}
                              </div>
                              <div style={{ fontSize: "12px", color: "#666" }}>
                                Purpose: {dist.purpose}
                              </div>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                </div>
              ),
              rowExpandable: (record) => true,
            }}
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={2} align="right">
                    <Text strong style={{ fontSize: "14px" }}>
                      Totals ({totals.paymentCount} payments)
                    </Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">
                    <div style={{ lineHeight: 1.4 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: 4,
                        }}
                      >
                        <Text style={{ fontSize: "12px" }}>
                          Total Received:
                        </Text>
                        <Text
                          strong
                          style={{ color: "#00b96b", fontSize: "13px" }}
                        >
                          PKR {totals.totalReceived.toLocaleString()}
                        </Text>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: 4,
                        }}
                      >
                        <Text style={{ fontSize: "12px" }}>
                          Total Distributed:
                        </Text>{" "}
                        {/* Changed */}
                        <Text
                          strong
                          style={{ color: "#1890ff", fontSize: "13px" }}
                        >
                          PKR {totals.totalDistributed.toLocaleString()}{" "}
                          {/* Changed */}
                        </Text>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <Text style={{ fontSize: "12px" }}>
                          Total Remaining:
                        </Text>
                        <Text
                          strong
                          style={{
                            fontSize: "13px",
                            color:
                              totals.remainingAmount > 0
                                ? "#faad14"
                                : totals.remainingAmount < 0
                                ? "#ff4d4f"
                                : "#00b96b",
                          }}
                        >
                          PKR {totals.remainingAmount.toLocaleString()}
                        </Text>
                      </div>
                    </div>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={2} colSpan={2} align="center">
                    <Text type="secondary">
                      {totals.totalReceived > 0
                        ? `${(
                            (totals.totalDistributed / totals.totalReceived) *
                            100
                          ) // Changed
                            .toFixed(1)}% distributed` // Changed
                        : "No payments"}
                    </Text>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />
        </Card>
      </div>
    </div>
  );
};

export default PaymentDetailsReport;
