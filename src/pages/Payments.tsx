import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Table,
  Card,
  Button,
  Space,
  Tag,
  Statistic,
  Row,
  Col,
  Input,
  Select,
  DatePicker,
  Modal,
  Form,
  InputNumber,
  message,
  Popconfirm,
} from "antd";
import {
  PlusOutlined,
  SearchOutlined,
  EyeOutlined,
  DollarOutlined,
  ReloadOutlined,
  DeleteOutlined,
  UserOutlined,
} from "@ant-design/icons";
import type { ColumnsType, TablePaginationConfig } from "antd/es/table";
import { paymentService } from "../services/paymentService";
import type {
  Payment,
  PaymentFormData,
  PaymentMethod,
  PaymentStatus,
  PaymentFilters,
} from "../types";
import dayjs from "dayjs";
import debounce from "lodash/debounce";
import ReceivePaymentModal from "../components/payments/ReceivePaymentModal";
import PaymentSidePanel from "../components/payments/PaymentSidePanel";
import LoadingSpinner from "../components/common/LoadingSpinner";

const { Search } = Input;
const { Option } = Select;
const { RangePicker } = DatePicker;

const Payments: React.FC = () => {
  const [allPayments, setAllPayments] = useState<Payment[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [summary, setSummary] = useState<any>({});

  // Search and filters
  const [searchText, setSearchText] = useState("");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<any>(null);

  // Pagination
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 50,
    total: 0,
    showSizeChanger: true,
    showQuickJumper: true,
    showTotal: (total: number, range: [number, number]) =>
      `${range[0]}-${range[1]} of ${total} payments`,
  });

  // Extract unique customers for filter
  const [customers, setCustomers] = useState<
    Array<{
      id: string;
      company_name: string;
      first_name: string;
      last_name: string;
    }>
  >([]);

  // Modals and panels
  const [isReceivePaymentModalVisible, setIsReceivePaymentModalVisible] =
    useState(false);
  const [isDistributionModalVisible, setIsDistributionModalVisible] =
    useState(false);
  const [isSidePanelVisible, setIsSidePanelVisible] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);

  // Load initial data ONCE
  useEffect(() => {
    const loadInitialData = async () => {
      setInitialLoading(true);
      try {
        const result = await paymentService.getAllPayments();
        const allPaymentsData = result.payments || [];

        setAllPayments(allPaymentsData);

        // Extract unique customers
        const uniqueCustomersMap = new Map();
        allPaymentsData.forEach((payment: Payment) => {
          if (
            payment.customer &&
            !uniqueCustomersMap.has(payment.customer.id)
          ) {
            uniqueCustomersMap.set(payment.customer.id, payment.customer);
          }
        });
        setCustomers(Array.from(uniqueCustomersMap.values()));

        // Apply initial filtering
        applyFiltersAndUpdateUI(allPaymentsData);
      } catch (error) {
        console.error("Failed to load payments:", error);
        message.error("Failed to load payments");
        setAllPayments([]);
        setPayments([]);
        setCustomers([]);
        setSummary({});
      } finally {
        setInitialLoading(false);
        setLoading(false);
      }
    };

    loadInitialData();
  }, []);

  // Function to apply all filters and update UI
  const applyFiltersAndUpdateUI = useCallback(
    (dataToFilter: Payment[]) => {
      setLoading(true);

      try {
        let filteredPayments = [...dataToFilter];

        // Apply payment method filter
        if (paymentMethodFilter !== "all") {
          filteredPayments = filteredPayments.filter(
            (payment) => payment.payment_method === paymentMethodFilter,
          );
        }

        // Apply status filter
        if (statusFilter !== "all") {
          filteredPayments = filteredPayments.filter(
            (payment) => payment.status === statusFilter,
          );
        }

        // Apply customer filter
        if (customerFilter !== "all") {
          filteredPayments = filteredPayments.filter(
            (payment) => payment.customer_id === customerFilter,
          );
        }

        // Apply date range filter
        if (dateRange && dateRange[0] && dateRange[1]) {
          const startDate = dateRange[0];
          const endDate = dateRange[1];

          filteredPayments = filteredPayments.filter((payment) => {
            const paymentDate = dayjs(payment.payment_date);
            return (
              paymentDate.isAfter(startDate.subtract(1, "day")) &&
              paymentDate.isBefore(endDate.add(1, "day"))
            );
          });
        }

        // Apply search filter LAST
        if (searchText) {
          const searchLower = searchText.toLowerCase();
          filteredPayments = filteredPayments.filter((payment) => {
            return (
              payment.payment_number?.toLowerCase().includes(searchLower) ||
              payment.customer?.company_name
                ?.toLowerCase()
                .includes(searchLower) ||
              payment.customer?.first_name
                ?.toLowerCase()
                .includes(searchLower) ||
              payment.customer?.last_name
                ?.toLowerCase()
                .includes(searchLower) ||
              payment.reference_number?.toLowerCase().includes(searchLower)
            );
          });
        }

        // Calculate totals for summary
        const total = filteredPayments.length;
        const totalReceived = filteredPayments.reduce(
          (sum, payment) => sum + payment.total_received,
          0,
        );
        const totalDistributed = filteredPayments.reduce(
          (sum, payment) =>
            sum +
            (payment.distributions?.reduce(
              (distSum, dist) => distSum + dist.amount,
              0,
            ) || 0),
          0,
        );

        // Paginate
        const startIndex = (pagination.current - 1) * pagination.pageSize;
        const endIndex = startIndex + pagination.pageSize;
        const paginatedPayments = filteredPayments.slice(startIndex, endIndex);

        // Update state
        setPayments(paginatedPayments);
        setPagination((prev) => ({ ...prev, total }));
        setSummary({
          totalPayments: total,
          totalReceived,
          totalDistributed,
          availableForDistribution: totalReceived - totalDistributed,
        });
      } catch (error) {
        console.error("Error applying filters:", error);
      } finally {
        setLoading(false);
      }
    },
    [
      paymentMethodFilter,
      statusFilter,
      customerFilter,
      dateRange,
      searchText,
      pagination.current,
      pagination.pageSize,
    ],
  );

  // Apply filters when filter values change
  useEffect(() => {
    if (!initialLoading && allPayments.length > 0) {
      setPagination((prev) => ({ ...prev, current: 1 }));
      applyFiltersAndUpdateUI(allPayments);
    }
  }, [
    paymentMethodFilter,
    statusFilter,
    customerFilter,
    dateRange,
    initialLoading,
  ]);

  // Apply filters when pagination changes
  useEffect(() => {
    if (!initialLoading && allPayments.length > 0) {
      applyFiltersAndUpdateUI(allPayments);
    }
  }, [searchText, initialLoading]);

  // Debounced search handler - NO API CALLS
  const debouncedSearch = useMemo(
    () =>
      debounce((searchValue: string) => {
        setSearchText(searchValue);
      }, 300),
    [],
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    debouncedSearch(e.target.value);
  };

  const handleSearch = (value: string) => {
    setSearchText(value);
  };

  const handleClearSearch = () => {
    setSearchText("");
  };

  const handleTableChange = (newPagination: TablePaginationConfig) => {
    setPagination((prev) => ({
      ...prev,
      current: newPagination.current || 1,
      pageSize: newPagination.pageSize || 50,
    }));
  };

  const getPaymentMethodColor = (method: PaymentMethod) => {
    const colors: Record<PaymentMethod, string> = {
      cash: "green",
      bank_transfer: "blue",
      cheque: "orange",
      parchi: "purple",
      jazzcash: "red",
      easypaisa: "cyan",
    };
    return colors[method];
  };

  const getStatusColor = (status: PaymentStatus) => {
    const colors: Record<PaymentStatus, string> = {
      pending: "orange",
      completed: "green",
      cancelled: "red",
      partial: "blue",
    };
    return colors[status];
  };

  const handleViewPayment = (payment: Payment) => {
    setSelectedPayment(payment);
    setIsSidePanelVisible(true);
  };

  const handleAddDistribution = (payment: Payment) => {
    setSelectedPayment(payment);
    setIsDistributionModalVisible(true);
  };

  const handleReceivePayment = () => {
    setIsReceivePaymentModalVisible(true);
  };

  const handleRowClick = (record: Payment) => {
    handleViewPayment(record);
  };

  const handleDeletePayment = async (payment: Payment) => {
    Modal.confirm({
      title: "Delete Payment",
      content: (
        <div>
          <p>
            Are you sure you want to delete payment{" "}
            <strong>{payment.payment_number}</strong>?
          </p>
          <p style={{ color: "#ff4d4f" }}>
            <strong>Warning:</strong> This will reverse any invoice payments
            associated with this payment.
          </p>
        </div>
      ),
      okText: "Delete",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        try {
          console.log("Deleting payment:", payment.id);
          const hideLoading = message.loading({
            content: "Deleting payment...",
            key: "deletePayment",
            duration: 0,
          });

          await paymentService.deletePayment(payment.id);

          message.success({
            content: "Payment deleted successfully",
            key: "deletePayment",
            duration: 3,
          });

          // Refresh data
          const result = await paymentService.getAllPayments();
          const allPaymentsData = result.payments || [];
          setAllPayments(allPaymentsData);
          applyFiltersAndUpdateUI(allPaymentsData);

          if (selectedPayment?.id === payment.id) {
            setIsSidePanelVisible(false);
            setSelectedPayment(null);
          }
          if (
            isDistributionModalVisible &&
            selectedPayment?.id === payment.id
          ) {
            setIsDistributionModalVisible(false);
            setSelectedPayment(null);
          }
        } catch (error: any) {
          console.error("Delete payment error:", error);
          let errorMessage = "Failed to delete payment";
          if (error.message) {
            errorMessage += `: ${error.message}`;
          }
          message.error({
            content: errorMessage,
            key: "deletePayment",
            duration: 5,
          });
        }
      },
      centered: true,
    });
  };

  const columns: ColumnsType<Payment> = [
    {
      title: "Payment Number",
      dataIndex: "payment_number",
      key: "payment_number",
      render: (text: string) => <strong>{text}</strong>,
      sorter: false,
    },
    {
      title: "Customer",
      dataIndex: "customer",
      key: "customer",
      render: (customer: any) =>
        customer ? (
          <div>
            <div>
              <strong>{customer.company_name}</strong>
            </div>
            <div style={{ fontSize: "12px", color: "#666" }}>
              {customer.first_name} {customer.last_name}
            </div>
          </div>
        ) : (
          "N/A"
        ),
      sorter: false,
    },
    {
      title: "Amount",
      dataIndex: "total_received",
      key: "total_received",
      render: (amount: number) => (
        <span style={{ fontWeight: "bold", color: "#00b96b" }}>
          PKR {amount?.toLocaleString() || 0}
        </span>
      ),
      sorter: false,
    },
    {
      title: "Payment Method",
      dataIndex: "payment_method",
      key: "payment_method",
      render: (method: PaymentMethod) => (
        <Tag color={getPaymentMethodColor(method)}>
          {method?.replace("_", " ").toUpperCase()}
        </Tag>
      ),
      sorter: false,
    },
    {
      title: "Date",
      dataIndex: "payment_date",
      key: "payment_date",
      render: (date: string) => dayjs(date).format("DD/MM/YYYY"),
      sorter: false,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status: PaymentStatus) => (
        <Tag color={getStatusColor(status)}>{status?.toUpperCase()}</Tag>
      ),
      sorter: false,
    },
    {
      title: "Distributions",
      key: "distributions",
      render: (_, record) => {
        const totalDistributed =
          record.distributions?.reduce((sum, dist) => sum + dist.amount, 0) ||
          0;
        const remaining = record.total_received - totalDistributed;

        return (
          <div>
            <div>
              Distributed:{" "}
              <strong>PKR {totalDistributed.toLocaleString()}</strong>
            </div>
            <div style={{ fontSize: "12px", color: "#666" }}>
              Remaining:{" "}
              <strong style={{ color: remaining > 0 ? "#faad14" : "#00b96b" }}>
                PKR {remaining.toLocaleString()}
              </strong>
            </div>
          </div>
        );
      },
    },
    {
      title: "Actions",
      key: "actions",
      width: 200,
      render: (_, record) => {
        const canDistribute = () => {
          if (
            record.payment_method === "cheque" ||
            record.payment_method === "parchi"
          ) {
            return record.status === "completed" || record.status === "partial";
          }
          return record.status === "completed" || record.status === "partial";
        };

        return (
          <Space>
            <Button
              icon={<EyeOutlined />}
              size="small"
              onClick={() => handleViewPayment(record)}
            >
              View
            </Button>
            {canDistribute() && (
              <Button
                icon={<DollarOutlined />}
                size="small"
                type="primary"
                onClick={() => handleAddDistribution(record)}
              >
                Distribute
              </Button>
            )}
            <Popconfirm
              title="Delete Payment"
              description="Are you sure you want to delete this payment?"
              onConfirm={() => handleDeletePayment(record)}
              okText="Yes"
              cancelText="No"
              okType="danger"
            >
              <Button icon={<DeleteOutlined />} size="small" danger>
                Delete
              </Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  if (initialLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Payment Management</h1>
        <p style={{ margin: 0, color: "#666" }}>
          Receive payments and distribute funds to suppliers and expenses
        </p>
      </div>

      {/* Summary Cards */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="Total Payments"
              value={summary.totalPayments || 0}
              prefix={<DollarOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Total Received"
              value={summary.totalReceived || 0}
              precision={0}
              prefix="PKR"
              valueStyle={{ color: "#00b96b" }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Total Distributed"
              value={summary.totalDistributed || 0}
              precision={0}
              prefix="PKR"
              valueStyle={{ color: "#1890ff" }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Available for Distribution"
              value={summary.availableForDistribution || 0}
              precision={0}
              prefix="PKR"
              valueStyle={{ color: "#faad14" }}
            />
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={12} md={6} lg={6}>
            <Search
              placeholder="Search payments or customers..."
              allowClear
              enterButton={<SearchOutlined />}
              onChange={handleSearchChange}
              onSearch={handleSearch}
              onClear={handleClearSearch}
            />
          </Col>
          <Col xs={12} sm={6} md={4} lg={3}>
            <Select
              placeholder="Customer"
              style={{ width: "100%" }}
              value={customerFilter}
              onChange={(value) => {
                setCustomerFilter(value);
              }}
              allowClear
              suffixIcon={<UserOutlined />}
              loading={loading}
            >
              <Option value="all">All Customers</Option>
              {customers.map((customer) => (
                <Option key={customer.id} value={customer.id}>
                  {customer.company_name}
                </Option>
              ))}
            </Select>
          </Col>
          <Col xs={12} sm={6} md={4} lg={3}>
            <Select
              placeholder="Payment Method"
              style={{ width: "100%" }}
              value={paymentMethodFilter}
              onChange={(value) => {
                setPaymentMethodFilter(value);
              }}
              allowClear
              loading={loading}
            >
              <Option value="all">All Methods</Option>
              <Option value="cash">Cash</Option>
              <Option value="bank_transfer">Bank Transfer</Option>
              <Option value="cheque">Cheque</Option>
              <Option value="parchi">Parchi</Option>
              <Option value="jazzcash">JazzCash</Option>
              <Option value="easypaisa">Easypaisa</Option>
            </Select>
          </Col>
          <Col xs={12} sm={6} md={4} lg={3}>
            <Select
              placeholder="Status"
              style={{ width: "100%" }}
              value={statusFilter}
              onChange={(value) => {
                setStatusFilter(value);
              }}
              allowClear
              loading={loading}
            >
              <Option value="all">All Status</Option>
              <Option value="pending">Pending</Option>
              <Option value="completed">Completed</Option>
              <Option value="partial">Partial</Option>
              <Option value="cancelled">Cancelled</Option>
            </Select>
          </Col>
          <Col xs={24} sm={12} md={6} lg={6}>
            <RangePicker
              style={{ width: "100%" }}
              format="DD/MM/YYYY"
              onChange={(dates) => {
                setDateRange(dates);
              }}
              disabled={loading}
            />
          </Col>
          <Col xs={24} sm={12} md={4} lg={3}>
            <Space style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button
                icon={<ReloadOutlined />}
                onClick={async () => {
                  setLoading(true);
                  try {
                    const result = await paymentService.getAllPayments();
                    const allPaymentsData = result.payments || [];
                    setAllPayments(allPaymentsData);
                    applyFiltersAndUpdateUI(allPaymentsData);
                    message.success("Payments refreshed");
                  } catch (error) {
                    message.error("Failed to refresh payments");
                  } finally {
                    setLoading(false);
                  }
                }}
                loading={loading}
              >
                Refresh
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleReceivePayment}
                loading={loading}
              >
                Receive Payment
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Payments Table */}
      <Card>
        <Table
          columns={columns}
          dataSource={payments}
          rowKey="id"
          loading={loading}
          onRow={(record) => ({
            onClick: (e) => {
              if (
                (e.target as HTMLElement).closest("button") ||
                (e.target as HTMLElement).closest(".ant-popover") ||
                (e.target as HTMLElement).closest(".ant-popconfirm")
              ) {
                return;
              }
              handleRowClick(record);
            },
            style: { cursor: "pointer" },
          })}
          pagination={{
            ...pagination,
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
          }}
          onChange={handleTableChange}
        />
      </Card>

      {/* Receive Payment Modal */}
      <ReceivePaymentModal
        visible={isReceivePaymentModalVisible}
        onCancel={() => setIsReceivePaymentModalVisible(false)}
        onSuccess={async () => {
          setIsReceivePaymentModalVisible(false);
          setLoading(true);
          try {
            const result = await paymentService.getAllPayments();
            const allPaymentsData = result.payments || [];
            setAllPayments(allPaymentsData);
            applyFiltersAndUpdateUI(allPaymentsData);
            message.success("Payment received successfully");
          } catch (error) {
            message.error("Failed to refresh payments");
          } finally {
            setLoading(false);
          }
        }}
      />

      {/* Distribution Modal */}
      <DistributionModal
        visible={isDistributionModalVisible}
        payment={selectedPayment}
        onCancel={() => setIsDistributionModalVisible(false)}
        onSuccess={async () => {
          setIsDistributionModalVisible(false);
          setLoading(true);
          try {
            const result = await paymentService.getAllPayments();
            const allPaymentsData = result.payments || [];
            setAllPayments(allPaymentsData);
            applyFiltersAndUpdateUI(allPaymentsData);
            message.success("Distribution added successfully");
          } catch (error) {
            message.error("Failed to refresh payments");
          } finally {
            setLoading(false);
          }
        }}
      />

      {/* Payment Side Panel */}
      <PaymentSidePanel
        visible={isSidePanelVisible}
        onClose={() => {
          setIsSidePanelVisible(false);
          setSelectedPayment(null);
        }}
        payment={selectedPayment}
        onDistribute={handleAddDistribution}
        onEdit={() => {
          message.info("Edit payment functionality coming soon");
        }}
        onDelete={handleDeletePayment}
        onReload={async () => {
          setLoading(true);
          try {
            const result = await paymentService.getAllPayments();
            const allPaymentsData = result.payments || [];
            setAllPayments(allPaymentsData);
            applyFiltersAndUpdateUI(allPaymentsData);
          } catch (error) {
            message.error("Failed to refresh payments");
          } finally {
            setLoading(false);
          }
        }}
      />
    </div>
  );
};

// Distribution Modal Component
interface DistributionModalProps {
  visible: boolean;
  payment: Payment | null;
  onCancel: () => void;
  onSuccess: () => void;
}

const DistributionModal: React.FC<DistributionModalProps> = ({
  visible,
  payment,
  onCancel,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && payment) {
      form.resetFields();
    }
  }, [visible, payment]);

  const availableAmount = payment
    ? payment.total_received -
      (payment.distributions?.reduce((sum, dist) => sum + dist.amount, 0) || 0)
    : 0;

  const handleSubmit = async (values: any) => {
    if (!payment) return;

    if (values.amount > availableAmount) {
      message.error("Distribution amount cannot exceed available amount");
      return;
    }

    setLoading(true);
    try {
      await paymentService.addDistribution(payment.id, {
        ...values,
        allocation_date: values.allocation_date.format("YYYY-MM-DD"),
      });

      message.success("Distribution added successfully");
      onSuccess();
      onCancel();
    } catch (error: any) {
      console.error("Failed to add distribution:", error);
      message.error(
        `Failed to add distribution: ${error.message || "Unknown error"}`,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    onCancel();
  };

  if (!payment) return null;

  return (
    <Modal
      title="Add Payment Distribution"
      open={visible}
      onCancel={handleCancel}
      footer={null}
      width={600}
      destroyOnClose
    >
      <div
        style={{
          marginBottom: 16,
          padding: 12,
          background: "#f5f5f5",
          borderRadius: 6,
        }}
      >
        <strong>Payment: {payment.payment_number}</strong>
        <br />
        <span>Available for distribution: </span>
        <strong style={{ color: "#00b96b" }}>
          PKR {availableAmount.toLocaleString()}
        </strong>
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          payee_type: "supplier",
          allocation_date: dayjs(),
        }}
      >
        <Form.Item
          name="payee_name"
          label="Payee Name"
          rules={[{ required: true, message: "Please enter payee name" }]}
        >
          <Input placeholder="Enter payee name" />
        </Form.Item>

        <Form.Item
          name="payee_type"
          label="Payee Type"
          rules={[{ required: true, message: "Please select payee type" }]}
        >
          <Select placeholder="Select payee type">
            <Option value="supplier">Supplier</Option>
            <Option value="expense">Expense</Option>
            <Option value="owner">Owner</Option>
            <Option value="other">Other</Option>
          </Select>
        </Form.Item>

        <Form.Item
          name="amount"
          label="Amount"
          rules={[
            { required: true, message: "Please enter amount" },
            {
              type: "number",
              min: 1,
              message: "Amount must be greater than 0",
            },
          ]}
        >
          <InputNumber
            style={{ width: "100%" }}
            placeholder="Enter amount"
            formatter={(value) =>
              `PKR ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
            }
            parser={(value) => value?.replace(/PKR\s?|(,*)/g, "") as any}
          />
        </Form.Item>

        <Form.Item
          name="purpose"
          label="Purpose"
          rules={[{ required: true, message: "Please enter purpose" }]}
        >
          <Input.TextArea
            placeholder="Enter purpose of distribution"
            rows={3}
          />
        </Form.Item>

        <Form.Item
          name="allocation_date"
          label="Distribution Date"
          rules={[
            { required: true, message: "Please select distribution date" },
          ]}
        >
          <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" />
        </Form.Item>

        <Form.Item name="notes" label="Notes">
          <Input.TextArea placeholder="Additional notes (optional)" rows={2} />
        </Form.Item>

        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={loading}>
              Add Distribution
            </Button>
            <Button onClick={handleCancel}>Cancel</Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default Payments;
