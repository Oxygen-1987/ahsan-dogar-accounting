import React, { useState, useEffect } from "react";
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
  App,
} from "antd";
import {
  PlusOutlined,
  SearchOutlined,
  EyeOutlined,
  DollarOutlined,
  ReloadOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { paymentService } from "../services/paymentService";
import type {
  Payment,
  PaymentFormData,
  PaymentMethod,
  PaymentStatus,
} from "../types";
import dayjs from "dayjs";
import ReceivePaymentModal from "../components/payments/ReceivePaymentModal";
import PaymentSidePanel from "../components/payments/PaymentSidePanel";
import LoadingSpinner from "../components/common/LoadingSpinner";

const { Search } = Input;
const { Option } = Select;
const { RangePicker } = DatePicker;

const Payments: React.FC = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<any>({});
  const [searchText, setSearchText] = useState("");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<any>(null);

  // Modals and panels
  const [isReceivePaymentModalVisible, setIsReceivePaymentModalVisible] =
    useState(false);
  const [isAllocationModalVisible, setIsAllocationModalVisible] =
    useState(false);
  const [isSidePanelVisible, setIsSidePanelVisible] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);

  useEffect(() => {
    loadPayments();
  }, []);

  const loadPayments = async () => {
    setLoading(true);
    try {
      const result = await paymentService.getAllPayments();
      setPayments(result.payments);
      setSummary(result.summary);
    } catch (error) {
      console.error("Failed to load payments:", error);
      message.error("Failed to load payments");
      // Set empty arrays on error
      setPayments([]);
      setSummary({});
    } finally {
      setLoading(false);
    }
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
    };
    return colors[status];
  };

  const handleViewPayment = (payment: Payment) => {
    setSelectedPayment(payment);
    setIsSidePanelVisible(true);
  };

  const handleAddAllocation = (payment: Payment) => {
    setSelectedPayment(payment);
    setIsAllocationModalVisible(true);
  };

  const handleReceivePayment = () => {
    setIsReceivePaymentModalVisible(true);
  };

  const handleRowClick = (record: Payment) => {
    handleViewPayment(record);
  };

  // Handle delete payment - simplified version
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

          // Show loading
          const hideLoading = message.loading({
            content: "Deleting payment...",
            key: "deletePayment",
            duration: 0,
          });

          // Delete the payment
          await paymentService.deletePayment(payment.id);

          message.success({
            content: "Payment deleted successfully",
            key: "deletePayment",
            duration: 3,
          });

          // Refresh the payments list
          await loadPayments();

          // Close any open modals/panels showing this payment
          if (selectedPayment?.id === payment.id) {
            setIsSidePanelVisible(false);
            setSelectedPayment(null);
          }
          if (isAllocationModalVisible && selectedPayment?.id === payment.id) {
            setIsAllocationModalVisible(false);
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
    },
    {
      title: "Amount",
      dataIndex: "total_received",
      key: "total_received",
      render: (amount: number) => (
        <span style={{ fontWeight: "bold", color: "#00b96b" }}>
          PKR {amount.toLocaleString()}
        </span>
      ),
    },
    {
      title: "Payment Method",
      dataIndex: "payment_method",
      key: "payment_method",
      render: (method: PaymentMethod) => (
        <Tag color={getPaymentMethodColor(method)}>
          {method.replace("_", " ").toUpperCase()}
        </Tag>
      ),
    },
    {
      title: "Date",
      dataIndex: "payment_date",
      key: "payment_date",
      render: (date: string) => dayjs(date).format("DD/MM/YYYY"),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status: PaymentStatus) => (
        <Tag color={getStatusColor(status)}>{status.toUpperCase()}</Tag>
      ),
    },
    {
      title: "Allocations",
      key: "allocations",
      render: (_, record) => {
        const totalAllocated =
          record.allocations?.reduce((sum, alloc) => sum + alloc.amount, 0) ||
          0;
        const remaining = record.total_received - totalAllocated;

        return (
          <div>
            <div>
              Allocated: <strong>PKR {totalAllocated.toLocaleString()}</strong>
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
        const canAllocate = () => {
          if (
            record.payment_method === "cheque" ||
            record.payment_method === "parchi"
          ) {
            return record.status === "completed" || record.status === "partial";
          }
          // For other payment methods, allow allocation if status is completed OR partial
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
            {canAllocate() && (
              <Button
                icon={<DollarOutlined />}
                size="small"
                type="primary"
                onClick={() => handleAddAllocation(record)}
              >
                Allocate
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

  const filteredPayments = payments.filter((payment) => {
    const matchesSearch =
      payment.payment_number.toLowerCase().includes(searchText.toLowerCase()) ||
      payment.customer?.company_name
        .toLowerCase()
        .includes(searchText.toLowerCase()) ||
      payment.customer?.first_name
        .toLowerCase()
        .includes(searchText.toLowerCase()) ||
      payment.customer?.last_name
        .toLowerCase()
        .includes(searchText.toLowerCase());

    const matchesMethod =
      paymentMethodFilter === "all" ||
      payment.payment_method === paymentMethodFilter;

    const matchesStatus =
      statusFilter === "all" || payment.status === statusFilter;

    const matchesDate =
      !dateRange ||
      (dayjs(payment.payment_date).isAfter(dateRange[0]) &&
        dayjs(payment.payment_date).isBefore(dateRange[1]));

    return matchesSearch && matchesMethod && matchesStatus && matchesDate;
  });

  if (loading && payments.length === 0) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Payment Management</h1>
        <p style={{ margin: 0, color: "#666" }}>
          Receive payments and allocate funds to suppliers and expenses
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
              title="Total Allocated"
              value={summary.totalAllocated || 0}
              precision={0}
              prefix="PKR"
              valueStyle={{ color: "#1890ff" }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Pending Allocation"
              value={summary.pendingAllocation || 0}
              precision={0}
              prefix="PKR"
              valueStyle={{ color: "#faad14" }}
            />
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col span={6}>
            <Search
              placeholder="Search payments..."
              allowClear
              enterButton={<SearchOutlined />}
              onSearch={setSearchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </Col>
          <Col span={4}>
            <Select
              placeholder="Payment Method"
              style={{ width: "100%" }}
              value={paymentMethodFilter}
              onChange={setPaymentMethodFilter}
              allowClear
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
          <Col span={4}>
            <Select
              placeholder="Status"
              style={{ width: "100%" }}
              value={statusFilter}
              onChange={setStatusFilter}
              allowClear
            >
              <Option value="all">All Status</Option>
              <Option value="pending">Pending</Option>
              <Option value="completed">Completed</Option>
              <Option value="partial">Partial</Option> {/* Add this line */}
              <Option value="cancelled">Cancelled</Option>
            </Select>
          </Col>
          <Col span={6}>
            <RangePicker
              style={{ width: "100%" }}
              format="DD/MM/YYYY"
              onChange={setDateRange}
            />
          </Col>
          <Col span={4}>
            <Space>
              <Button
                icon={<ReloadOutlined />}
                onClick={loadPayments}
                loading={loading}
              >
                Refresh
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleReceivePayment}
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
          dataSource={filteredPayments}
          rowKey="id"
          loading={loading}
          onRow={(record) => ({
            onClick: (e) => {
              // Prevent row click when clicking on buttons
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
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
          }}
        />
      </Card>

      {/* Receive Payment Modal */}
      <ReceivePaymentModal
        visible={isReceivePaymentModalVisible}
        onCancel={() => setIsReceivePaymentModalVisible(false)}
        onSuccess={() => {
          loadPayments(); // This refreshes the payments table
          message.success("Payment received successfully");
        }}
      />

      {/* Allocation Modal */}
      <AllocationModal
        visible={isAllocationModalVisible}
        payment={selectedPayment}
        onCancel={() => setIsAllocationModalVisible(false)}
        onSuccess={() => {
          loadPayments();
          setIsAllocationModalVisible(false);
          message.success("Allocation added successfully");
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
        onAllocate={(payment) => {
          setIsSidePanelVisible(false);
          handleAddAllocation(payment);
        }}
        onEdit={() => {
          // Edit functionality can be implemented later
          message.info("Edit payment functionality coming soon");
        }}
        onDelete={handleDeletePayment}
        onReload={loadPayments}
      />
    </div>
  );
};

// Allocation Modal Component (keep the same as before)
interface AllocationModalProps {
  visible: boolean;
  payment: Payment | null;
  onCancel: () => void;
  onSuccess: () => void;
}

const AllocationModal: React.FC<AllocationModalProps> = ({
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
      (payment.allocations?.reduce((sum, alloc) => sum + alloc.amount, 0) || 0)
    : 0;

  const handleSubmit = async (values: any) => {
    if (!payment) return;

    if (values.amount > availableAmount) {
      message.error("Allocation amount cannot exceed available amount");
      return;
    }

    setLoading(true);
    try {
      await paymentService.addAllocation(payment.id, {
        ...values,
        allocation_date: values.allocation_date.format("YYYY-MM-DD"),
      });

      // Show success message
      message.success("Allocation added successfully");

      // Call onSuccess to refresh parent component
      onSuccess();

      // Close the modal
      onCancel();
    } catch (error: any) {
      console.error("Failed to add allocation:", error);
      message.error(
        `Failed to add allocation: ${error.message || "Unknown error"}`
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
      title="Add Payment Allocation"
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
        <span>Available for allocation: </span>
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
          <Input.TextArea placeholder="Enter purpose of allocation" rows={3} />
        </Form.Item>

        <Form.Item
          name="allocation_date"
          label="Allocation Date"
          rules={[{ required: true, message: "Please select allocation date" }]}
        >
          <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" />
        </Form.Item>

        <Form.Item name="notes" label="Notes">
          <Input.TextArea placeholder="Additional notes (optional)" rows={2} />
        </Form.Item>

        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={loading}>
              Add Allocation
            </Button>
            <Button onClick={handleCancel}>Cancel</Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default Payments;
