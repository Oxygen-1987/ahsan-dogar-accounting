// src/pages/Settings.tsx - UPDATED WITH LETTERHEAD TAB
import React, { useState, useEffect } from "react";
import {
  Card,
  Form,
  Input,
  Button,
  Typography,
  Avatar,
  Space,
  message,
  Divider,
  Row,
  Col,
  Select,
  Upload,
  Tabs,
  App,
  Alert,
} from "antd";
import {
  UserOutlined,
  MailOutlined,
  PhoneOutlined,
  HomeOutlined,
  SaveOutlined,
  UploadOutlined,
  LoadingOutlined,
  BuildOutlined,
  BankOutlined,
  // Add these new icons
  FileImageOutlined,
  FileTextOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import { supabase } from "../services/supabaseClient";
import type { RcFile, UploadProps } from "antd/es/upload";
import type { UploadFile } from "antd/es/upload/interface";

const { Title, Text } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;

const Settings: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingLetterhead, setUploadingLetterhead] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [letterheadUrl, setLetterheadUrl] = useState<string | null>(null);
  const [avatarFileList, setAvatarFileList] = useState<UploadFile[]>([]);
  const [logoFileList, setLogoFileList] = useState<UploadFile[]>([]);
  const [letterheadFileList, setLetterheadFileList] = useState<UploadFile[]>(
    []
  );
  const [activeTab, setActiveTab] = useState("profile");
  const [form] = Form.useForm();

  useEffect(() => {
    fetchUserProfile();
  }, []);

  const fetchUserProfile = async () => {
    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (authUser) {
        const { data: profile } = await supabase
          .from("users")
          .select("*")
          .eq("id", authUser.id)
          .single();

        setUser({ ...authUser, ...profile });

        // Set form values
        const formValues: any = {
          email: authUser.email,
          full_name: profile?.full_name || authUser.user_metadata?.full_name,
          company_name:
            profile?.company_name || authUser.user_metadata?.company_name,
          phone: profile?.phone || authUser.user_metadata?.phone,
          user_type: profile?.user_type || authUser.user_metadata?.user_type,
        };
        form.setFieldsValue(formValues);

        // Set avatar URL
        if (profile?.avatar_url) {
          setAvatarUrl(`${profile.avatar_url}?t=${Date.now()}`);
        }

        // Set company logo URL
        if (profile?.company_logo_url) {
          setCompanyLogoUrl(`${profile.company_logo_url}?t=${Date.now()}`);
        }

        // Set letterhead URL
        if (profile?.letterhead_url) {
          setLetterheadUrl(`${profile.letterhead_url}?t=${Date.now()}`);
        }
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
    }
  };

  // Helper function to upsert user
  const upsertUser = async (userData: any) => {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) return;

    try {
      const { error } = await supabase.from("users").upsert(
        {
          id: authUser.id,
          email: userData.email || authUser.email,
          full_name: userData.full_name,
          company_name: userData.company_name,
          phone: userData.phone,
          user_type: userData.user_type,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "id",
        }
      );

      if (error) throw error;
    } catch (error: any) {
      console.error("Error updating user:", error);
      throw error;
    }
  };

  // Handle user avatar upload
  const handleAvatarUpload = async (file: RcFile): Promise<string> => {
    try {
      setUploadingAvatar(true);
      const {
        data: { user: authUser },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!authUser) throw new Error("User not authenticated");

      console.log("Uploading avatar for user:", authUser.id);

      // Create a unique filename with timestamp
      const timestamp = Date.now();
      const fileExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = `avatar-${timestamp}.${fileExt}`;
      const filePath = `${authUser.id}/${fileName}`;

      // Validate file
      const isImage = file.type.startsWith("image/");
      const isLt2M = file.size / 1024 / 1024 < 2;

      if (!isImage) throw new Error("File must be an image");
      if (!isLt2M) throw new Error("Image must be smaller than 2MB");

      // Upload to avatars bucket
      const { data, error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, {
          upsert: true,
          contentType: file.type,
          cacheControl: "3600",
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);

        // If bucket doesn't exist, use base64 fallback
        if (
          uploadError.message.includes("bucket") ||
          uploadError.message.includes("not found")
        ) {
          throw new Error(
            "Storage bucket not configured. Please contact administrator."
          );
        }

        throw uploadError;
      }

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(filePath);

      // Update users table
      const { error: upsertError } = await supabase.from("users").upsert(
        {
          id: authUser.id,
          email: authUser.email || "",
          avatar_url: publicUrl,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "id",
        }
      );

      if (upsertError) {
        console.warn("User table update warning:", upsertError);
      }

      // Update auth user metadata
      await supabase.auth.updateUser({
        data: {
          avatar_url: publicUrl,
          ...(authUser.user_metadata || {}),
        },
      });

      // Save to localStorage as backup
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          localStorage.setItem(
            `avatar_${authUser.id}`,
            e.target.result as string
          );
        }
      };
      reader.readAsDataURL(file);

      // Force refresh with timestamp
      const freshUrl = `${publicUrl}?t=${timestamp}`;
      setAvatarUrl(freshUrl);

      // Dispatch event to update header
      window.dispatchEvent(
        new CustomEvent("avatar-updated", {
          detail: {
            userId: authUser.id,
            avatarUrl: freshUrl,
          },
        })
      );

      message.success("Profile picture updated successfully!");
      return freshUrl;
    } catch (error: any) {
      console.error("Avatar upload error:", error);

      // Fallback to localStorage
      message.warning("Upload failed. Using local storage as fallback.");

      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (authUser) {
        const reader = new FileReader();
        return new Promise((resolve, reject) => {
          reader.onload = () => {
            const base64 = reader.result as string;
            localStorage.setItem(`avatar_${authUser.id}`, base64);
            setAvatarUrl(base64);

            window.dispatchEvent(
              new CustomEvent("avatar-updated", {
                detail: {
                  userId: authUser.id,
                  avatarUrl: base64,
                },
              })
            );

            message.info("Avatar saved locally.");
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      throw error;
    } finally {
      setUploadingAvatar(false);
    }
  };

  // Handle company logo upload
  const handleLogoUpload = async (file: RcFile): Promise<string> => {
    try {
      setUploadingLogo(true);
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) throw new Error("User not authenticated");

      const fileExt = file.name.split(".").pop()?.toLowerCase();
      const fileName = `company-logo.${fileExt}`;
      const filePath = `${authUser.id}/company/${fileName}`;

      // Upload to avatars bucket
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, {
          upsert: true,
          contentType: file.type,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(filePath);

      // Update users table
      await updateCompanyLogo(publicUrl);

      // Trigger header update
      window.dispatchEvent(
        new CustomEvent("company-logo-updated", {
          detail: { logoUrl: `${publicUrl}?t=${Date.now()}` },
        })
      );

      message.success("Company logo updated successfully!");
      return publicUrl;
    } catch (error: any) {
      console.error("Logo upload failed:", error);
      message.error(`Upload failed: ${error.message}`);
      throw error;
    } finally {
      setUploadingLogo(false);
    }
  };

  const updateCompanyLogo = async (logoUrl: string) => {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) return;

    try {
      // First, check if user exists in users table
      const { data: existingUser } = await supabase
        .from("users")
        .select("id, email")
        .eq("id", authUser.id)
        .single();

      if (existingUser) {
        // Update existing user
        const { error } = await supabase
          .from("users")
          .update({
            company_logo_url: logoUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("id", authUser.id);

        if (error) throw error;
      } else {
        // Create new user entry
        const { error } = await supabase.from("users").insert({
          id: authUser.id,
          email: authUser.email,
          company_logo_url: logoUrl,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        if (error) throw error;
      }
    } catch (error: any) {
      console.error("Error updating company logo:", error);
      throw error;
    }
  };

  // Handle letterhead upload
  const handleLetterheadUpload = async (file: RcFile): Promise<string> => {
    try {
      setUploadingLetterhead(true);
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) throw new Error("User not authenticated");

      const fileExt = file.name.split(".").pop()?.toLowerCase();
      const fileName = `letterhead.${fileExt}`;
      const filePath = `${authUser.id}/letterhead/${fileName}`;

      // Upload to avatars bucket
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, {
          upsert: true,
          contentType: file.type,
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        if (uploadError.message.includes("bucket")) {
          message.warning("Please configure storage bucket for letterheads");
        }
        throw uploadError;
      }

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(filePath);

      // Update users table
      await updateLetterhead(publicUrl);

      message.success("Letterhead uploaded successfully!");
      return publicUrl;
    } catch (error: any) {
      console.error("Letterhead upload failed:", error);
      message.error(`Upload failed: ${error.message}`);
      throw error;
    } finally {
      setUploadingLetterhead(false);
    }
  };

  const updateLetterhead = async (letterheadUrl: string) => {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) return;

    try {
      const { error } = await supabase.from("users").upsert(
        {
          id: authUser.id,
          email: authUser.email,
          letterhead_url: letterheadUrl,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "id",
        }
      );

      if (error) throw error;
    } catch (error: any) {
      console.error("Error updating letterhead:", error);
      throw error;
    }
  };

  // Avatar upload props
  const avatarUploadProps: UploadProps = {
    beforeUpload: (file) => {
      const isImage = file.type.startsWith("image/");
      const isLt2M = file.size / 1024 / 1024 < 2;

      if (!isImage) {
        message.error("You can only upload image files!");
        return Upload.LIST_IGNORE;
      }
      if (!isLt2M) {
        message.error("Image must be smaller than 2MB!");
        return Upload.LIST_IGNORE;
      }

      setAvatarFileList([
        { uid: "-1", name: file.name, status: "uploading" } as UploadFile,
      ]);

      handleAvatarUpload(file as RcFile)
        .then((url) => {
          setAvatarUrl(`${url}?t=${Date.now()}`);
          setAvatarFileList([
            { uid: "-1", name: file.name, status: "done", url } as UploadFile,
          ]);
          fetchUserProfile();
        })
        .catch(() => {
          setAvatarFileList([]);
        });

      return false;
    },
    fileList: avatarFileList,
    maxCount: 1,
    accept: "image/*",
    showUploadList: false,
  };

  // Logo upload props
  const logoUploadProps: UploadProps = {
    beforeUpload: (file) => {
      const isImage = file.type.startsWith("image/");
      const isLt5M = file.size / 1024 / 1024 < 5;

      if (!isImage) {
        message.error("You can only upload image files!");
        return Upload.LIST_IGNORE;
      }
      if (!isLt5M) {
        message.error("Image must be smaller than 5MB!");
        return Upload.LIST_IGNORE;
      }

      setLogoFileList([
        { uid: "-1", name: file.name, status: "uploading" } as UploadFile,
      ]);

      handleLogoUpload(file as RcFile)
        .then((url) => {
          setCompanyLogoUrl(`${url}?t=${Date.now()}`);
          setLogoFileList([
            { uid: "-1", name: file.name, status: "done", url } as UploadFile,
          ]);
          fetchUserProfile();
        })
        .catch(() => {
          setLogoFileList([]);
        });

      return false;
    },
    fileList: logoFileList,
    maxCount: 1,
    accept: "image/*",
    showUploadList: false,
  };

  // Letterhead upload props
  const letterheadUploadProps: UploadProps = {
    beforeUpload: (file) => {
      const isImage = file.type.startsWith("image/");
      const isLt5M = file.size / 1024 / 1024 < 5;

      if (!isImage) {
        message.error("You can only upload image files!");
        return Upload.LIST_IGNORE;
      }
      if (!isLt5M) {
        message.error("Image must be smaller than 5MB!");
        return Upload.LIST_IGNORE;
      }

      setLetterheadFileList([
        { uid: "-1", name: file.name, status: "uploading" } as UploadFile,
      ]);

      handleLetterheadUpload(file as RcFile)
        .then((url) => {
          setLetterheadUrl(`${url}?t=${Date.now()}`);
          setLetterheadFileList([
            { uid: "-1", name: file.name, status: "done", url } as UploadFile,
          ]);
          fetchUserProfile();
        })
        .catch(() => {
          setLetterheadFileList([]);
        });

      return false;
    },
    fileList: letterheadFileList,
    maxCount: 1,
    accept: "image/*",
    showUploadList: false,
  };

  const handleSaveProfile = async (values: any) => {
    setLoading(true);
    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (authUser) {
        // Update auth metadata
        await supabase.auth.updateUser({
          data: {
            full_name: values.full_name,
            company_name: values.company_name,
            phone: values.phone,
            user_type: values.user_type,
          },
        });

        // Update users table
        await upsertUser({
          email: values.email || authUser.email,
          full_name: values.full_name,
          company_name: values.company_name,
          phone: values.phone,
          user_type: values.user_type,
        });

        message.success("Profile updated successfully!");
        fetchUserProfile();
      }
    } catch (error: any) {
      message.error(error.message || "Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "24px" }}>
      <Card>
        <Title level={3}>Account Settings</Title>

        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <TabPane tab="Personal Profile" key="profile">
            <Divider />
            <Row gutter={[48, 48]}>
              <Col xs={24} md={8}>
                <div style={{ textAlign: "center" }}>
                  <Avatar
                    size={120}
                    src={avatarUrl}
                    icon={!avatarUrl && <UserOutlined />}
                    style={{ marginBottom: 16 }}
                  />
                  <Title level={4}>{user?.full_name || "User"}</Title>
                  <Text type="secondary">{user?.email}</Text>

                  <Divider />

                  <Upload {...avatarUploadProps}>
                    <Button
                      icon={
                        uploadingAvatar ? (
                          <LoadingOutlined />
                        ) : (
                          <UploadOutlined />
                        )
                      }
                      loading={uploadingAvatar}
                      style={{ marginBottom: 8 }}
                    >
                      {uploadingAvatar
                        ? "Uploading..."
                        : "Change Profile Picture"}
                    </Button>
                  </Upload>

                  <Text
                    type="secondary"
                    style={{ display: "block", fontSize: 12 }}
                  >
                    JPG, PNG up to 2MB
                  </Text>
                </div>
              </Col>

              <Col xs={24} md={16}>
                <Form
                  form={form}
                  onFinish={handleSaveProfile}
                  layout="vertical"
                >
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item
                        name="full_name"
                        label="Full Name"
                        rules={[
                          {
                            required: true,
                            message: "Please enter your full name",
                          },
                        ]}
                      >
                        <Input
                          prefix={<UserOutlined />}
                          placeholder="John Doe"
                        />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        name="email"
                        label="Email"
                        rules={[
                          {
                            required: true,
                            message: "Please enter your email",
                          },
                          {
                            type: "email",
                            message: "Please enter a valid email",
                          },
                        ]}
                      >
                        <Input
                          prefix={<MailOutlined />}
                          placeholder="john@example.com"
                          disabled
                        />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item
                        name="company_name"
                        label="Company Name"
                        rules={[
                          {
                            required: true,
                            message: "Please enter company name",
                          },
                        ]}
                      >
                        <Input
                          prefix={<HomeOutlined />}
                          placeholder="Ahsan Dogar Rubber Works"
                        />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        name="phone"
                        label="Phone Number"
                        rules={[
                          {
                            required: true,
                            message: "Please enter phone number",
                          },
                        ]}
                      >
                        <Input
                          prefix={<PhoneOutlined />}
                          placeholder="+92 300 1234567"
                        />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Form.Item
                    name="user_type"
                    label="User Type"
                    rules={[
                      { required: true, message: "Please select user type" },
                    ]}
                  >
                    <Select placeholder="Select user type">
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
                      icon={<SaveOutlined />}
                      size="large"
                    >
                      Save Changes
                    </Button>
                  </Form.Item>
                </Form>
              </Col>
            </Row>
          </TabPane>

          <TabPane tab="Company Settings" key="company">
            <Divider />
            <Row gutter={[48, 48]}>
              <Col xs={24} md={8}>
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      width: 120,
                      height: 120,
                      margin: "0 auto 16px",
                      borderRadius: "50%",
                      overflow: "hidden",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "#f0f0f0",
                      border: "1px dashed #d9d9d9",
                    }}
                  >
                    {companyLogoUrl ? (
                      <img
                        src={companyLogoUrl}
                        alt="Company Logo"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      <BankOutlined style={{ fontSize: 48, color: "#999" }} />
                    )}
                  </div>
                  <Title level={4}>{user?.company_name || "Company"}</Title>
                  <Text type="secondary">Logo</Text>

                  <Divider />

                  <Upload {...logoUploadProps}>
                    <Button
                      icon={
                        uploadingLogo ? <LoadingOutlined /> : <UploadOutlined />
                      }
                      loading={uploadingLogo}
                      style={{ marginBottom: 8 }}
                    >
                      {uploadingLogo
                        ? "Uploading..."
                        : companyLogoUrl
                        ? "Change Logo"
                        : "Upload Logo"}
                    </Button>
                  </Upload>

                  {companyLogoUrl && (
                    <Button
                      type="link"
                      danger
                      size="small"
                      onClick={async () => {
                        try {
                          const {
                            data: { user: authUser },
                          } = await supabase.auth.getUser();
                          if (authUser) {
                            await supabase
                              .from("users")
                              .update({
                                company_logo_url: null,
                                updated_at: new Date().toISOString(),
                              })
                              .eq("id", authUser.id);

                            setCompanyLogoUrl(null);
                            window.dispatchEvent(
                              new CustomEvent("company-logo-updated", {
                                detail: { logoUrl: null },
                              })
                            );
                            message.success("Company logo removed!");
                          }
                        } catch (error) {
                          message.error("Failed to remove logo");
                        }
                      }}
                    >
                      Remove Logo
                    </Button>
                  )}

                  <Text
                    type="secondary"
                    style={{ display: "block", fontSize: 12, marginTop: 8 }}
                  >
                    JPG, PNG up to 5MB
                  </Text>
                </div>
              </Col>

              <Col xs={24} md={16}>
                <div style={{ marginBottom: 24 }}>
                  <Title level={5}>Company Information</Title>
                  <Text type="secondary">
                    Update your company logo to customize the header and
                    branding.
                  </Text>
                </div>

                <div
                  style={{
                    backgroundColor: "#fafafa",
                    padding: 24,
                    borderRadius: 8,
                    border: "1px solid #f0f0f0",
                    marginBottom: 24,
                  }}
                >
                  <Title level={5}>Preview</Title>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 16,
                      padding: 16,
                      backgroundColor: "white",
                      borderRadius: 8,
                      border: "1px solid #e8e8e8",
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        overflow: "hidden",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: companyLogoUrl
                          ? "transparent"
                          : "linear-gradient(135deg, #00b96b 0%, #00a05a 100%)",
                      }}
                    >
                      {companyLogoUrl ? (
                        <img
                          src={companyLogoUrl}
                          alt="Company Logo"
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        <span
                          style={{
                            color: "white",
                            fontWeight: "bold",
                            fontSize: 14,
                          }}
                        >
                          ADR
                        </span>
                      )}
                    </div>
                    <div>
                      <div
                        style={{
                          fontWeight: "bold",
                          fontSize: 16,
                          color: "#1f2937",
                        }}
                      >
                        {user?.company_name || "Ahsan Dogar Rubber Works"}
                      </div>
                      <div style={{ fontSize: 11, color: "#6b7280" }}>
                        Professional Accounting
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <Title level={5}>Tips</Title>
                  <ul style={{ color: "#666", paddingLeft: 20 }}>
                    <li>Use a square logo for best results</li>
                    <li>Transparent PNG works best</li>
                    <li>Recommended size: 400x400 pixels</li>
                    <li>Logo will appear in header and reports</li>
                  </ul>
                </div>
              </Col>
            </Row>
          </TabPane>

          {/* NEW: Invoice LetterHead Tab */}
          <TabPane tab="Invoice LetterHead" key="letterhead">
            <Divider />
            <Row gutter={[48, 48]}>
              <Col xs={24} md={8}>
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      width: "100%",
                      maxWidth: 300,
                      height: 400,
                      margin: "0 auto 16px",
                      border: "2px dashed #d9d9d9",
                      borderRadius: "8px",
                      overflow: "hidden",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "#fafafa",
                    }}
                  >
                    {letterheadUrl ? (
                      <img
                        src={letterheadUrl}
                        alt="Invoice LetterHead"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "contain",
                        }}
                      />
                    ) : (
                      <div style={{ textAlign: "center", padding: "24px" }}>
                        <FileImageOutlined
                          style={{ fontSize: 64, color: "#999" }}
                        />
                        <div style={{ marginTop: 16, color: "#666" }}>
                          No Letterhead Uploaded
                        </div>
                        <div
                          style={{ fontSize: 12, color: "#999", marginTop: 8 }}
                        >
                          Upload a PNG or JPG file
                        </div>
                      </div>
                    )}
                  </div>

                  <Upload {...letterheadUploadProps}>
                    <Button
                      type="primary"
                      icon={
                        uploadingLetterhead ? (
                          <LoadingOutlined />
                        ) : (
                          <UploadOutlined />
                        )
                      }
                      loading={uploadingLetterhead}
                      style={{ marginBottom: 8 }}
                    >
                      {letterheadUrl
                        ? "Replace Letterhead"
                        : "Upload Letterhead"}
                    </Button>
                  </Upload>

                  <Text
                    type="secondary"
                    style={{ display: "block", fontSize: 12, marginTop: 8 }}
                  >
                    PNG, JPG up to 5MB
                    <br />
                    Recommended: A4 size (210×297mm)
                  </Text>

                  {letterheadUrl && (
                    <Space style={{ marginTop: 16 }}>
                      <Button
                        type="primary"
                        ghost
                        onClick={() => {
                          const link = document.createElement("a");
                          link.href = letterheadUrl;
                          link.download = `letterhead_${new Date().getTime()}.${
                            letterheadUrl.includes(".png") ? "png" : "jpg"
                          }`;
                          link.click();
                        }}
                      >
                        Download
                      </Button>
                      <Button
                        danger
                        onClick={async () => {
                          try {
                            const {
                              data: { user: authUser },
                            } = await supabase.auth.getUser();
                            if (authUser) {
                              await supabase
                                .from("users")
                                .update({
                                  letterhead_url: null,
                                  updated_at: new Date().toISOString(),
                                })
                                .eq("id", authUser.id);

                              setLetterheadUrl(null);
                              message.success("Letterhead removed!");
                            }
                          } catch (error) {
                            message.error("Failed to remove letterhead");
                          }
                        }}
                      >
                        Remove
                      </Button>
                    </Space>
                  )}
                </div>
              </Col>

              <Col xs={24} md={16}>
                <Title level={4}>Letterhead Settings</Title>
                <Text
                  type="secondary"
                  style={{ display: "block", marginBottom: 24 }}
                >
                  Upload a professional letterhead for your invoices. The
                  invoice content will be automatically placed on top of your
                  letterhead.
                </Text>

                <Card title="Preview" style={{ marginBottom: 24 }}>
                  <div
                    style={{
                      position: "relative",
                      width: "100%",
                      height: "400px",
                      border: "1px solid #f0f0f0",
                      overflow: "auto",
                      backgroundColor: "#fff",
                    }}
                  >
                    {letterheadUrl ? (
                      <>
                        <img
                          src={letterheadUrl}
                          alt="Letterhead Preview"
                          style={{
                            width: "100%",
                            height: "auto",
                            position: "absolute",
                            top: 0,
                            left: 0,
                          }}
                        />
                        <div
                          style={{
                            position: "absolute",
                            top: "300px",
                            left: "40px",
                            right: "40px",
                            bottom: "-300px",
                            border: "2px dashed #1890ff",
                            borderRadius: "4px",
                            padding: "20px",
                            backgroundColor: "rgba(24, 144, 255, 0.05)",
                          }}
                        >
                          <div
                            style={{ textAlign: "center", color: "#1890ff" }}
                          >
                            <FileTextOutlined
                              style={{ fontSize: 24, marginBottom: 8 }}
                            />
                            <div>Invoice content will appear here</div>
                            <div style={{ fontSize: 12, marginTop: 4 }}>
                              (This is a preview of where invoice data will be
                              placed)
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          height: "100%",
                          color: "#999",
                        }}
                      >
                        <div style={{ textAlign: "center" }}>
                          <FileImageOutlined
                            style={{ fontSize: 48, marginBottom: 16 }}
                          />
                          <div>Upload a letterhead to see preview</div>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>

                <Card title="Guidelines">
                  <Space direction="vertical" style={{ width: "100%" }}>
                    <Alert
                      message="Design Tips"
                      description={
                        <ul style={{ margin: 0, paddingLeft: 20 }}>
                          <li>Use A4 size (210×297mm) for best results</li>
                          <li>Leave top 80-100px for your company header</li>
                          <li>Leave bottom 40-60px for footer information</li>
                          <li>Keep important content areas clear</li>
                          <li>
                            Use PNG with transparency for professional look
                          </li>
                          <li>Recommended DPI: 300 for print quality</li>
                        </ul>
                      }
                      type="info"
                      showIcon
                    />

                    <Alert
                      message="Content Area"
                      description="Invoice details will be placed starting approximately 100px from the top. Make sure your letterhead design doesn't cover this area."
                      type="warning"
                      showIcon
                    />
                  </Space>
                </Card>
              </Col>
            </Row>
          </TabPane>
        </Tabs>
      </Card>
    </div>
  );
};

export default Settings;
