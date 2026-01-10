import React, { useState, useEffect } from "react";
import {
  Table,
  Card,
  Button,
  Space,
  Input,
  Modal,
  Form,
  DatePicker,
  InputNumber,
  Select,
  App,
  Typography,
  Tag,
  Popconfirm,
  Alert,
} from "antd";
import {
  PlusOutlined,
  SearchOutlined,
  DeleteOutlined,
  EditOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import { discountService } from "../services/discountService";
import { customerService } from "../services/customerService";
import type { DiscountEntry, Customer } from "../types";
import dayjs from "dayjs";

const { Title } = Typography;
const { Search } = Input;
const { Option } = Select;

const Discounts: React.FC = () => {
  const { message } = App.useApp();
  const [discounts, setDiscounts] = useState<DiscountEntry[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<DiscountEntry | null>(
    null
  );
  const [form] = Form.useForm();

  // New state for customer outstanding balance
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );
  const [outstandingBalance, setOutstandingBalance] = useState(0);
  const [loadingBalance, setLoadingBalance] = useState(false);

  useEffect(() => {
    loadDiscounts();
    loadCustomers();
  }, []);

  const loadDiscounts = async () => {
    setLoading(true);
    try {
      const discountData = await discountService.getAllDiscounts();
      setDiscounts(discountData);
    } catch (error) {
      message.error("Failed to load discounts");
      console.error("Error loading discounts:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadCustomers = async () => {
    try {
      const { customers: allCustomers } =
        await customerService.getAllCustomers();
      setCustomers(allCustomers);
    } catch (error) {
      console.error("Error loading customers:", error);
    }
  };

  // Load customer outstanding balance
  const loadCustomerOutstandingBalance = async (customerId: string) => {
    try {
      setLoadingBalance(true);
      const balance = await customerService.getCustomerOutstandingBalance(
        customerId
      );
      setOutstandingBalance(balance);
      console.log(`Outstanding balance for discount modal: PKR ${balance}`);
    } catch (error) {
      console.error("Failed to load customer balance:", error);
      message.error("Failed to load customer balance");
    } finally {
      setLoadingBalance(false);
    }
  };

  // Handle customer change in form
  const handleCustomerChange = async (customerId: string) => {
    console.log("Customer changed to ID:", customerId);

    if (!customerId) {
      setSelectedCustomer(null);
      setOutstandingBalance(0);
      return;
    }

    try {
      const customer = customers.find((c) => c.id === customerId);
      setSelectedCustomer(customer || null);

      if (customerId) {
        await loadCustomerOutstandingBalance(customerId);
      }
    } catch (error) {
      console.error("Error in handleCustomerChange:", error);
      message.error("Failed to load customer data");
    }
  };

  const handleCreateDiscount = async (values: any) => {
    const discountAmount = values.amount || 0;

    if (discountAmount === 0) {
      message.error("Please enter a discount amount");
      return;
    }

    // Validate discount doesn't exceed outstanding balance
    if (discountAmount > outstandingBalance) {
      message.error(
        `Discount amount (PKR ${discountAmount.toLocaleString()}) cannot exceed customer's outstanding balance (PKR ${outstandingBalance.toLocaleString()})`
      );
      return;
    }

    try {
      await discountService.createDiscount({
        customer_id: values.customer_id,
        amount: discountAmount,
        reason: values.reason,
        date: values.date.format("YYYY-MM-DD"),
        invoice_id: values.invoice_id || undefined,
      });

      message.success("Discount created successfully");
      setModalVisible(false);
      form.resetFields();
      setEditingDiscount(null);
      setSelectedCustomer(null);
      setOutstandingBalance(0);
      loadDiscounts();
    } catch (error: any) {
      message.error(`Failed to create discount: ${error.message}`);
    }
  };

  const handleEditDiscount = (discount: DiscountEntry) => {
    setEditingDiscount(discount);

    // Find the customer for this discount
    const customer = customers.find((c) => c.id === discount.customer_id);
    setSelectedCustomer(customer || null);

    // Load the balance for this customer
    if (discount.customer_id) {
      loadCustomerOutstandingBalance(discount.customer_id);
    }

    form.setFieldsValue({
      customer_id: discount.customer_id,
      amount: discount.amount,
      reason: discount.reason,
      date: dayjs(discount.date),
      invoice_id: discount.invoice_id || undefined,
    });
    setModalVisible(true);
  };

  const handleUpdateDiscount = async (values: any) => {
    if (!editingDiscount) return;

    const discountAmount = values.amount || 0;

    // Validate discount doesn't exceed outstanding balance (for new amount)
    if (discountAmount > outstandingBalance) {
      message.error(
        `Discount amount (PKR ${discountAmount.toLocaleString()}) cannot exceed customer's outstanding balance (PKR ${outstandingBalance.toLocaleString()})`
      );
      return;
    }

    try {
      await discountService.updateDiscount(editingDiscount.id, {
        amount: discountAmount,
        reason: values.reason,
        date: values.date.format("YYYY-MM-DD"),
      });

      message.success("Discount updated successfully");
      setModalVisible(false);
      form.resetFields();
      setEditingDiscount(null);
      setSelectedCustomer(null);
      setOutstandingBalance(0);
      loadDiscounts();
    } catch (error: any) {
      message.error(`Failed to update discount: ${error.message}`);
    }
  };

  const handleDeleteDiscount = async (discountId: string) => {
    try {
      await discountService.deleteDiscount(discountId);
      message.success("Discount deleted successfully");
      loadDiscounts();
    } catch (error: any) {
      message.error(`Failed to delete discount: ${error.message}`);
    }
  };

  const columns = [
    {
      title: "Date",
      dataIndex: "date",
      key: "date",
      width: 100,
      render: (date: string) => dayjs(date).format("DD/MM/YYYY"),
      sorter: (a: DiscountEntry, b: DiscountEntry) =>
        dayjs(a.date).valueOf() - dayjs(b.date).valueOf(),
    },
    {
      title: "Customer",
      dataIndex: "customer_name",
      key: "customer_name",
      render: (name: string) => <Tag color="blue">{name}</Tag>,
    },
    {
      title: "Amount",
      dataIndex: "amount",
      key: "amount",
      width: 120,
      render: (amount: number) => (
        <span style={{ color: "#52c41a", fontWeight: "bold" }}>
          PKR {amount.toLocaleString()}
        </span>
      ),
      sorter: (a: DiscountEntry, b: DiscountEntry) => a.amount - b.amount,
    },
    {
      title: "Reason",
      dataIndex: "reason",
      key: "reason",
      render: (reason: string) => reason || "N/A",
    },
    {
      title: "Reference",
      dataIndex: "reference_number",
      key: "reference_number",
      width: 120,
      render: (ref: string) => <Tag color="purple">{ref || "N/A"}</Tag>,
    },
    {
      title: "Action",
      key: "action",
      width: 150,
      render: (_: any, record: DiscountEntry) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEditDiscount(record)}
          >
            Edit
          </Button>
          <Popconfirm
            title="Delete Discount"
            description="Are you sure you want to delete this discount?"
            onConfirm={() => handleDeleteDiscount(record.id)}
            okText="Delete"
            cancelText="Cancel"
            okType="danger"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const filteredDiscounts = discounts.filter(
    (discount) =>
      discount.customer_name
        ?.toLowerCase()
        .includes(searchText.toLowerCase()) ||
      discount.reason?.toLowerCase().includes(searchText.toLowerCase()) ||
      discount.reference_number
        ?.toLowerCase()
        .includes(searchText.toLowerCase())
  );

  const totalDiscounts = discounts.reduce(
    (sum, discount) => sum + discount.amount,
    0
  );

  // Form validator for discount amount
  const validateDiscountAmount = (_: any, value: number) => {
    if (!value || value <= 0) {
      return Promise.reject(
        new Error("Please enter a valid discount amount greater than 0")
      );
    }

    if (value > outstandingBalance) {
      return Promise.reject(
        new Error(
          `Discount cannot exceed outstanding balance of PKR ${outstandingBalance.toLocaleString()}`
        )
      );
    }

    return Promise.resolve();
  };

  return (
    <div style={{ padding: "24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0 }}>
          Discounts
        </Title>
      </div>

      {/* Summary Card */}
      <Card style={{ marginBottom: 24 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <Title level={4} style={{ margin: 0 }}>
              Total Discounts:{" "}
              <span style={{ color: "#52c41a" }}>
                PKR {totalDiscounts.toLocaleString()}
              </span>
            </Title>
            <div style={{ color: "#666", fontSize: "14px" }}>
              {discounts.length} discount(s) recorded
            </div>
          </div>
        </div>
      </Card>

      {/* Filters and Actions */}
      <Card style={{ marginBottom: 24 }} bodyStyle={{ padding: "16px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <Search
            placeholder="Search discounts by customer, reason, reference..."
            allowClear
            style={{ width: 400 }}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            prefix={<SearchOutlined />}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingDiscount(null);
              form.resetFields();
              form.setFieldsValue({
                date: dayjs(),
              });
              setSelectedCustomer(null);
              setOutstandingBalance(0);
              setModalVisible(true);
            }}
          >
            Create Discount
          </Button>
        </div>

        {/* Discounts Table */}
        <Table
          columns={columns}
          dataSource={filteredDiscounts}
          loading={loading}
          rowKey="id"
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) =>
              `${range[0]}-${range[1]} of ${total} discounts`,
          }}
          locale={{
            emptyText: "No discounts found",
          }}
        />
      </Card>

      {/* Create/Edit Discount Modal */}
      <Modal
        title={editingDiscount ? "Edit Discount" : "Create Discount"}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
          setEditingDiscount(null);
          setSelectedCustomer(null);
          setOutstandingBalance(0);
        }}
        onOk={() => form.submit()}
        okText={editingDiscount ? "Update" : "Create"}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={
            editingDiscount ? handleUpdateDiscount : handleCreateDiscount
          }
          initialValues={{
            date: dayjs(),
          }}
        >
          <Form.Item
            name="customer_id"
            label="Customer"
            rules={[{ required: true, message: "Please select a customer" }]}
          >
            <Select
              placeholder="Select customer"
              showSearch
              optionFilterProp="children"
              filterOption={(input, option) =>
                (option?.children as string)
                  .toLowerCase()
                  .includes(input.toLowerCase())
              }
              onChange={handleCustomerChange}
              disabled={!!editingDiscount}
            >
              {customers.map((customer) => (
                <Option key={customer.id} value={customer.id}>
                  {customer.company_name} ({customer.first_name}{" "}
                  {customer.last_name})
                </Option>
              ))}
            </Select>
          </Form.Item>

          {/* Customer Balance Card - Show when customer is selected */}
          {selectedCustomer && (
            <Card size="small" style={{ marginBottom: 16 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div>
                    <strong>{selectedCustomer.company_name}</strong>
                  </div>
                  <div>
                    Outstanding Balance:{" "}
                    <strong
                      style={{
                        color: outstandingBalance > 0 ? "#ff4d4f" : "#00b96b",
                      }}
                    >
                      PKR {outstandingBalance.toLocaleString()}
                    </strong>
                  </div>
                  {loadingBalance && (
                    <div style={{ fontSize: "12px", color: "#666" }}>
                      Loading balance...
                    </div>
                  )}
                </div>
                <InfoCircleOutlined style={{ color: "#1890ff" }} />
              </div>
            </Card>
          )}

          <Form.Item
            name="amount"
            label="Discount Amount"
            rules={[
              { required: true, message: "Please enter discount amount" },
              { validator: validateDiscountAmount },
            ]}
          >
            <InputNumber
              style={{ width: "100%" }}
              placeholder="Enter discount amount"
              min={1}
              max={outstandingBalance}
              addonBefore="PKR"
              formatter={(value) =>
                value ? `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : ""
              }
              parser={(value) => {
                if (value === undefined || value === null || value === "")
                  return "";
                const parsed = value.replace(/,/g, "");
                return isNaN(parseFloat(parsed)) ? "" : parseFloat(parsed);
              }}
              disabled={!selectedCustomer}
            />
          </Form.Item>

          {selectedCustomer && (
            <div style={{ fontSize: "12px", color: "#666", marginBottom: 16 }}>
              Maximum allowed: PKR {outstandingBalance.toLocaleString()}
            </div>
          )}

          <Form.Item
            name="reason"
            label="Reason"
            rules={[
              { required: true, message: "Please enter reason for discount" },
            ]}
          >
            <Input.TextArea placeholder="Enter reason for discount" rows={3} />
          </Form.Item>

          <Form.Item
            name="date"
            label="Date"
            rules={[{ required: true, message: "Please select date" }]}
          >
            <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" />
          </Form.Item>

          <Form.Item
            name="invoice_id"
            label="Invoice (Optional)"
            help="Leave empty if discount is not for a specific invoice"
          >
            <Input placeholder="Enter invoice ID (optional)" />
          </Form.Item>

          {/* Warnings/Alerts */}
          {selectedCustomer && outstandingBalance === 0 && (
            <Alert
              message="No Outstanding Balance"
              description="This customer has no outstanding balance. You can still record a discount if needed."
              type="info"
              showIcon
              style={{ marginTop: 16 }}
            />
          )}

          {selectedCustomer && outstandingBalance < 0 && (
            <Alert
              message="Credit Balance"
              description={`This customer has a credit balance of PKR ${Math.abs(
                outstandingBalance
              ).toLocaleString()}. Recording a discount will increase their credit.`}
              type="warning"
              showIcon
              style={{ marginTop: 16 }}
            />
          )}
        </Form>
      </Modal>
    </div>
  );
};

export default Discounts;
