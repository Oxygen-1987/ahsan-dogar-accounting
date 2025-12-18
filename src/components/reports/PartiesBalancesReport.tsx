// src/components/reports/PartiesBalancesReport.tsx
import React, { useState, useEffect } from "react";
import {
  Table,
  Card,
  Button,
  Space,
  Select,
  Row,
  Col,
  Statistic,
  Typography,
  Tag,
  App,
  Dropdown,
  type MenuProps,
  Input,
  DatePicker,
} from "antd";
import {
  DownloadOutlined,
  FilePdfOutlined,
  FileExcelOutlined,
  FilterOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { Customer } from "../types";
import { customerService } from "../../services/customerService";
import { ledgerService } from "../../services/ledgerService";
import { reportPdfService } from "../../services/reportPdfService";
import { supabase } from "../../services/supabaseClient";
import dayjs from "dayjs";

const { Title, Text } = Typography;
const { Option } = Select;
const { Search } = Input;
const { RangePicker } = DatePicker;

interface PartyBalanceSummary {
  customer: Customer;
  totalDebit: number;
  totalCredit: number;
  lastPayment: {
    date: string | null;
    amount: number | null;
    paymentNumber?: string;
  };
  currentBalance: number; // Changed from finalBalance to currentBalance
  lastInvoice: {
    date: string | null;
    amount: number | null;
    invoiceNumber?: string;
  };
  asOfDate: string;
}

const PartiesBalancesReport: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [partyBalances, setPartyBalances] = useState<PartyBalanceSummary[]>([]);
  const [filteredData, setFilteredData] = useState<PartyBalanceSummary[]>([]);
  const [selectedCity, setSelectedCity] = useState<string>("all");
  const [searchText, setSearchText] = useState("");
  const [cities, setCities] = useState<string[]>([]);
  const [exportLoading, setExportLoading] = useState(false);
  const [balanceAsOfDate, setBalanceAsOfDate] = useState<string>(
    dayjs().format("YYYY-MM-DD")
  );
  const [lastPaymentDateRange, setLastPaymentDateRange] = useState<any>(null);

  useEffect(() => {
    loadPartiesBalances();
  }, [balanceAsOfDate]);

  useEffect(() => {
    applyFilters();
  }, [selectedCity, searchText, partyBalances, lastPaymentDateRange]);

  const loadPartiesBalances = async () => {
    setLoading(true);
    try {
      const { customers } = await customerService.getAllCustomers();

      const balances = await Promise.all(
        customers.map(async (customer) => {
          try {
            // Get ledger entries for this customer
            const entries = await ledgerService.getCustomerLedger(customer.id);

            // Calculate totals from ledger
            const totalDebit = entries.reduce(
              (sum, entry) => sum + (entry.debit || 0),
              0
            );
            const totalCredit = entries.reduce(
              (sum, entry) => sum + (entry.credit || 0),
              0
            );

            // Get last payment
            let lastPayment = { date: null, amount: null, paymentNumber: "" };
            try {
              const { data: payments, error: paymentsError } = await supabase
                .from("payments")
                .select("payment_date, total_received, payment_number")
                .eq("customer_id", customer.id)
                .eq("status", "completed")
                .order("payment_date", { ascending: false })
                .limit(1);

              if (!paymentsError && payments && payments.length > 0) {
                lastPayment = {
                  date: payments[0].payment_date,
                  amount: payments[0].total_received,
                  paymentNumber: payments[0].payment_number,
                };
              }
            } catch (paymentError) {
              console.log(
                `Error loading payments for customer ${customer.id}:`,
                paymentError
              );
            }

            // Get last invoice
            let lastInvoice = { date: null, amount: null, invoiceNumber: "" };
            try {
              const { data: invoices, error: invoicesError } = await supabase
                .from("invoices")
                .select("issue_date, total_amount, invoice_number")
                .eq("customer_id", customer.id)
                .order("issue_date", { ascending: false })
                .limit(1);

              if (!invoicesError && invoices && invoices.length > 0) {
                lastInvoice = {
                  date: invoices[0].issue_date,
                  amount: invoices[0].total_amount,
                  invoiceNumber: invoices[0].invoice_number,
                };
              }
            } catch (invoiceError) {
              console.log(
                `Error loading invoices for customer ${customer.id}:`,
                invoiceError
              );
            }

            return {
              customer,
              totalDebit,
              totalCredit,
              lastPayment,
              currentBalance: customer.current_balance || 0, // Use customer's current balance
              lastInvoice,
              asOfDate: balanceAsOfDate,
            };
          } catch (customerError) {
            console.error(
              `Error processing customer ${customer.id}:`,
              customerError
            );
            return {
              customer,
              totalDebit: 0,
              totalCredit: 0,
              lastPayment: { date: null, amount: null, paymentNumber: "" },
              currentBalance: customer.current_balance || 0,
              lastInvoice: { date: null, amount: null, invoiceNumber: "" },
              asOfDate: balanceAsOfDate,
            };
          }
        })
      );

      setPartyBalances(balances);

      // Extract unique cities (for filtering only, not for display)
      const uniqueCities = Array.from(
        new Set(
          balances
            .map((b) => b.customer.city)
            .filter((city) => city && city !== "Unknown")
        )
      ) as string[];
      setCities(uniqueCities);
    } catch (error) {
      console.error("Error loading parties balances:", error);
      message.error("Failed to load parties balances");
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...partyBalances];

    // Apply city filter
    if (selectedCity !== "all") {
      filtered = filtered.filter((item) => item.customer.city === selectedCity);
    }

    // Apply search filter
    if (searchText) {
      const searchLower = searchText.toLowerCase();
      filtered = filtered.filter((item) =>
        item.customer.company_name.toLowerCase().includes(searchLower)
      );
    }

    // Apply last payment date range filter
    if (lastPaymentDateRange && lastPaymentDateRange.length === 2) {
      const [startDate, endDate] = lastPaymentDateRange;
      filtered = filtered.filter((item) => {
        if (!item.lastPayment.date) return false;
        const paymentDate = dayjs(item.lastPayment.date);
        return paymentDate.isAfter(startDate) && paymentDate.isBefore(endDate);
      });
    }

    setFilteredData(filtered);
  };

  const calculateTotals = () => {
    return filteredData.reduce(
      (acc, item) => ({
        totalDebit: acc.totalDebit + item.totalDebit,
        totalCredit: acc.totalCredit + item.totalCredit,
        currentBalance: acc.currentBalance + item.currentBalance,
      }),
      { totalDebit: 0, totalCredit: 0, currentBalance: 0 }
    );
  };

  const generatePDF = async () => {
    setExportLoading(true);
    try {
      const totals = calculateTotals();

      await reportPdfService.generatePartiesBalancesPDF(
        filteredData,
        totals,
        selectedCity,
        balanceAsOfDate
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
        `Parties_Balances_${
          selectedCity !== "all" ? selectedCity + "_" : ""
        }${dayjs().format("YYYY-MM-DD")}.csv`
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

  const convertToCSV = (data: PartyBalanceSummary[]): string => {
    const headers = [
      "#",
      "Party Name",
      "Current Balance (PKR)",
      "Total Debit (PKR)",
      "Total Credit (PKR)",
      "Last Payment Date",
      "Last Payment Amount (PKR)",
      "Last Invoice Date",
      "Last Invoice Amount (PKR)",
      "As of Date",
    ];

    const rows = data.map((item, index) => [
      index + 1,
      item.customer.company_name,
      item.currentBalance,
      item.totalDebit,
      item.totalCredit,
      item.lastPayment.date
        ? dayjs(item.lastPayment.date).format("DD/MM/YYYY")
        : "",
      item.lastPayment.amount || 0,
      item.lastInvoice.date
        ? dayjs(item.lastInvoice.date).format("DD/MM/YYYY")
        : "",
      item.lastInvoice.amount || 0,
      item.asOfDate ? dayjs(item.asOfDate).format("DD/MM/YYYY") : "",
    ]);

    const totals = calculateTotals();
    const summaryRows = [
      [],
      ["SUMMARY"],
      ["Total Parties:", data.length],
      ["Total Debit:", totals.totalDebit],
      ["Total Credit:", totals.totalCredit],
      ["Total Current Balance:", totals.currentBalance],
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

  // Table columns with the new structure
  const columns: ColumnsType<PartyBalanceSummary> = [
    {
      title: "#",
      key: "index",
      width: 60,
      render: (_, __, index) => index + 1,
      align: "center" as const,
    },
    {
      title: "Party Name",
      dataIndex: ["customer", "company_name"],
      key: "company_name",
      width: 200,
      sorter: (a, b) =>
        a.customer.company_name.localeCompare(b.customer.company_name),
    },
    {
      title: "Current Balance",
      dataIndex: "currentBalance",
      key: "currentBalance",
      width: 150,
      render: (balance: number) => (
        <Text
          strong
          style={{
            fontSize: "14px",
            color: balance > 0 ? "#cf1322" : balance < 0 ? "#389e0d" : "#666",
          }}
        >
          PKR {Math.abs(balance).toLocaleString()}
          {balance < 0 && " CR"}
        </Text>
      ),
      align: "right" as const,
      sorter: (a, b) => a.currentBalance - b.currentBalance,
    },
    {
      title: "Total Debit",
      dataIndex: "totalDebit",
      key: "totalDebit",
      width: 130,
      render: (debit: number) => (
        <Text strong style={{ color: "#cf1322", fontSize: "13px" }}>
          PKR {debit.toLocaleString()}
        </Text>
      ),
      align: "right" as const,
      sorter: (a, b) => a.totalDebit - b.totalDebit,
    },
    {
      title: "Total Credit",
      dataIndex: "totalCredit",
      key: "totalCredit",
      width: 130,
      render: (credit: number) => (
        <Text strong style={{ color: "#389e0d", fontSize: "13px" }}>
          PKR {credit.toLocaleString()}
        </Text>
      ),
      align: "right" as const,
      sorter: (a, b) => a.totalCredit - b.totalCredit,
    },
    {
      title: "Last Payment",
      children: [
        {
          title: "Date",
          key: "lastPaymentDate",
          width: 110,
          render: (_, record: PartyBalanceSummary) =>
            record.lastPayment.date ? (
              <div style={{ fontSize: "13px" }}>
                {dayjs(record.lastPayment.date).format("DD/MM/YYYY")}
              </div>
            ) : (
              <Text type="secondary" style={{ fontSize: "12px" }}>
                -
              </Text>
            ),
          align: "center" as const,
        },
        {
          title: "Amount",
          key: "lastPaymentAmount",
          width: 110,
          render: (_, record: PartyBalanceSummary) =>
            record.lastPayment.amount ? (
              <Text
                strong
                style={{
                  color: "#00b96b",
                  fontSize: "13px",
                }}
              >
                PKR {record.lastPayment.amount?.toLocaleString()}
              </Text>
            ) : (
              <Text type="secondary" style={{ fontSize: "12px" }}>
                -
              </Text>
            ),
          align: "right" as const,
        },
      ],
    },
    {
      title: "Last Bill/Invoice",
      children: [
        {
          title: "Date",
          key: "lastInvoiceDate",
          width: 110,
          render: (_, record: PartyBalanceSummary) =>
            record.lastInvoice.date ? (
              <div style={{ fontSize: "13px" }}>
                {dayjs(record.lastInvoice.date).format("DD/MM/YYYY")}
              </div>
            ) : (
              <Text type="secondary" style={{ fontSize: "12px" }}>
                -
              </Text>
            ),
          align: "center" as const,
        },
        {
          title: "Amount",
          key: "lastInvoiceAmount",
          width: 110,
          render: (_, record: PartyBalanceSummary) =>
            record.lastInvoice.amount ? (
              <Text
                strong
                style={{
                  color: "#722ed1",
                  fontSize: "13px",
                }}
              >
                PKR {record.lastInvoice.amount?.toLocaleString()}
              </Text>
            ) : (
              <Text type="secondary" style={{ fontSize: "12px" }}>
                -
              </Text>
            ),
          align: "right" as const,
        },
      ],
    },
  ];

  const totals = calculateTotals();
  const cityHeader =
    selectedCity === "all"
      ? "ALL CITIES"
      : `${selectedCity.toUpperCase()} PARTIES`;

  return (
    <div className="parties-balances-report">
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
              PARTIES BALANCES REPORT
            </Title>
            <Text type="secondary">
              {cityHeader} - As on {dayjs(balanceAsOfDate).format("DD/MM/YYYY")}
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
                Export
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
                title="Total Parties"
                value={filteredData.length}
                valueStyle={{ color: "#1890ff" }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Total Debit"
                value={totals.totalDebit}
                prefix="PKR "
                valueStyle={{ color: "#cf1322" }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Total Credit"
                value={totals.totalCredit}
                prefix="PKR "
                valueStyle={{ color: "#389e0d" }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Net Current Balance"
                value={totals.currentBalance}
                prefix="PKR "
                valueStyle={{
                  color:
                    totals.currentBalance > 0
                      ? "#cf1322"
                      : totals.currentBalance < 0
                      ? "#389e0d"
                      : "#666",
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
                placeholder="Filter by City"
                style={{ width: "100%" }}
                value={selectedCity}
                onChange={setSelectedCity}
                suffixIcon={<FilterOutlined />}
              >
                <Option value="all">All Cities</Option>
                {cities.map((city) => (
                  <Option key={city} value={city}>
                    {city}
                  </Option>
                ))}
              </Select>
            </Col>
            <Col xs={24} md={8}>
              <RangePicker
                placeholder={["Last Payment From", "Last Payment To"]}
                style={{ width: "100%" }}
                format="DD/MM/YYYY"
                onChange={setLastPaymentDateRange}
              />
            </Col>
            <Col xs={24} md={8}>
              <Search
                placeholder="Search by party name..."
                allowClear
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onSearch={() => applyFilters()}
              />
            </Col>
            <Col xs={24} md={2} style={{ textAlign: "right" }}>
              <Button onClick={loadPartiesBalances} loading={loading}>
                Refresh
              </Button>
            </Col>
          </Row>
          <Row gutter={16} style={{ marginTop: 16 }}>
            <Col xs={24} md={6}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Text style={{ whiteSpace: "nowrap" }}>Balance as of:</Text>
                <DatePicker
                  value={dayjs(balanceAsOfDate)}
                  onChange={(date) =>
                    setBalanceAsOfDate(
                      date
                        ? date.format("YYYY-MM-DD")
                        : dayjs().format("YYYY-MM-DD")
                    )
                  }
                  format="DD/MM/YYYY"
                  style={{ width: "100%" }}
                />
              </div>
            </Col>
          </Row>
        </Card>

        {/* Parties Table */}
        <Card>
          <Table
            columns={columns}
            dataSource={filteredData}
            rowKey={(record) => record.customer.id}
            loading={loading}
            pagination={{
              pageSize: 50,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) =>
                `${range[0]}-${range[1]} of ${total} parties`,
            }}
            scroll={{ x: 1200 }}
            bordered
            size="middle"
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={2} align="right">
                    <Text strong style={{ fontSize: "14px" }}>
                      Totals ({filteredData.length} parties)
                    </Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">
                    <Text
                      strong
                      style={{
                        fontSize: "14px",
                        color:
                          totals.currentBalance > 0
                            ? "#cf1322"
                            : totals.currentBalance < 0
                            ? "#389e0d"
                            : "#666",
                      }}
                    >
                      PKR {totals.currentBalance.toLocaleString()}
                    </Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="right">
                    <Text strong style={{ color: "#cf1322", fontSize: "14px" }}>
                      PKR {totals.totalDebit.toLocaleString()}
                    </Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right">
                    <Text strong style={{ color: "#389e0d", fontSize: "14px" }}>
                      PKR {totals.totalCredit.toLocaleString()}
                    </Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} colSpan={4} align="center">
                    {/* Empty cells for Last Payment and Last Invoice columns */}
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

export default PartiesBalancesReport;
