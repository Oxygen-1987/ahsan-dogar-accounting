// src/pages/SearchResults.tsx
import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Card,
  List,
  Typography,
  Tag,
  Space,
  Button,
  Empty,
  Spin,
  Tabs,
  Input,
} from "antd";
import {
  TeamOutlined,
  FileTextOutlined,
  DollarOutlined,
  SearchOutlined,
  ArrowLeftOutlined,
} from "@ant-design/icons";
import type { SearchResult } from "../services/searchService";
import { searchService } from "../services/searchService";

const { Title, Text } = Typography;
const { Search } = Input;
const { TabPane } = Tabs;

const SearchResults: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const query = searchParams.get("q") || "";
  const type = searchParams.get("type") || "all";

  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState(query);

  useEffect(() => {
    if (query) {
      performSearch(query, type as any);
    }
  }, [query, type]);

  const performSearch = async (q: string, t: string) => {
    setLoading(true);
    try {
      let searchResults: SearchResult[] = [];

      if (t === "all") {
        searchResults = await searchService.globalSearch(q);
      } else {
        const types = [t as "customer" | "invoice" | "payment"];
        searchResults = await searchService.searchWithFilters(q, { types });
      }

      // Sort by score if needed
      searchResults.sort((a, b) => b.score - a.score);
      setResults(searchResults);

      // Show message if no results
      if (searchResults.length === 0 && q.trim()) {
        message.info(`No results found for "${q}"`);
      }
    } catch (error) {
      console.error("Search error:", error);
      message.error("Search failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (value: string) => {
    navigate(`/search?q=${encodeURIComponent(value)}&type=${type}`);
  };

  const handleTypeChange = (key: string) => {
    navigate(`/search?q=${encodeURIComponent(query)}&type=${key}`);
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

  return (
    <div style={{ padding: "24px" }}>
      <Card>
        <Space direction="vertical" style={{ width: "100%" }} size="large">
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate(-1)}
            />
            <Title level={3} style={{ margin: 0 }}>
              Search Results
            </Title>
          </div>

          {/* Search Bar */}
          <Search
            placeholder="Search customers, invoices, payments..."
            allowClear
            size="large"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onSearch={handleSearch}
            enterButton={
              <Button type="primary" icon={<SearchOutlined />}>
                Search
              </Button>
            }
            style={{ maxWidth: 600 }}
          />

          {/* Tabs */}
          <Tabs activeKey={type} onChange={handleTypeChange}>
            <TabPane
              tab={
                <span>
                  <TeamOutlined />
                  All Results
                </span>
              }
              key="all"
            />
            <TabPane
              tab={
                <span>
                  <TeamOutlined />
                  Customers
                </span>
              }
              key="customer"
            />
            <TabPane
              tab={
                <span>
                  <FileTextOutlined />
                  Invoices
                </span>
              }
              key="invoice"
            />
            <TabPane
              tab={
                <span>
                  <DollarOutlined />
                  Payments
                </span>
              }
              key="payment"
            />
          </Tabs>

          {/* Results */}
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <Spin size="large" />
            </div>
          ) : results.length > 0 ? (
            <List
              dataSource={results}
              renderItem={(result) => (
                <List.Item
                  style={{
                    padding: "16px",
                    borderBottom: "1px solid #f0f0f0",
                    cursor: "pointer",
                  }}
                  onClick={() => navigate(result.route)}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      width: "100%",
                    }}
                  >
                    <div style={{ marginRight: 16 }}>
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
                        <Text strong style={{ fontSize: 16 }}>
                          {result.title}
                        </Text>
                        <Tag
                          color={getTypeColor(result.type)}
                          style={{ marginLeft: 8 }}
                        >
                          {result.type.toUpperCase()}
                        </Tag>
                      </div>
                      <Text type="secondary">{result.description}</Text>
                    </div>
                  </div>
                </List.Item>
              )}
            />
          ) : query ? (
            <Empty
              description={
                <div>
                  <div>No results found for "{query}"</div>
                  <div style={{ fontSize: 14, color: "#999", marginTop: 8 }}>
                    Try different keywords or check your spelling
                  </div>
                </div>
              }
              style={{ padding: "40px 0" }}
            />
          ) : (
            <Empty
              description="Enter a search term to find customers, invoices, or payments"
              style={{ padding: "40px 0" }}
            />
          )}
        </Space>
      </Card>
    </div>
  );
};

export default SearchResults;
