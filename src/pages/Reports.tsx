// src/pages/Reports.tsx
import React, { useState } from "react";
import { Card, Tabs, Typography, Button, Space } from "antd";
import {
  FileTextOutlined,
  DollarOutlined,
  BookOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import PartiesBalancesReport from "../components/reports/PartiesBalancesReport";
import PaymentDetailsReport from "../components/reports/PaymentDetailsReport";

const { TabPane } = Tabs;
const { Title, Text } = Typography;

const Reports: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("parties-balances");

  const handleNavigateToCustomerLedger = () => {
    navigate("/customers");
  };

  return (
    <div style={{ padding: "24px" }}>
      <div style={{ marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0 }}>
          Reports
        </Title>
        <Text type="secondary">
          View and analyze financial reports and summaries
        </Text>
      </div>

      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          tabBarExtraContent={
            activeTab === "customer-ledger" ? (
              <Button
                type="primary"
                icon={<ArrowRightOutlined />}
                onClick={handleNavigateToCustomerLedger}
              >
                Go to Customers
              </Button>
            ) : null
          }
        >
          <TabPane
            tab={
              <span>
                <FileTextOutlined />
                Parties Balances
              </span>
            }
            key="parties-balances"
          >
            <PartiesBalancesReport />
          </TabPane>

          <TabPane
            tab={
              <span>
                <DollarOutlined />
                Payments Details
              </span>
            }
            key="payments-details"
          >
            <PaymentDetailsReport />
          </TabPane>

          <TabPane
            tab={
              <span>
                <BookOutlined />
                Customer Ledger
              </span>
            }
            key="customer-ledger"
          >
            <div style={{ padding: "40px 24px", textAlign: "center" }}>
              <FileTextOutlined
                style={{ fontSize: "48px", color: "#1890ff", marginBottom: 16 }}
              />
              <Title level={4}>Customer Ledger Reports</Title>
              <Text
                type="secondary"
                style={{ display: "block", marginBottom: 24 }}
              >
                Customer ledger reports are available for each individual
                customer. You can access them through the Customers page.
              </Text>
              <Space>
                <Button
                  type="primary"
                  icon={<ArrowRightOutlined />}
                  onClick={handleNavigateToCustomerLedger}
                >
                  Go to Customers Page
                </Button>
                <Button onClick={() => navigate("/customers?view=ledgers")}>
                  View All Ledgers
                </Button>
              </Space>
            </div>
          </TabPane>
        </Tabs>
      </Card>
    </div>
  );
};

export default Reports;
