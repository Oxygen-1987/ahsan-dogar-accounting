// src/App.tsx - UPDATED VERSION
import React, { useState, useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";
import { ConfigProvider, App as AntApp } from "antd";
import AppLayout from "./components/layout/AppLayout";
import LandingPage from "./pages/LandingPage";
import Login from "./pages/Login"; // Add this import
import Register from "./pages/Register"; // Add this import
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import CustomerDetails from "./pages/CustomerDetails";
import CustomerLedger from "./pages/CustomerLedger";
import Invoices from "./pages/Invoices";
import Payments from "./pages/Payments";
import Expenses from "./pages/Expenses";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import CreateInvoice from "./pages/CreateInvoice";
import SearchResults from "./pages/SearchResults";
import LoadingSpinner from "./components/common/LoadingSpinner";
import { supabase } from "./services/supabaseClient"; // Add this import

// Create a wrapper component for routes that need the layout
const LayoutWrapper: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => <AppLayout>{children}</AppLayout>;

// Protected Route component
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        setAuthenticated(true);
      } else {
        setAuthenticated(false);
        navigate("/login");
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const checkAuth = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        setAuthenticated(true);
      } else {
        navigate("/login");
      }
    } catch (error) {
      console.error("Auth check error:", error);
      navigate("/login");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <LoadingSpinner />
      </div>
    );
  }

  return authenticated ? <>{children}</> : null;
};

const App: React.FC = () => {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#00b96b",
          borderRadius: 8,
        },
      }}
    >
      <AntApp>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Protected Routes */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <LayoutWrapper>
                    <Dashboard />
                  </LayoutWrapper>
                </ProtectedRoute>
              }
            />
            <Route
              path="/customers"
              element={
                <ProtectedRoute>
                  <LayoutWrapper>
                    <Customers />
                  </LayoutWrapper>
                </ProtectedRoute>
              }
            />
            <Route
              path="/customers/:id"
              element={
                <ProtectedRoute>
                  <LayoutWrapper>
                    <CustomerDetails />
                  </LayoutWrapper>
                </ProtectedRoute>
              }
            />
            <Route
              path="/customers/:id/ledger"
              element={
                <ProtectedRoute>
                  <LayoutWrapper>
                    <CustomerLedger />
                  </LayoutWrapper>
                </ProtectedRoute>
              }
            />
            <Route
              path="/invoices"
              element={
                <ProtectedRoute>
                  <LayoutWrapper>
                    <Invoices />
                  </LayoutWrapper>
                </ProtectedRoute>
              }
            />
            <Route
              path="/invoices/create"
              element={
                <ProtectedRoute>
                  <LayoutWrapper>
                    <CreateInvoice />
                  </LayoutWrapper>
                </ProtectedRoute>
              }
            />
            <Route
              path="/invoices/edit/:id"
              element={
                <ProtectedRoute>
                  <LayoutWrapper>
                    <CreateInvoice />
                  </LayoutWrapper>
                </ProtectedRoute>
              }
            />
            <Route
              path="/payments"
              element={
                <ProtectedRoute>
                  <LayoutWrapper>
                    <Payments />
                  </LayoutWrapper>
                </ProtectedRoute>
              }
            />
            <Route
              path="/expenses"
              element={
                <ProtectedRoute>
                  <LayoutWrapper>
                    <Expenses />
                  </LayoutWrapper>
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports"
              element={
                <ProtectedRoute>
                  <LayoutWrapper>
                    <Reports />
                  </LayoutWrapper>
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <LayoutWrapper>
                    <Settings />
                  </LayoutWrapper>
                </ProtectedRoute>
              }
            />
            <Route
              path="/search"
              element={
                <ProtectedRoute>
                  <LayoutWrapper>
                    <SearchResults />
                  </LayoutWrapper>
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
};

export default App;
