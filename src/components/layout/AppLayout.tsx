// src/components/layout/AppLayout.tsx - FIXED VERSION
import React, { useState, useEffect } from "react";
import {
  Layout,
  Menu,
  Input,
  Button,
  Space,
  Avatar,
  App,
  Dropdown,
} from "antd";
import {
  DashboardOutlined,
  UserOutlined,
  FileTextOutlined,
  CreditCardOutlined,
  PercentageOutlined,
  BarChartOutlined,
  SettingOutlined,
  SearchOutlined,
  MenuOutlined,
  LeftOutlined,
  RightOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../../services/supabaseClient";
import "./AppLayout.css";

const { Header, Sider, Content } = Layout;
const { Search } = Input;

interface AppLayoutProps {
  children: React.ReactNode;
}

interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  company_name?: string;
  avatar_url?: string;
  company_logo_url?: string;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null); // Add this state
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    fetchUserData();

    // Listen for updates
    const handleAvatarUpdate = () => fetchUserData();
    const handleLogoUpdate = () => fetchUserData();

    window.addEventListener("avatar-updated", handleAvatarUpdate);
    window.addEventListener("company-logo-updated", handleLogoUpdate);

    // Auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      fetchUserData();
    });

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("avatar-updated", handleAvatarUpdate);
      window.removeEventListener("company-logo-updated", handleLogoUpdate);
    };
  }, []);

  const fetchUserData = async () => {
    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (authUser) {
        // Fetch user profile with all data
        const { data: profile } = await supabase
          .from("users")
          .select("*")
          .eq("id", authUser.id)
          .single();

        if (profile) {
          setUserProfile({
            id: profile.id,
            email: profile.email,
            full_name: profile.full_name,
            company_name: profile.company_name,
            avatar_url: profile.avatar_url,
            company_logo_url: profile.company_logo_url,
          });

          if (profile.avatar_url) {
            setUserAvatar(`${profile.avatar_url}?t=${Date.now()}`);
          }
          if (profile.company_logo_url) {
            setCompanyLogo(`${profile.company_logo_url}?t=${Date.now()}`);
          }
        } else {
          // If no profile yet, use auth data
          setUserProfile({
            id: authUser.id,
            email: authUser.email || "",
            full_name: authUser.user_metadata?.full_name,
            company_name: authUser.user_metadata?.company_name,
          });
        }
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
    }
  };

  const menuItems = [
    {
      key: "/dashboard",
      icon: <DashboardOutlined />,
      label: "Dashboard",
    },
    {
      key: "/customers",
      icon: <UserOutlined />,
      label: "Customers",
    },
    {
      key: "/invoices",
      icon: <FileTextOutlined />,
      label: "Bill/Invoices",
    },
    {
      key: "/payments",
      icon: <CreditCardOutlined />,
      label: "Payment Management",
    },
    {
      key: "/discounts", // ADD THIS MENU ITEM
      icon: <PercentageOutlined />,
      label: "Discounts",
    },
    {
      key: "/expenses",
      icon: <BarChartOutlined />,
      label: "Expenses",
    },
    {
      key: "/reports",
      icon: <BarChartOutlined />,
      label: "Reports",
    },
    {
      key: "/settings",
      icon: <SettingOutlined />,
      label: "Settings",
    },
  ];

  // Simple direct search
  const handleSearch = (value: string) => {
    const trimmedValue = value.trim();
    if (!trimmedValue) return;

    setSearchLoading(true);

    try {
      const searchQuery = encodeURIComponent(trimmedValue);

      // Navigate to search results page
      navigate(`/search?q=${searchQuery}`);

      // Clear the search input after successful navigation
      setTimeout(() => {
        setSearchValue("");
      }, 100);
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setTimeout(() => setSearchLoading(false), 300);
    }
  };

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && e.currentTarget.value.trim()) {
      e.preventDefault();
      handleSearch(e.currentTarget.value);
    }
  };

  // Also clear input when "allowClear" button is clicked
  const handleClear = () => {
    setSearchValue("");
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      navigate("/login");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  // Dropdown menu items
  const userMenuItems = [
    {
      key: "profile",
      label: "My Profile",
      icon: <UserOutlined />,
      onClick: () => navigate("/settings"),
    },
    {
      key: "logout",
      label: "Logout",
      icon: <LogoutOutlined />,
      onClick: handleLogout,
    },
  ];

  return (
    <Layout className="app-layout">
      {/* Top Header */}
      <Header className="main-header">
        <div className="header-left">
          <div className="company-info">
            <div
              className="company-logo"
              style={{
                background: companyLogo
                  ? "transparent"
                  : "linear-gradient(135deg, #00b96b 0%, #00a05a 100%)",
                overflow: "hidden",
              }}
            >
              {companyLogo ? (
                <img
                  src={companyLogo}
                  alt="Company Logo"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <span style={{ color: "white", fontWeight: "bold" }}>ADR</span>
              )}
            </div>
            <div className="company-details">
              <div className="company-name">
                {userProfile?.company_name || "Ahsan Dogar Rubber Works"}
              </div>
              <div className="company-subtitle">Professional Accounting</div>
            </div>
          </div>
        </div>

        <div className="header-center">
          <div className="search-container">
            <Search
              placeholder="Search customers, invoices, payments..."
              allowClear
              enterButton={<SearchOutlined />}
              size="large"
              className="global-search"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onSearch={handleSearch}
              onKeyDown={handleKeyDown}
              loading={searchLoading}
              onClear={handleClear}
            />
          </div>
        </div>

        <div className="header-right">
          <Space size="middle">
            <Button
              type="text"
              icon={<SettingOutlined />}
              className="header-icon"
              onClick={() => navigate("/settings")}
            />
            <Dropdown
              menu={{ items: userMenuItems }}
              placement="bottomRight"
              arrow
            >
              <Avatar
                src={userAvatar}
                icon={!userAvatar && <UserOutlined />}
                className="user-avatar"
                style={{ cursor: "pointer" }}
              />
            </Dropdown>
          </Space>
        </div>
      </Header>

      <Layout className="content-layout">
        {/* Sidebar */}
        <Sider
          trigger={null}
          collapsible
          collapsed={collapsed}
          className="app-sidebar"
          width={250}
          collapsedWidth={80}
        >
          <div className="sidebar-toggle-container">
            <Button
              type="text"
              icon={collapsed ? <RightOutlined /> : <LeftOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              className="sidebar-toggle-btn"
            />
          </div>

          <div className="sidebar-controls">
            <Button
              type="text"
              icon={<MenuOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              className="sidebar-menu-btn"
            />
          </div>

          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
            className="sidebar-menu"
          />
        </Sider>

        {/* Main Content Area */}
        <Layout style={{ background: "transparent" }}>
          <Content className="main-content">
            <div className="content-wrapper">{children}</div>
          </Content>
        </Layout>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
