import React from "react";
import {
  Drawer,
  Form,
  Input,
  Button,
  DatePicker,
  InputNumber,
  Select,
  Row,
  Col,
  Space,
} from "antd";
import type { Customer, CustomerFormData } from "../../types";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

// Extend dayjs with plugins
dayjs.extend(utc);
dayjs.extend(timezone);

const { TextArea } = Input;
const { Option } = Select;

interface CustomerSidePanelProps {
  visible: boolean;
  onClose: () => void;
  onSave: (data: CustomerFormData) => void;
  loading?: boolean;
  customer?: Customer | null;
}

const CustomerSidePanel: React.FC<CustomerSidePanelProps> = ({
  visible,
  onClose,
  onSave,
  loading = false,
  customer = null,
}) => {
  const [form] = Form.useForm();

  const handleSave = async () => {
    try {
      const values = await form.validateFields();

      // Format date properly to YYYY-MM-DD (without timezone)
      const formattedValues = {
        ...values,
        as_of_date: values.as_of_date
          ? values.as_of_date.format("YYYY-MM-DD")
          : dayjs().format("YYYY-MM-DD"),
      };

      console.log("Saving customer with data:", formattedValues);
      onSave(formattedValues);
    } catch (error) {
      console.error("Validation failed:", error);
    }
  };

  const handleClose = () => {
    form.resetFields();
    onClose();
  };

  // Set form values when customer is provided (edit mode)
  React.useEffect(() => {
    if (customer) {
      console.log("Setting form values for edit:", customer);

      // Fix date parsing - handle timezone issues
      const customerDate = customer.as_of_date;
      let parsedDate = dayjs();

      if (customerDate) {
        // Parse date string, assuming it's in YYYY-MM-DD format
        // If it includes timezone info, extract just the date part
        const dateOnly = customerDate.split("T")[0]; // Remove time part if exists
        parsedDate = dayjs(dateOnly, "YYYY-MM-DD");

        console.log("Parsing date:", {
          original: customerDate,
          dateOnly: dateOnly,
          parsed: parsedDate.format("YYYY-MM-DD"),
          isValid: parsedDate.isValid(),
        });
      }

      const formData = {
        ...customer,
        opening_balance: parseFloat(String(customer.opening_balance)) || 0,
        as_of_date: parsedDate.isValid() ? parsedDate : dayjs(),
      };

      console.log("Form data after conversion:", formData);
      form.setFieldsValue(formData);
    } else {
      // New customer - set default values
      const defaultDate = dayjs().startOf("day");
      form.setFieldsValue({
        country: "Pakistan",
        as_of_date: defaultDate,
        opening_balance: 0,
      });
      console.log("Set default form values for new customer");
    }
  }, [customer, form]);

  return (
    <Drawer
      title={customer ? "Edit Customer" : "New Customer"}
      placement="right"
      onClose={handleClose}
      open={visible}
      width={500}
      styles={{
        body: { padding: "16px 0" },
        header: { padding: "16px 24px", borderBottom: "1px solid #f0f0f0" },
        footer: {
          padding: "16px 24px",
          borderTop: "1px solid #f0f0f0",
          display: "flex",
          justifyContent: "flex-end",
          gap: "8px",
        },
      }}
      footer={
        <Space>
          <Button onClick={handleClose}>Cancel</Button>
          <Button type="primary" onClick={handleSave} loading={loading}>
            Save
          </Button>
        </Space>
      }
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark="optional"
        style={{ padding: "0 24px" }}
      >
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          {/* Personal Information */}
          <div>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  label="First Name"
                  name="first_name"
                  rules={[
                    { required: true, message: "Please enter first name" },
                  ]}
                >
                  <Input placeholder="First name" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  label="Last Name"
                  name="last_name"
                  rules={[
                    { required: true, message: "Please enter last name" },
                  ]}
                >
                  <Input placeholder="Last name" />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item
              label="Company Name"
              name="company_name"
              rules={[{ required: true, message: "Please enter company name" }]}
            >
              <Input placeholder="Company name" />
            </Form.Item>
          </div>

          {/* Contact Information */}
          <div>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  label="Mobile Number"
                  name="mobile"
                  rules={[
                    { required: true, message: "Please enter mobile number" },
                  ]}
                >
                  <Input placeholder="Mobile number" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Phone Number" name="phone">
                  <Input placeholder="Phone number" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="Email" name="email">
                  <Input placeholder="Email address" type="email" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Website" name="website">
                  <Input placeholder="Website URL" />
                </Form.Item>
              </Col>
            </Row>
          </div>

          {/* Address Information */}
          <div>
            <Form.Item label="Address" name="address">
              <TextArea placeholder="Enter address" rows={2} />
            </Form.Item>

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="City" name="city">
                  <Input placeholder="City" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="State/Province" name="state">
                  <Input placeholder="State/Province" />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item label="Country" name="country" initialValue="Pakistan">
              <Select>
                <Option value="Pakistan">Pakistan</Option>
                <Option value="Other">Other</Option>
              </Select>
            </Form.Item>
          </div>

          {/* Additional Information */}
          <div>
            <Form.Item label="Notes" name="notes">
              <TextArea placeholder="Enter any notes" rows={3} />
            </Form.Item>

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  label="Opening Balance"
                  name="opening_balance"
                  initialValue={0}
                >
                  <InputNumber
                    style={{ width: "100%" }}
                    placeholder="0.00"
                    min={0}
                    precision={2}
                    formatter={(value) =>
                      `PKR ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
                    }
                    parser={(value) =>
                      value?.replace(/PKR\s?|(,*)/g, "") as any
                    }
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  label="As of Date"
                  name="as_of_date"
                  rules={[{ required: true, message: "Please select date" }]}
                >
                  <DatePicker
                    style={{ width: "100%" }}
                    format="DD/MM/YYYY"
                    placeholder="Select date"
                    disabledDate={(current) =>
                      current && current > dayjs().endOf("day")
                    }
                  />
                </Form.Item>
              </Col>
            </Row>
          </div>
        </Space>
      </Form>
    </Drawer>
  );
};

export default CustomerSidePanel;
