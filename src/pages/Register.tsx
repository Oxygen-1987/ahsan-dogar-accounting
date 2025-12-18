// src/pages/Register.tsx - CLEAN VERSION WITHOUT BuildingOutlined
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
  Row,
  Col,
  Select,
} from "antd";
import {
  UserOutlined,
  LockOutlined,
  MailOutlined,
  PhoneOutlined,
  HomeOutlined, // Using HomeOutlined instead
} from "@ant-design/icons";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../services/supabaseClient";

const { Title, Text } = Typography;
const { Option } = Select;

const Register: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [form] = Form.useForm();

  const handleRegister = async (values: any) => {
    setLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          data: {
            full_name: values.fullName,
            company_name: values.companyName,
            phone: values.phone,
            user_type: values.userType,
          },
        },
      });

      if (authError) throw authError;

      if (authData.user) {
        message.success(
          "Registration successful! Please check your email to verify your account."
        );
        navigate("/login");
      }
    } catch (error: any) {
      message.error(error.message || "Registration failed. Please try again.");
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
          maxWidth: 500,
          borderRadius: 16,
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.1)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <Title level={3} style={{ marginBottom: 8, color: "#00b96b" }}>
            Create Account
          </Title>
          <Text type="secondary">Join Ahsan Dogar Rubber Works</Text>
        </div>

        <Form
          form={form}
          name="register"
          onFinish={handleRegister}
          layout="vertical"
          size="large"
        >
          <Form.Item
            name="fullName"
            rules={[{ required: true, message: "Please enter your full name" }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="Full Name"
              style={{ borderRadius: 8 }}
            />
          </Form.Item>

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
              style={{ borderRadius: 8 }}
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[
              { required: true, message: "Please enter your password" },
              { min: 6, message: "Password must be at least 6 characters" },
            ]}
            hasFeedback
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="Password"
              style={{ borderRadius: 8 }}
            />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            dependencies={["password"]}
            hasFeedback
            rules={[
              { required: true, message: "Please confirm your password" },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("password") === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error("Passwords do not match"));
                },
              }),
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="Confirm Password"
              style={{ borderRadius: 8 }}
            />
          </Form.Item>

          <Form.Item
            name="companyName"
            rules={[{ required: true, message: "Please enter company name" }]}
          >
            <Input
              prefix={<HomeOutlined />}
              placeholder="Company Name"
              style={{ borderRadius: 8 }}
            />
          </Form.Item>

          <Form.Item
            name="phone"
            rules={[
              { required: true, message: "Please enter your phone number" },
            ]}
          >
            <Input
              prefix={<PhoneOutlined />}
              placeholder="Phone Number"
              style={{ borderRadius: 8 }}
            />
          </Form.Item>

          <Form.Item
            name="userType"
            rules={[{ required: true, message: "Please select user type" }]}
          >
            <Select placeholder="Select User Type" style={{ borderRadius: 8 }}>
              <Option value="owner">Business Owner</Option>
              <Option value="accountant">Accountant</Option>
              <Option value="staff">Staff Member</Option>
            </Select>
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              size="large"
              style={{ borderRadius: 8, height: 45 }}
            >
              Create Account
            </Button>
          </Form.Item>
        </Form>

        <Divider>
          <Text type="secondary">Already have an account?</Text>
        </Divider>

        <div style={{ textAlign: "center" }}>
          <Space direction="vertical" style={{ width: "100%" }}>
            <Link to="/login">
              <Button type="default" block size="large">
                Sign In Instead
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

export default Register;
