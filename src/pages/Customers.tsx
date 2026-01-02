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
  type MenuProps,
  App,
  Grid,
  Tag,
  Typography,
  Drawer,
} from "antd";
import {
  PlusOutlined,
  EyeOutlined,
  EditOutlined,
  DeleteOutlined,
  DownOutlined,
  DollarOutlined,
  SearchOutlined,
  PhoneOutlined,
  UserOutlined,
  MoreOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { Customer, CustomerFormData } from "../types";
import { customerService } from "../services/customerService";
import CustomerSidePanel from "../components/customers/CustomerSidePanel";
import SupabaseSetupHelper from "../components/common/SupabaseSetupHelper";
import LoadingSpinner from "../components/common/LoadingSpinner";
import { useNavigate } from "react-router-dom";
import ReceivePaymentModal from "../components/payments/ReceivePaymentModal";
import "./Customers.css";

const { Search } = Input;
const { useBreakpoint } = Grid;
const { Title, Text } = Typography;

const Customers: React.FC = () => {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const screens = useBreakpoint();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidePanelVisible, setSidePanelVisible] = useState(false);
  const [receivePaymentModalVisible, setReceivePaymentModalVisible] =
    useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [searchText, setSearchText] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);
  const [mobileDrawerVisible, setMobileDrawerVisible] = useState(false);
  const [summary, setSummary] = useState({
    totalClients: 0,
    totalOutstanding: 0,
    totalOpenInvoices: 0,
    totalPaid: 0,
  });

  // Load customers data
  const loadCustomers = async () => {
    setLoading(true);
    try {
      const { customers: customersData, summary: summaryData } =
        await customerService.getAllCustomers();
      setCustomers(customersData);
      setSummary(summaryData);
    } catch (error) {
      message.error("Failed to load customers");
      console.error("Error loading customers:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  // Handle new customer
  const handleNewCustomer = () => {
    setEditingCustomer(null);
    setSidePanelVisible(true);
  };

  // Handle edit customer
  const handleEditCustomer = (customer: Customer) => {
    setEditingCustomer(customer);
    setSidePanelVisible(true);
  };

  // Handle save customer
  const handleSaveCustomer = async (data: CustomerFormData) => {
    setSaveLoading(true);
    try {
      if (editingCustomer) {
        await customerService.updateCustomer(editingCustomer.id, data);
        message.success("Customer updated successfully");
      } else {
        await customerService.createCustomer(data);
        message.success("Customer created successfully");
      }
      setSidePanelVisible(false);
      await loadCustomers(); // Wait for refresh
    } catch (error) {
      message.error(
        `Failed to ${editingCustomer ? "update" : "create"} customer`
      );
      console.error("Error saving customer:", error);
    } finally {
      setSaveLoading(false);
    }
  };

  // NEW: Enhanced delete customer with pre-check
  const handleDeleteCustomer = async (
    customerId: string,
    customerName: string
  ) => {
    try {
      // First check if customer can be deleted
      const canDeleteResult = await customerService.canDeleteCustomer(
        customerId
      );

      if (!canDeleteResult.canDelete) {
        const { confirm } = Modal;
        confirm({
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
                Cannot delete <strong>{customerName}</strong>
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
                Please delete all related invoices, payments, and ledger entries
                before deleting the customer.
              </div>
            </div>
          ),
          okText: "OK",
          cancelText: null,
          centered: true,
          width: screens.xs ? "90%" : 500,
          styles: {
            body: { padding: "0" },
          },
        });
        return;
      }

      // If customer can be deleted, show confirmation
      const { confirm } = Modal;
      confirm({
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
              {customerName}
            </div>
            <div style={{ color: "#999", marginTop: "8px" }}>
              This action cannot be undone.
            </div>
          </div>
        ),
        okText: "Delete",
        okType: "danger",
        cancelText: "Cancel",
        onOk: async () => {
          try {
            await customerService.deleteCustomer(customerId);
            message.success("Customer deleted successfully");
            await loadCustomers(); // Refresh the list
          } catch (error: any) {
            console.error("Error deleting customer:", error);

            // Show detailed error message
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
                    Note: Customers with invoices, payments, or ledger entries
                    cannot be deleted.
                  </div>
                </div>
              ),
              centered: true,
              width: screens.xs ? "90%" : 500,
            });
          }
        },
        centered: true,
        width: screens.xs ? "90%" : 400,
        styles: {
          body: { padding: "0" },
        },
      });
    } catch (error) {
      console.error("Error in delete process:", error);
      message.error("Failed to check customer status");
    }
  };

  // Handle receive payment
  const handleReceivePayment = (customer: Customer) => {
    setSelectedCustomer(customer);
    setReceivePaymentModalVisible(true);
  };

  // Handle payment received
  const handlePaymentReceived = () => {
    message.success("Payment recorded successfully");
    setReceivePaymentModalVisible(false);
    loadCustomers(); // Refresh customer list
  };

  // Action dropdown menu - UPDATED
  const getActionMenu = (customer: Customer): MenuProps => ({
    items: [
      {
        key: "view-ledger",
        label: "View Ledger",
        icon: <EyeOutlined />,
        onClick: () => navigate(`/customers/${customer.id}/ledger`),
      },
      {
        key: "view",
        label: "View Details",
        icon: <EyeOutlined />,
        onClick: () => navigate(`/customers/${customer.id}`),
      },
      {
        key: "edit",
        label: "Edit",
        icon: <EditOutlined />,
        onClick: () => handleEditCustomer(customer),
      },
      {
        type: "divider",
      },
      {
        key: "delete",
        label: "Delete",
        icon: <DeleteOutlined />,
        danger: true,
        onClick: () => handleDeleteCustomer(customer.id, customer.company_name),
      },
    ],
  });

  // Mobile card render for customer
  const renderMobileCustomerCard = (customer: Customer) => (
    <Card
      key={customer.id}
      className="mobile-customer-card"
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/customers/${customer.id}`);
      }}
      style={{ marginBottom: 12, cursor: "pointer" }}
    >
      <div className="mobile-customer-content">
        <div className="mobile-customer-header">
          <div className="mobile-customer-title">
            <Text strong style={{ fontSize: "16px" }}>
              {customer.company_name}
            </Text>
            <Tag
              color={customer.status === "active" ? "success" : "default"}
              style={{ fontSize: "11px", padding: "0 6px", height: "20px" }}
            >
              {customer.status}
            </Tag>
          </div>
          <Dropdown
            menu={getActionMenu(customer)}
            trigger={["click"]}
            placement="bottomRight"
            overlayClassName="mobile-customer-dropdown"
          >
            <Button
              type="text"
              icon={<MoreOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
              }}
            />
          </Dropdown>
        </div>

        <div className="mobile-customer-details">
          <div className="mobile-customer-info">
            <UserOutlined style={{ marginRight: 6, color: "#666" }} />
            <Text type="secondary">
              {customer.first_name} {customer.last_name}
            </Text>
          </div>
          <div className="mobile-customer-info">
            <PhoneOutlined style={{ marginRight: 6, color: "#666" }} />
            <Text type="secondary">{customer.mobile}</Text>
          </div>
        </div>

        <div className="mobile-customer-balance">
          <div className="mobile-balance-label">Current Balance:</div>
          <div
            className={`mobile-balance-amount ${
              customer.current_balance > 0
                ? "positive"
                : customer.current_balance < 0
                ? "negative"
                : "zero"
            }`}
          >
            PKR {Math.abs(customer.current_balance || 0).toLocaleString()}
            {customer.current_balance < 0 && " CR"}
          </div>
        </div>

        <div className="mobile-customer-actions">
          <Button
            type="primary"
            size="small"
            icon={<DollarOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              handleReceivePayment(customer);
            }}
            style={{ flex: 1 }}
          >
            Receive Payment
          </Button>
        </div>
      </div>
    </Card>
  );

  // Desktop table columns
  const desktopColumns: ColumnsType<Customer> = [
    {
      title: "Company Name",
      dataIndex: "company_name",
      key: "company_name",
      render: (companyName: string, record: Customer) => (
        <div>
          <div style={{ fontWeight: 500 }}>{companyName}</div>
          <div style={{ fontSize: "12px", color: "#666" }}>
            {record.first_name} {record.last_name}
          </div>
          {/* Add opening balance info */}
          <div style={{ fontSize: "11px", color: "#faad14", marginTop: 2 }}>
            Opening: PKR {(record.opening_balance || 0).toLocaleString()}
          </div>
        </div>
      ),
    },
    {
      title: "Mobile",
      dataIndex: "mobile",
      key: "mobile",
      width: 150,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (status: string) => (
        <Tag color={status === "active" ? "success" : "default"}>{status}</Tag>
      ),
    },
    {
      title: "Current Balance",
      dataIndex: "current_balance",
      key: "current_balance",
      width: 180,
      render: (balance: number) => (
        <span
          className={`balance-display ${
            balance > 0 ? "positive" : balance < 0 ? "negative" : "zero"
          }`}
        >
          PKR {Math.abs(balance || 0).toLocaleString()}
          {balance < 0 && " CR"}
        </span>
      ),
    },
    {
      title: "Actions",
      key: "action",
      width: 250,
      render: (_, record: Customer) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Space>
            <Button
              type="primary"
              size="small"
              icon={<DollarOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                handleReceivePayment(record);
              }}
            >
              Receive Payment
            </Button>
            <Dropdown
              menu={getActionMenu(record)}
              trigger={["click"]}
              placement="bottomRight"
            >
              <Button
                type="text"
                icon={<DownOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
              />
            </Dropdown>
          </Space>
        </div>
      ),
    },
  ];

  // Filter customers based on search
  const filteredCustomers = customers.filter(
    (customer) =>
      customer.company_name?.toLowerCase().includes(searchText.toLowerCase()) ||
      customer.first_name?.toLowerCase().includes(searchText.toLowerCase()) ||
      customer.last_name?.toLowerCase().includes(searchText.toLowerCase()) ||
      customer.mobile?.includes(searchText)
  );

  // Show loading spinner when initially loading
  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="customers-container">
      <SupabaseSetupHelper />

      {/* Summary Cards - Responsive */}
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" className="summary-card">
            <Statistic
              title="Total Clients"
              value={summary.totalClients}
              valueStyle={{
                color: "#00b96b",
                fontSize: screens.xs ? "18px" : "24px",
              }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" className="summary-card">
            <Statistic
              title="Total Outstanding"
              value={summary.totalOutstanding}
              prefix="PKR "
              valueStyle={{
                color: "#cf1322",
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
          <Card size="small" className="summary-card">
            <Statistic
              title="Open Invoices"
              value={summary.totalOpenInvoices}
              valueStyle={{
                color: "#d46b08",
                fontSize: screens.xs ? "18px" : "24px",
              }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" className="summary-card">
            <Statistic
              title="Total Paid"
              value={summary.totalPaid}
              prefix="PKR "
              valueStyle={{
                color: "#389e0d",
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

      {/* Header with Search and Actions - Responsive */}
      <Card className="customers-header-card">
        <div className="customers-header">
          {screens.md ? (
            <>
              <Title level={2} style={{ margin: 0, fontSize: "24px" }}>
                Customers
              </Title>
              <div className="header-controls">
                <Search
                  placeholder="Search customers..."
                  allowClear
                  style={{ width: 300 }}
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  prefix={<SearchOutlined />}
                  size="middle"
                />
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={handleNewCustomer}
                  size="middle"
                >
                  New Customer
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="mobile-header-top">
                <Title level={2} style={{ margin: 0, fontSize: "20px" }}>
                  Customers
                </Title>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={handleNewCustomer}
                  size="small"
                >
                  New
                </Button>
              </div>
              <div className="mobile-header-bottom">
                <Search
                  placeholder="Search customers..."
                  allowClear
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  prefix={<SearchOutlined />}
                  size="middle"
                  style={{ width: "100%" }}
                />
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Customers List - Responsive */}
      <Card className="customers-list-card">
        {screens.md ? (
          // Desktop Table View
          <Table
            columns={desktopColumns}
            dataSource={filteredCustomers}
            rowKey="id"
            loading={loading}
            onRow={(record) => ({
              onClick: () => {
                navigate(`/customers/${record.id}`);
              },
              style: { cursor: "pointer" },
            })}
            rowClassName="customer-table-row"
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showQuickJumper: !screens.xs,
              showTotal: (total, range) =>
                `${range[0]}-${range[1]} of ${total} customers`,
              size: screens.xs ? "small" : "default",
              simple: screens.xs,
            }}
            scroll={{ x: 800 }}
          />
        ) : (
          // Mobile Card View
          <div className="mobile-customers-list">
            {filteredCustomers.length === 0 ? (
              <div className="no-customers">
                <Text type="secondary">No customers found</Text>
              </div>
            ) : (
              filteredCustomers.map(renderMobileCustomerCard)
            )}
          </div>
        )}
      </Card>

      {/* Customer Side Panel */}
      <CustomerSidePanel
        visible={sidePanelVisible}
        onClose={() => setSidePanelVisible(false)}
        onSave={handleSaveCustomer}
        loading={saveLoading}
        customer={editingCustomer}
      />

      {/* Receive Payment Modal */}
      <ReceivePaymentModal
        visible={receivePaymentModalVisible}
        onCancel={() => {
          setReceivePaymentModalVisible(false);
          setSelectedCustomer(null);
        }}
        onSuccess={handlePaymentReceived}
        customer={selectedCustomer}
      />
    </div>
  );
};

export default Customers;
