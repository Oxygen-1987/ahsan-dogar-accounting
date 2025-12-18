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
} from "antd";
import {
  ArrowLeftOutlined,
  DownloadOutlined,
  PrinterOutlined,
  FilePdfOutlined,
  FileExcelOutlined,
} from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";
import type { ColumnsType } from "antd/es/table";
import type { LedgerEntry, Customer } from "../types";
import { customerService } from "../services/customerService";
import { ledgerService } from "../services/ledgerService";
import { pdfService } from "../services/pdfService";
import dayjs from "dayjs";
import "./CustomerLedger.css";

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

const CustomerLedger: React.FC = () => {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const { id } = useParams();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<any>(null);
  const [transactionType, setTransactionType] = useState<string>("all");
  const [exportLoading, setExportLoading] = useState(false);

  useEffect(() => {
    if (id) {
      loadCustomerData();
      loadLedgerEntries();
    }
  }, [id, dateRange, transactionType]);

  const loadCustomerData = async () => {
    try {
      const customerData = await customerService.getCustomerById(id!);
      if (customerData) {
        setCustomer(customerData);
      }
    } catch (error) {
      message.error("Failed to load customer data");
    }
  };

  const loadLedgerEntries = async () => {
    setLoading(true);
    try {
      let entries: LedgerEntry[] = [];

      if (dateRange && dateRange.length === 2) {
        const [startDate, endDate] = dateRange;
        entries = await ledgerService.getCustomerLedgerByDate(
          id!,
          startDate.format("YYYY-MM-DD"),
          endDate.format("YYYY-MM-DD")
        );
      } else {
        entries = await ledgerService.getCustomerLedger(id!);
      }

      // Apply type filter
      if (transactionType !== "all") {
        entries = entries.filter((entry) => entry.type === transactionType);
      }

      setLedgerEntries(entries);
    } catch (error) {
      message.error("Failed to load ledger entries");
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePDF = async () => {
    if (!customer) return;

    setExportLoading(true);
    try {
      const summary = calculateSummary();

      // Get period label
      let periodLabel = "All Transactions";
      if (dateRange && dateRange.length === 2) {
        const [startDate, endDate] = dateRange;
        periodLabel = `${startDate.format("DD/MM/YYYY")} to ${endDate.format(
          "DD/MM/YYYY"
        )}`;
      }

      await pdfService.downloadCustomerLedgerPDF(
        customer,
        ledgerEntries,
        {
          ...summary,
          periodStart: dateRange?.[0]?.format("YYYY-MM-DD"),
          periodEnd: dateRange?.[1]?.format("YYYY-MM-DD"),
        },
        periodLabel
      );

      message.success("PDF generated successfully");
    } catch (error) {
      console.error("Error generating PDF:", error);
      message.error("Failed to generate PDF");
    } finally {
      setExportLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportExcel = async () => {
    if (!customer) return;

    setExportLoading(true);
    try {
      // Convert ledger entries to CSV format
      const csvContent = convertToCSV(ledgerEntries, customer);

      // Create and download CSV file
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);

      link.setAttribute("href", url);
      link.setAttribute(
        "download",
        `Ledger_${customer.company_name}_${dayjs().format("YYYY-MM-DD")}.csv`
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

  const convertToCSV = (entries: LedgerEntry[], customer: Customer): string => {
    const headers = [
      "Date",
      "Type",
      "Description",
      "Debit (PKR)",
      "Credit (PKR)",
      "Balance (PKR)",
    ];

    const rows = entries.map((entry) => [
      dayjs(entry.date).format("DD/MM/YYYY"),
      getTypeDisplayName(entry.type),
      entry.description,
      entry.debit,
      entry.credit,
      entry.balance,
    ]);

    const summary = calculateSummary();
    const summaryRows = [
      [],
      ["Customer:", customer.company_name],
      [`${customer.first_name} ${customer.last_name}`],
      [],
      ["SUMMARY"],
      ["Opening Balance:", summary.openingBalance],
      ["Total Debits:", summary.totalDebits],
      ["Total Credits:", summary.totalCredits],
      ["Closing Balance:", summary.closingBalance],
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

  const columns: ColumnsType<LedgerEntry> = [
    {
      title: "#",
      key: "index",
      width: 60,
      render: (_, __, index) => index + 1,
    },
    {
      title: "Date",
      dataIndex: "date",
      key: "date",
      render: (date: string) => dayjs(date).format("DD/MM/YYYY"),
      sorter: (a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf(),
      defaultSortOrder: "ascend",
    },
    {
      title: "Type",
      dataIndex: "type",
      key: "type",
      render: (type: string) => (
        <Tag color={getTypeColor(type)}>{getTypeDisplayName(type)}</Tag>
      ),
      filters: [
        { text: "Opening Balance", value: "opening_balance" },
        { text: "Invoice", value: "invoice" },
        { text: "Payment", value: "payment" },
        { text: "Adjustment", value: "adjustment" },
      ],
      onFilter: (value, record) => record.type === value,
    },
    {
      title: "Description",
      dataIndex: "description",
      key: "description",
      ellipsis: true,
    },
    {
      title: "Debit",
      dataIndex: "debit",
      key: "debit",
      render: (debit: number) =>
        debit > 0 ? (
          <Text strong style={{ color: "#cf1322" }}>
            PKR {debit.toLocaleString()}
          </Text>
        ) : (
          "-"
        ),
      align: "right",
    },
    {
      title: "Credit",
      dataIndex: "credit",
      key: "credit",
      render: (credit: number) =>
        credit > 0 ? (
          <Text strong style={{ color: "#389e0d" }}>
            PKR {credit.toLocaleString()}
          </Text>
        ) : (
          "-"
        ),
      align: "right",
    },
    {
      title: "Balance",
      dataIndex: "balance",
      key: "balance",
      render: (balance: number) => (
        <Text
          strong
          style={{
            color: balance > 0 ? "#cf1322" : balance < 0 ? "#389e0d" : "#666",
          }}
        >
          PKR {balance.toLocaleString()}
        </Text>
      ),
      align: "right",
    },
  ];

  const getTypeColor = (type: string): string => {
    const colors: Record<string, string> = {
      opening_balance: "purple",
      invoice: "blue",
      payment: "green",
      adjustment: "orange",
    };
    return colors[type] || "default";
  };

  const getTypeDisplayName = (type: string): string => {
    const displayNames: Record<string, string> = {
      opening_balance: "Opening Balance",
      invoice: "Invoice",
      payment: "Payment",
      adjustment: "Adjustment",
    };
    return displayNames[type] || type.toUpperCase();
  };

  const calculateSummary = () => {
    // Find opening balance entry
    const openingEntry = ledgerEntries.find(
      (entry) => entry.type === "opening_balance"
    );
    const openingBalance =
      openingEntry?.balance || customer?.opening_balance || 0;

    // Calculate opening balance debit amount (if positive)
    const openingDebit =
      openingEntry?.debit || (openingBalance > 0 ? openingBalance : 0);
    const openingCredit =
      openingEntry?.credit ||
      (openingBalance < 0 ? Math.abs(openingBalance) : 0);

    // Filter entries excluding opening balance for subsequent calculations
    const nonOpeningEntries = ledgerEntries.filter(
      (entry) => entry.type !== "opening_balance"
    );

    let runningBalance = openingBalance;
    const entriesWithCalculatedBalance = nonOpeningEntries.map((entry) => {
      runningBalance =
        runningBalance + (entry.debit || 0) - (entry.credit || 0);
      return {
        ...entry,
        calculated_balance: runningBalance,
      };
    });

    // Calculate totals INCLUDING opening balance
    const totalDebitsIncludingOpening = ledgerEntries.reduce(
      (sum, entry) => sum + (entry.debit || 0),
      0
    );

    const totalCreditsIncludingOpening = ledgerEntries.reduce(
      (sum, entry) => sum + (entry.credit || 0),
      0
    );

    // Calculate totals EXCLUDING opening balance
    const totalDebitsExcludingOpening = nonOpeningEntries.reduce(
      (sum, entry) => sum + (entry.debit || 0),
      0
    );

    const totalCreditsExcludingOpening = nonOpeningEntries.reduce(
      (sum, entry) => sum + (entry.credit || 0),
      0
    );

    // Closing balance should be the last calculated balance
    const closingBalance = runningBalance;

    return {
      openingBalance,
      openingDebit, // Add these if you want to show them separately
      openingCredit,
      closingBalance,
      totalDebits: totalDebitsIncludingOpening, // INCLUDE opening balance in total debits
      totalCredits: totalCreditsIncludingOpening, // INCLUDE opening balance in total credits
      totalDebitsExcludingOpening, // For reference if needed
      totalCreditsExcludingOpening, // For reference if needed
    };
  };

  const { openingBalance, closingBalance, totalDebits, totalCredits } =
    calculateSummary();

  const exportMenuItems: MenuProps["items"] = [
    {
      key: "pdf",
      label: "Export as PDF",
      icon: <FilePdfOutlined />,
      onClick: handleGeneratePDF,
    },
    {
      key: "excel",
      label: "Export as Excel (CSV)",
      icon: <FileExcelOutlined />,
      onClick: handleExportExcel,
    },
  ];

  if (!customer) {
    return null;
  }

  return (
    <div className="customer-ledger-container">
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
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate("/customers")}
            />
            <div>
              <Title level={3} style={{ margin: 0 }}>
                {customer.company_name}
              </Title>
              <Text type="secondary">
                {customer.first_name} {customer.last_name}
              </Text>
            </div>
          </div>
          <Space>
            <Button icon={<PrinterOutlined />} onClick={handlePrint}>
              Print
            </Button>
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
                title="Opening Balance"
                value={openingBalance}
                prefix="PKR "
                valueStyle={{ color: "#1890ff" }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Total Debits"
                value={totalDebits}
                prefix="PKR "
                valueStyle={{ color: "#cf1322" }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Total Credits"
                value={totalCredits}
                prefix="PKR "
                valueStyle={{ color: "#389e0d" }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Closing Balance"
                value={closingBalance}
                prefix="PKR "
                valueStyle={{
                  color:
                    closingBalance > 0
                      ? "#cf1322"
                      : closingBalance < 0
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
                placeholder="Transaction Type"
                style={{ width: "100%" }}
                value={transactionType}
                onChange={setTransactionType}
              >
                <Option value="all">All Types</Option>
                <Option value="opening_balance">Opening Balance</Option>
                <Option value="invoice">Invoices</Option>
                <Option value="payment">Payments</Option>
                <Option value="adjustment">Adjustments</Option>
              </Select>
            </Col>
            <Col xs={24} md={12}>
              <RangePicker
                style={{ width: "100%" }}
                format="DD/MM/YYYY"
                onChange={setDateRange}
              />
            </Col>
            <Col xs={24} md={6} style={{ textAlign: "right" }}>
              <Button onClick={loadLedgerEntries} loading={loading}>
                Refresh
              </Button>
            </Col>
          </Row>
        </Card>

        {/* Ledger Table */}
        <Card>
          <Table
            columns={columns}
            dataSource={ledgerEntries}
            rowKey="id"
            loading={loading}
            pagination={{
              pageSize: 50,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) =>
                `${range[0]}-${range[1]} of ${total} transactions`,
            }}
            scroll={{ x: 1000 }}
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={4}>
                    <Text strong>Totals</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">
                    <Text strong style={{ color: "#cf1322" }}>
                      PKR {totalDebits.toLocaleString()}
                    </Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="right">
                    <Text strong style={{ color: "#389e0d" }}>
                      PKR {totalCredits.toLocaleString()}
                    </Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right">
                    <Text
                      strong
                      style={{
                        color:
                          closingBalance > 0
                            ? "#cf1322"
                            : closingBalance < 0
                            ? "#389e0d"
                            : "#666",
                      }}
                    >
                      PKR {closingBalance.toLocaleString()}
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

export default CustomerLedger;
