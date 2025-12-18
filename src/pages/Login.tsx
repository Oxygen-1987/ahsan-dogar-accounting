// src/pages/Login.tsx - SIMPLIFIED VERSION (NO LEFT SIDE)
import React, { useState } from "react";
import {
  Card,
  Form,
  Input,
  Button,
  Typography,
  Space,
  message,
  Divider,
} from "antd";
import { MailOutlined, LockOutlined, KeyOutlined } from "@ant-design/icons";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../services/supabaseClient";

const { Title, Text } = Typography;

const Login: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [form] = Form.useForm();

  const handleLogin = async (values: { email: string; password: string }) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });

      if (error) throw error;

      if (data.user) {
        message.success("Login successful!");
        navigate("/dashboard");
      }
    } catch (error: any) {
      message.error(
        error.message || "Login failed. Please check your credentials."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #f0f9ff 0%, #e6f7ff 100%)",
        padding: "20px",
      }}
    >
      <Card
        style={{
          width: "100%",
          maxWidth: 450,
          borderRadius: 16,
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.1)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <Title level={3} style={{ marginBottom: 8, color: "#00b96b" }}>
            Ahsan Dogar Rubber Works
          </Title>
          <Text type="secondary">Professional Accounting System</Text>
        </div>

        <Form
          form={form}
          name="login"
          onFinish={handleLogin}
          layout="vertical"
          size="large"
        >
          <Form.Item
            name="email"
            rules={[
              { required: true, message: "Please enter your email" },
              { type: "email", message: "Please enter a valid email" },
            ]}
          >
            <Input
              prefix={<MailOutlined />}
              placeholder="Email address"
              autoComplete="email"
              style={{ borderRadius: 8 }}
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[
              { required: true, message: "Please enter your password" },
              { min: 6, message: "Password must be at least 6 characters" },
            ]}
          >
            <Input.Password
              prefix={<KeyOutlined />}
              placeholder="Password"
              autoComplete="current-password"
              style={{ borderRadius: 8 }}
            />
          </Form.Item>

          <div style={{ textAlign: "right", marginBottom: 24 }}>
            <Link to="/forgot-password">
              <Button type="link" size="small">
                Forgot Password?
              </Button>
            </Link>
          </div>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              size="large"
              style={{ borderRadius: 8, height: 45 }}
            >
              Sign In
            </Button>
          </Form.Item>
        </Form>

        <Divider>
          <Text type="secondary">New to our system?</Text>
        </Divider>

        <div style={{ textAlign: "center" }}>
          <Space direction="vertical" style={{ width: "100%" }}>
            <Link to="/register">
              <Button type="default" block size="large">
                Create New Account
              </Button>
            </Link>

            <Link to="/">
              <Button type="link" size="small">
                ← Back to Home
              </Button>
            </Link>
          </Space>
        </div>
      </Card>
    </div>
  );
};

export default Login;
