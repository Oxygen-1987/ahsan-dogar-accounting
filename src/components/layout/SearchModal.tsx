// In SearchModal.tsx
import React, { useState, useEffect } from "react";
import {
  Modal,
  Input,
  List,
  Typography,
  Tag,
  Spin,
  Empty,
  Space,
  Button,
  Tabs,
  Card,
} from "antd";
import {
  SearchOutlined,
  TeamOutlined,
  FileTextOutlined,
  DollarOutlined,
  UserOutlined,
  CalendarOutlined,
  RightOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

// Import the service and type separately
import type { SearchResult } from "../../services/searchService";
import { searchService } from "../../services/searchService";

import dayjs from "dayjs";

const { Text, Title } = Typography;
const { Search } = Input;
const { TabPane } = Tabs;

interface SearchModalProps {
  visible: boolean;
  onClose: () => void;
  onSearch?: (query: string) => void;
}

const SearchModal: React.FC<SearchModalProps> = ({
  visible,
  onClose,
  onSearch,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const navigate = useNavigate();

  // Load recent searches from localStorage
  useEffect(() => {
    const recent = localStorage.getItem("recentSearches");
    if (recent) {
      setRecentSearches(JSON.parse(recent));
    }
  }, []);

  // Save search to recent searches
  const saveToRecentSearches = (query: string) => {
    if (!query.trim()) return;

    const updated = [
      query,
      ...recentSearches.filter((q) => q.toLowerCase() !== query.toLowerCase()),
    ].slice(0, 10); // Keep only 10 most recent

    setRecentSearches(updated);
    localStorage.setItem("recentSearches", JSON.stringify(updated));
  };

  const handleSearch = async (value: string) => {
    if (!value.trim()) {
      setSearchResults([]);
      return;
    }

    setSearchQuery(value);
    setLoading(true);

    try {
      let results: SearchResult[] = [];

      if (activeTab === "all") {
        results = await searchService.globalSearch(value);
      } else {
        const types = [activeTab as "customer" | "invoice" | "payment"];
        results = await searchService.searchWithFilters(value, { types });
      }

      setSearchResults(results);
      saveToRecentSearches(value);

      if (onSearch) {
        onSearch(value);
      }
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleResultClick = (result: SearchResult) => {
    navigate(result.route);
    onClose();
    setSearchQuery("");
  };

  const handleRecentSearchClick = (query: string) => {
    setSearchQuery(query);
    handleSearch(query);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "customer":
        return <TeamOutlined style={{ color: "#1890ff" }} />;
      case "invoice":
        return <FileTextOutlined style={{ color: "#52c41a" }} />;
      case "payment":
        return <DollarOutlined style={{ color: "#722ed1" }} />;
      default:
        return <SearchOutlined />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "customer":
        return "blue";
      case "invoice":
        return "green";
      case "payment":
        return "purple";
      default:
        return "default";
    }
  };

  const formatDate = (dateString: string) => {
    return dayjs(dateString).format("DD/MM/YYYY");
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    localStorage.removeItem("recentSearches");
  };

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      footer={null}
      width={600}
      closable={true}
      className="global-search-modal"
      style={{ top: 20 }}
      bodyStyle={{ padding: 0 }}
    >
      <div className="search-modal-content">
        {/* Search Input */}
        <div
          style={{ padding: "16px 24px", borderBottom: "1px solid #f0f0f0" }}
        >
          <Search
            placeholder="Search customers, invoices, payments..."
            allowClear
            size="large"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onSearch={handleSearch}
            autoFocus
            enterButton={
              <Button type="primary" icon={<SearchOutlined />}>
                Search
              </Button>
            }
          />
        </div>

        {/* Tabs */}
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          style={{ padding: "0 24px", marginTop: 8 }}
          size="small"
        >
          <TabPane tab="All" key="all" />
          <TabPane tab="Customers" key="customer" />
          <TabPane tab="Invoices" key="invoice" />
          <TabPane tab="Payments" key="payment" />
        </Tabs>

        {/* Search Results */}
        <div style={{ maxHeight: "400px", overflow: "auto" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <Spin size="large" />
              <div style={{ marginTop: 16, color: "#666" }}>Searching...</div>
            </div>
          ) : searchQuery ? (
            searchResults.length > 0 ? (
              <List
                dataSource={searchResults}
                renderItem={(result) => (
                  <List.Item
                    style={{
                      padding: "12px 24px",
                      cursor: "pointer",
                      borderBottom: "1px solid #f5f5f5",
                    }}
                    onClick={() => handleResultClick(result)}
                    className="search-result-item"
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        width: "100%",
                      }}
                    >
                      <div style={{ marginRight: 12 }}>
                        {getIcon(result.type)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            marginBottom: 4,
                          }}
                        >
                          <Text strong style={{ fontSize: 14 }}>
                            {result.title}
                          </Text>
                          <Tag
                            color={getTypeColor(result.type)}
                            style={{ marginLeft: 8, fontSize: 10 }}
                          >
                            {result.type.toUpperCase()}
                          </Tag>
                        </div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {result.description}
                        </Text>
                        {result.data?.created_at && (
                          <div
                            style={{
                              fontSize: 11,
                              color: "#999",
                              marginTop: 2,
                            }}
                          >
                            Created: {formatDate(result.data.created_at)}
                          </div>
                        )}
                      </div>
                      <RightOutlined style={{ color: "#bfbfbf" }} />
                    </div>
                  </List.Item>
                )}
              />
            ) : (
              <Empty
                description={
                  <div>
                    <div>No results found for "{searchQuery}"</div>
                    <div style={{ fontSize: 12, color: "#999", marginTop: 8 }}>
                      Try different keywords or check your spelling
                    </div>
                  </div>
                }
                style={{ padding: "40px 0" }}
              />
            )
          ) : (
            /* Recent Searches */
            <div style={{ padding: "24px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                }}
              >
                <Text strong>Recent Searches</Text>
                {recentSearches.length > 0 && (
                  <Button
                    type="link"
                    size="small"
                    onClick={clearRecentSearches}
                  >
                    Clear all
                  </Button>
                )}
              </div>

              {recentSearches.length > 0 ? (
                <Space wrap>
                  {recentSearches.map((query, index) => (
                    <Button
                      key={index}
                      size="small"
                      icon={<SearchOutlined />}
                      onClick={() => handleRecentSearchClick(query)}
                      style={{ marginBottom: 8 }}
                    >
                      {query}
                    </Button>
                  ))}
                </Space>
              ) : (
                <Empty
                  description="No recent searches"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              )}

              {/* Search Tips */}
              <Card
                size="small"
                title="Search Tips"
                style={{ marginTop: 24 }}
                bodyStyle={{ padding: "12px 16px" }}
              >
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 16,
                    fontSize: 12,
                    color: "#666",
                  }}
                >
                  <li>Use invoice numbers like "INV-2024-001"</li>
                  <li>Use payment numbers like "PAY-2024-001"</li>
                  <li>Search customer names or mobile numbers</li>
                  <li>Filter by type using the tabs above</li>
                </ul>
              </Card>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        {!searchQuery && (
          <div style={{ padding: "16px 24px", borderTop: "1px solid #f0f0f0" }}>
            <Text strong style={{ display: "block", marginBottom: 8 }}>
              Quick Actions
            </Text>
            <Space wrap>
              <Button
                type="primary"
                ghost
                size="small"
                onClick={() => navigate("/customers/new")}
              >
                New Customer
              </Button>
              <Button
                type="primary"
                ghost
                size="small"
                onClick={() => navigate("/invoices/new")}
              >
                New Invoice
              </Button>
              <Button
                type="primary"
                ghost
                size="small"
                onClick={() => navigate("/payments")}
              >
                Record Payment
              </Button>
            </Space>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default SearchModal;
