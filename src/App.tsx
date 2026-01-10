// src/App.tsx - OPTIMIZED VERSION WITH LAZY LOADING
import React, { useState, useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { ConfigProvider, App as AntApp } from "antd";
import AppLayout from "./components/layout/AppLayout";
import LandingPage from "./pages/LandingPage";
import Login from "./pages/Login";
import Register from "./pages/Register";
import LoadingSpinner from "./components/common/LoadingSpinner";
import { supabase } from "./services/supabaseClient";

// Lazy load all protected pages
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Customers = lazy(() => import("./pages/Customers"));
const CustomerDetails = lazy(() => import("./pages/CustomerDetails"));
const CustomerLedger = lazy(() => import("./pages/CustomerLedger"));
const Invoices = lazy(() => import("./pages/Invoices"));
const Payments = lazy(() => import("./pages/Payments"));
const Discounts = lazy(() => import("./pages/Discounts"));
const Expenses = lazy(() => import("./pages/Expenses"));
const Reports = lazy(() => import("./pages/Reports"));
const Settings = lazy(() => import("./pages/Settings"));
const CreateInvoice = lazy(() => import("./pages/CreateInvoice"));
const SearchResults = lazy(() => import("./pages/SearchResults"));

// Create a wrapper component for routes that need the layout
const LayoutWrapper: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => <AppLayout>{children}</AppLayout>;

// Protected Route component (optimized)
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();

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

  return authenticated ? (
    <Suspense fallback={<LoadingSpinner />}>{children}</Suspense>
  ) : null;
};

// Optimized route component to prevent re-renders
const createProtectedRoute = (Component: React.ComponentType) => (
  <ProtectedRoute>
    <LayoutWrapper>
      <Component />
    </LayoutWrapper>
  </ProtectedRoute>
);

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
            {/* Public Routes (eager loaded - small size) */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Protected Routes (lazy loaded) */}
            <Route
              path="/dashboard"
              element={createProtectedRoute(Dashboard)}
            />
            <Route
              path="/customers"
              element={createProtectedRoute(Customers)}
            />
            <Route
              path="/customers/:id"
              element={createProtectedRoute(CustomerDetails)}
            />
            <Route
              path="/customers/:id/ledger"
              element={createProtectedRoute(CustomerLedger)}
            />
            <Route path="/invoices" element={createProtectedRoute(Invoices)} />
            <Route
              path="/invoices/create"
              element={createProtectedRoute(CreateInvoice)}
            />
            <Route
              path="/invoices/edit/:id"
              element={createProtectedRoute(CreateInvoice)}
            />
            <Route path="/payments" element={createProtectedRoute(Payments)} />
            <Route
              path="/discounts"
              element={createProtectedRoute(Discounts)}
            />
            <Route path="/expenses" element={createProtectedRoute(Expenses)} />
            <Route path="/reports" element={createProtectedRoute(Reports)} />
            <Route path="/settings" element={createProtectedRoute(Settings)} />
            <Route
              path="/search"
              element={createProtectedRoute(SearchResults)}
            />
          </Routes>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
};

export default App;
